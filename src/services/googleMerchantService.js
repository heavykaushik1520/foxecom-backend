const axios = require("axios");
const { getGoogleMerchantAccessToken } = require("../utils/googleMerchantAuth");

const MERCHANT_API_BASE = "https://merchantapi.googleapis.com/products/v1";

/**
 * @param {string} priceString e.g. "2249.00 INR"
 * @returns {{ amountMicros: string, currencyCode: string }}
 */
function parsePriceToMicros(priceString) {
  const raw = String(priceString || "").trim();
  const parts = raw.split(/\s+/).filter(Boolean);
  if (parts.length < 2) {
    throw new Error(`Invalid price string (expected "amount CURRENCY"): "${priceString}"`);
  }
  const currencyCode = parts[parts.length - 1].toUpperCase();
  const amountPart = parts.slice(0, -1).join(" ");
  const amount = parseFloat(amountPart);
  if (Number.isNaN(amount) || amount < 0) {
    throw new Error(`Invalid price amount in: "${priceString}"`);
  }
  const amountMicros = Math.round(amount * 1_000_000);
  return {
    amountMicros: String(amountMicros),
    currencyCode,
  };
}

/**
 * Deep-clean plain objects for JSON: drop undefined, null, "", empty arrays.
 * Keeps false and 0. Recurses into plain objects; arrays are filtered then dropped if empty.
 * @param {unknown} obj
 * @returns {unknown}
 */
function cleanAttributes(obj) {
  if (obj === undefined || obj === null) return undefined;
  if (typeof obj === "string") {
    return obj.trim() === "" ? undefined : obj;
  }
  if (typeof obj === "boolean" || typeof obj === "number") {
    return obj;
  }
  if (Array.isArray(obj)) {
    const next = obj
      .map((item) => cleanAttributes(item))
      .filter((item) => item !== undefined && item !== null && item !== "");
    if (next.length === 0) return undefined;
    return next;
  }
  if (typeof obj === "object") {
    /** @type {Record<string, unknown>} */
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      const cleaned = cleanAttributes(v);
      if (cleaned === undefined || cleaned === null) continue;
      if (typeof cleaned === "string" && cleaned.trim() === "") continue;
      if (Array.isArray(cleaned) && cleaned.length === 0) continue;
      if (
        typeof cleaned === "object" &&
        !Array.isArray(cleaned) &&
        Object.keys(cleaned).length === 0
      ) {
        continue;
      }
      out[k] = cleaned;
    }
    if (Object.keys(out).length === 0) return undefined;
    return out;
  }
  return obj;
}

/**
 * Map preview payload (mapProductToGoogleMerchant) → Merchant API ProductInput body.
 * Uses official field `productAttributes` (not legacy `attributes`).
 * @param {Record<string, unknown>} merchantPayload
 * @returns {Record<string, unknown>}
 */
function buildGoogleProductInput(merchantPayload) {
  const p = merchantPayload || {};

  const availabilityMap = {
    in_stock: "IN_STOCK",
    out_of_stock: "OUT_OF_STOCK",
  };
  const rawAvail = String(p.availability || "").toLowerCase();
  const availability =
    availabilityMap[rawAvail] || "OUT_OF_STOCK";

  const conditionMap = {
    new: "NEW",
    used: "USED",
    refurbished: "REFURBISHED",
  };
  const rawCond = String(p.condition || "new").toLowerCase();
  const condition = conditionMap[rawCond] || "NEW";

  /** @type {Record<string, unknown>} */
  const productAttributes = {
    title: p.title,
    description: p.description,
    link: p.link,
    imageLink: p.imageLink,
    availability,
    condition,
    brand: p.brand,
    googleProductCategory: p.googleProductCategory,
  };

  if (p.price) {
    productAttributes.price = parsePriceToMicros(String(p.price));
  }
  if (p.salePrice) {
    productAttributes.salePrice = parsePriceToMicros(String(p.salePrice));
  }

  if (p.productType) {
    productAttributes.productTypes = [String(p.productType)];
  }

  if (p.mpn) productAttributes.mpn = String(p.mpn);
  if (p.color) productAttributes.color = String(p.color);
  if (p.material) productAttributes.material = String(p.material);
  if (p.customLabel0) productAttributes.customLabel0 = String(p.customLabel0);
  if (p.customLabel1) productAttributes.customLabel1 = String(p.customLabel1);

  const cleanedAttrs = cleanAttributes(productAttributes);

  return cleanAttributes({
    offerId: p.offerId != null ? String(p.offerId).trim() : undefined,
    contentLanguage: "en",
    feedLabel: "IN",
    productAttributes: cleanedAttrs,
  });
}

function getMerchantConfig() {
  const accountId =
    process.env.GOOGLE_MERCHANT_ACCOUNT_ID ||
    process.env.GOOGLE_MERCHENT_ACCOUNT_ID;
  const sourceId =
    process.env.GOOGLE_MERCHANT_SOURCE_ID ||
    process.env.GOOGLE_MERCHENT_SOURCE_ID;

  if (!accountId || !String(accountId).trim()) {
    throw new Error(
      "Missing merchant account id. Set GOOGLE_MERCHANT_ACCOUNT_ID (or GOOGLE_MERCHENT_ACCOUNT_ID)."
    );
  }
  if (!sourceId || !String(sourceId).trim()) {
    throw new Error(
      "Missing merchant data source id. Set GOOGLE_MERCHANT_SOURCE_ID (or GOOGLE_MERCHENT_SOURCE_ID)."
    );
  }

  return {
    accountId: String(accountId).trim(),
    sourceId: String(sourceId).trim(),
  };
}

/**
 * @param {import("axios").AxiosError} err
 */
function formatAxiosGoogleError(err) {
  const status = err.response?.status ?? 500;
  const data = err.response?.data ?? null;
  let message = err.message || "Google Merchant API request failed";
  if (data && typeof data === "object") {
    if (typeof data.error === "object" && data.error && typeof data.error.message === "string") {
      message = data.error.message;
    } else if (typeof data.message === "string") {
      message = data.message;
    }
  }
  const e = new Error(message);
  e.name = "GoogleMerchantApiError";
  e.status = status;
  e.data = data;
  return e;
}

/**
 * Product input id segment: contentLanguage~feedLabel~offerId (Merchant API).
 * Base64url-encode when offerId (or full id) contains URL-problematic characters.
 * @param {string} offerId
 */
function buildProductInputIdSegment(offerId) {
  const plain = `en~IN~${String(offerId)}`;
  if (/[/%~]/.test(String(offerId))) {
    return Buffer.from(plain, "utf8")
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  }
  return plain;
}

/**
 * @param {Record<string, unknown>} merchantPayload output of mapProductToGoogleMerchant
 */
async function syncProductToGoogleMerchant(merchantPayload) {
  const token = await getGoogleMerchantAccessToken();
  const { accountId, sourceId } = getMerchantConfig();

  const body = buildGoogleProductInput(merchantPayload);
  const offerId = body.offerId;
  const url = `${MERCHANT_API_BASE}/accounts/${encodeURIComponent(accountId)}/productInputs:insert`;
  const dataSource = `accounts/${accountId}/dataSources/${sourceId}`;

  console.log(
    "[Google Merchant] productInputs:insert",
    `offerId=${offerId}`,
    `endpoint=POST ${MERCHANT_API_BASE}/accounts/{accountId}/productInputs:insert`
  );

  try {
    const res = await axios.post(url, body, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      params: { dataSource },
    });
    return res.data;
  } catch (err) {
    if (axios.isAxiosError(err)) {
      console.error(
        "[Google Merchant] insert error body:",
        JSON.stringify(err.response?.data || {}).slice(0, 2000)
      );
      throw formatAxiosGoogleError(err);
    }
    throw err;
  }
}

/**
 * @param {string} offerId
 */
async function deleteProductFromGoogleMerchant(offerId) {
  if (offerId == null || String(offerId).trim() === "") {
    throw new Error("offerId is required for delete.");
  }

  const token = await getGoogleMerchantAccessToken();
  const { accountId, sourceId } = getMerchantConfig();

  const segment = buildProductInputIdSegment(String(offerId).trim());
  const resourceName = `accounts/${accountId}/productInputs/${segment}`;
  const encodedName = encodeURIComponent(resourceName);
  const dataSource = `accounts/${accountId}/dataSources/${sourceId}`;

  const url = `${MERCHANT_API_BASE}/${encodedName}`;

  console.log(
    "[Google Merchant] productInputs:delete",
    `offerId=${offerId}`,
    `resource=${resourceName}`
  );

  try {
    const res = await axios.delete(url, {
      headers: { Authorization: `Bearer ${token}` },
      params: { dataSource },
    });
    return res.data && Object.keys(res.data).length ? res.data : { deleted: true };
  } catch (err) {
    if (axios.isAxiosError(err)) {
      console.error(
        "[Google Merchant] delete error body:",
        JSON.stringify(err.response?.data || {}).slice(0, 2000)
      );
      throw formatAxiosGoogleError(err);
    }
    throw err;
  }
}

/**
 * @param {number} [pageSize]
 * @param {string} [pageToken]
 */
async function listGoogleMerchantProducts(pageSize, pageToken) {
  const token = await getGoogleMerchantAccessToken();
  const { accountId } = getMerchantConfig();

  const url = `${MERCHANT_API_BASE}/accounts/${encodeURIComponent(accountId)}/products`;
  const params = {};
  if (pageSize != null && pageSize !== "") {
    params.pageSize = Math.min(1000, Math.max(1, Number(pageSize)));
  }
  if (pageToken) params.pageToken = String(pageToken);

  console.log(
    "[Google Merchant] products.list",
    `endpoint=GET ${MERCHANT_API_BASE}/accounts/{accountId}/products`
  );

  try {
    const res = await axios.get(url, {
      headers: { Authorization: `Bearer ${token}` },
      params,
    });
    return res.data;
  } catch (err) {
    if (axios.isAxiosError(err)) {
      console.error(
        "[Google Merchant] list error body:",
        JSON.stringify(err.response?.data || {}).slice(0, 2000)
      );
      throw formatAxiosGoogleError(err);
    }
    throw err;
  }
}

/**
 * @param {string} productId raw route param or full resource name
 */
async function getGoogleMerchantProduct(productId) {
  if (productId == null || String(productId).trim() === "") {
    throw new Error("productId is required.");
  }

  const token = await getGoogleMerchantAccessToken();
  const { accountId } = getMerchantConfig();

  let name = String(productId).trim();
  if (!name.startsWith("accounts/")) {
    name = `accounts/${accountId}/products/${name}`;
  }

  const encodedName = encodeURIComponent(name);
  const url = `${MERCHANT_API_BASE}/${encodedName}`;

  console.log(
    "[Google Merchant] products.get",
    `name=${name}`
  );

  try {
    const res = await axios.get(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.data;
  } catch (err) {
    if (axios.isAxiosError(err)) {
      console.error(
        "[Google Merchant] get product error body:",
        JSON.stringify(err.response?.data || {}).slice(0, 2000)
      );
      throw formatAxiosGoogleError(err);
    }
    throw err;
  }
}

module.exports = {
  parsePriceToMicros,
  cleanAttributes,
  buildGoogleProductInput,
  getMerchantConfig,
  syncProductToGoogleMerchant,
  deleteProductFromGoogleMerchant,
  listGoogleMerchantProducts,
  getGoogleMerchantProduct,
};
