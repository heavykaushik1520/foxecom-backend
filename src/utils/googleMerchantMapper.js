/** Single canonical origin for Merchant feed, preview, CSV, and API payload URLs. */
const CANONICAL_ORIGIN = "https://www.foxecom.in";
const FRONTEND_PRODUCT_BASE = `${CANONICAL_ORIGIN}/product`;
const BACKEND_STATIC_BASE = `${CANONICAL_ORIGIN}/backend`;
const MERCHANT_BRAND = "FOXECOM";

/**
 * Force https://www.foxecom.in for any absolute URL already on foxecom.in (with or without www).
 * @param {string} urlString
 * @returns {string}
 */
function rewriteFoxecomToCanonical(urlString) {
  const s = String(urlString || "").trim();
  if (!s) return s;
  try {
    const u = new URL(s);
    const h = u.hostname.toLowerCase();
    if (h === "foxecom.in" || h === "www.foxecom.in") {
      u.protocol = "https:";
      u.hostname = "www.foxecom.in";
      return `${u.origin}${u.pathname}${u.search}${u.hash}`;
    }
  } catch {
    /* ignore */
  }
  return s;
}

/**
 * @param {string|number|null|undefined} value
 * @returns {string|null}
 */
function formatInrPrice(value) {
  if (value == null || value === "") return null;
  const n = typeof value === "string" ? parseFloat(value) : Number(value);
  if (Number.isNaN(n)) return null;
  return `${n.toFixed(2)} INR`;
}

/**
 * Resolve thumbnail to absolute HTTPS URL on the canonical www host.
 * Relative paths use BACKEND_STATIC_BASE (…/backend + path, e.g. …/backend/uploads/…).
 * @param {string|null|undefined} pathOrUrl
 * @returns {string|null}
 */
function resolveImageLink(pathOrUrl) {
  if (pathOrUrl == null || pathOrUrl === "") return null;
  const s = String(pathOrUrl).trim();
  if (!s) return null;
  if (/^https?:\/\//i.test(s)) {
    return rewriteFoxecomToCanonical(s);
  }
  if (s.startsWith("/")) {
    return `${BACKEND_STATIC_BASE}${s}`;
  }
  return `${BACKEND_STATIC_BASE}/${s.replace(/^\/+/, "")}`;
}

/**
 * Normalize Sequelize instance or plain object for mapping.
 * @param {import("sequelize").Model|Record<string, unknown>} product
 * @returns {Record<string, unknown>}
 */
function toPlainProduct(product) {
  if (!product) return {};
  if (typeof product.toJSON === "function") return product.toJSON();
  return { ...product };
}

/**
 * Build a Google Merchant–style payload for preview (no API submission).
 * @param {import("sequelize").Model|Record<string, unknown>} product
 * @returns {Record<string, unknown>}
 */
function mapProductToGoogleMerchant(product) {
  const p = toPlainProduct(product);
  const slug = p.slug != null ? String(p.slug) : "";
  const caseDetails = p.caseDetails || p.details || null;

  const stock = p.stock != null ? Number(p.stock) : 0;
  const availability = stock > 0 ? "in_stock" : "out_of_stock";

  const priceStr = formatInrPrice(p.price);
  const discountNum =
    p.discountPrice != null && p.discountPrice !== ""
      ? Number(p.discountPrice)
      : NaN;
  const salePriceStr =
    !Number.isNaN(discountNum) && discountNum > 0
      ? formatInrPrice(p.discountPrice)
      : null;

  const title = p.title != null ? String(p.title) : "";
  const description =
    p.description != null && String(p.description).trim() !== ""
      ? String(p.description)
      : title;

  const categoryName =
    p.category && p.category.name != null ? String(p.category.name) : null;

  const rawLink = slug
    ? `${FRONTEND_PRODUCT_BASE}/${slug}`
    : `${FRONTEND_PRODUCT_BASE}/`;

  const payload = {
    offerId: p.id != null ? String(p.id) : "",
    title,
    description,
    link: rewriteFoxecomToCanonical(rawLink),
    imageLink: resolveImageLink(p.thumbnailImage),
    availability,
    price: priceStr,
    brand: MERCHANT_BRAND,
    condition: "new",
    googleProductCategory:
      "Electronics > Communications > Telephony > Mobile Phone Cases",
    productType: categoryName || "Mobile Cases",
    channel: "online",
    contentLanguage: "en",
    targetCountry: "IN",
  };

  if (p.sku != null && String(p.sku).trim() !== "") {
    payload.sku = String(p.sku).trim();
    payload.mpn = String(p.sku).trim();
  }

  if (salePriceStr) {
    payload.salePrice = salePriceStr;
  }

  if (caseDetails && caseDetails.color != null && String(caseDetails.color).trim() !== "") {
    payload.color = String(caseDetails.color).trim();
  }

  if (
    caseDetails &&
    caseDetails.material != null &&
    String(caseDetails.material).trim() !== ""
  ) {
    payload.material = String(caseDetails.material).trim();
  }

  if (
    caseDetails &&
    caseDetails.brand &&
    caseDetails.brand.name != null &&
    String(caseDetails.brand.name).trim() !== ""
  ) {
    payload.customLabel0 = String(caseDetails.brand.name).trim();
  }

  if (
    caseDetails &&
    caseDetails.model &&
    caseDetails.model.name != null &&
    String(caseDetails.model.name).trim() !== ""
  ) {
    payload.customLabel1 = String(caseDetails.model.name).trim();
  }

  return payload;
}

module.exports = {
  mapProductToGoogleMerchant,
};
