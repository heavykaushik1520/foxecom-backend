const { mapProductToGoogleMerchant } = require("./googleMerchantMapper");

/** Google Merchant primary feed column order (exact header names). */
const GOOGLE_MERCHANT_CSV_HEADERS = [
  "id",
  "title",
  "description",
  "link",
  "image_link",
  "availability",
  "price",
  "sale_price",
  "brand",
  "condition",
  "identifier_exists",
  "google_product_category",
  "product_type",
  "mpn",
  "color",
  "material",
];

/**
 * RFC 4180–style CSV field: always quoted, internal " doubled.
 * @param {unknown} value
 * @returns {string}
 */
function escapeCsvValue(value) {
  const stringValue = value == null ? "" : String(value);
  const escaped = stringValue.replace(/"/g, '""');
  return `"${escaped}"`;
}

/**
 * @param {import("sequelize").Model|Record<string, unknown>} product
 * @returns {Record<string, string>}
 */
function mapProductToGoogleMerchantCsvRecord(product) {
  const payload = mapProductToGoogleMerchant(product);
  const id =
    product && typeof product.get === "function"
      ? product.get("id")
      : product.id;

  return {
    id: id != null ? String(id) : "",
    title: payload.title != null ? String(payload.title) : "",
    description: payload.description != null ? String(payload.description) : "",
    link: payload.link != null ? String(payload.link) : "",
    image_link:
      payload.imageLink != null ? String(payload.imageLink) : "",
    availability:
      payload.availability != null ? String(payload.availability) : "",
    price: payload.price != null ? String(payload.price) : "",
    sale_price:
      payload.salePrice != null ? String(payload.salePrice) : "",
    brand: payload.brand != null ? String(payload.brand) : "",
    condition: payload.condition != null ? String(payload.condition) : "",
    identifier_exists: "no",
    google_product_category:
      payload.googleProductCategory != null
        ? String(payload.googleProductCategory)
        : "",
    product_type:
      payload.productType != null ? String(payload.productType) : "",
    mpn: payload.mpn != null ? String(payload.mpn) : "",
    color: payload.color != null ? String(payload.color) : "",
    material: payload.material != null ? String(payload.material) : "",
  };
}

/**
 * @param {Array<import("sequelize").Model|Record<string, unknown>>} products eligible rows only
 * @returns {string} full CSV including header row
 */
function buildGoogleMerchantCsvString(products) {
  const lines = [GOOGLE_MERCHANT_CSV_HEADERS.join(",")];
  for (const product of products) {
    const row = mapProductToGoogleMerchantCsvRecord(product);
    lines.push(
      GOOGLE_MERCHANT_CSV_HEADERS.map((h) => escapeCsvValue(row[h])).join(",")
    );
  }
  return lines.join("\n");
}

/**
 * @param {Array<import("sequelize").Model|Record<string, unknown>>} products eligible rows only
 * @returns {Array<Record<string, string>>}
 */
function buildGoogleMerchantFeedPreviewRows(products) {
  return products.map((product) => mapProductToGoogleMerchantCsvRecord(product));
}

module.exports = {
  GOOGLE_MERCHANT_CSV_HEADERS,
  escapeCsvValue,
  mapProductToGoogleMerchantCsvRecord,
  buildGoogleMerchantCsvString,
  buildGoogleMerchantFeedPreviewRows,
};
