const { Product } = require("../models");

const FRONTEND_BASE_URL = "https://www.foxecom.in";
const BACKEND_PUBLIC_BASE_URL = "https://www.foxecom.in";
const CSV_HEADERS = [
  "id",
  "title",
  "description",
  "availability",
  "condition",
  "price",
  "sale_price",
  "link",
  "image_link",
  "brand",
];

function escapeCsvValue(value) {
  const stringValue = value == null ? "" : String(value);
  const escaped = stringValue.replace(/"/g, '""');
  return `"${escaped}"`;
}

function formatInrAmount(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "";
  return `${amount.toFixed(2)} INR`;
}

function buildPublicImageUrl(thumbnailImage) {
  if (!thumbnailImage) return "";

  const image = String(thumbnailImage).trim();
  if (!image) return "";

  if (/^https?:\/\//i.test(image)) {
    return image;
  }

  const normalizedPath = image.startsWith("/") ? image : `/${image}`;
  return `${BACKEND_PUBLIC_BASE_URL}${normalizedPath}`;
}

function buildProductFilter() {
  const where = {};
  const attributes = Product.rawAttributes || {};

  // Include only active/visible products when those flags exist in the schema.
  if (attributes.isActive) where.isActive = true;
  if (attributes.active) where.active = true;
  if (attributes.isVisible) where.isVisible = true;
  if (attributes.visible) where.visible = true;
  if (attributes.status) where.status = "active";

  return where;
}

function buildCsvRow(product) {
  const price = Number(product.price);
  const discountPrice = Number(product.discountPrice);
  const hasValidSalePrice =
    Number.isFinite(discountPrice) &&
    Number.isFinite(price) &&
    discountPrice > 0 &&
    discountPrice < price;

  const row = {
    id: product.id,
    title: product.title || "",
    description: product.description || "",
    availability: Number(product.stock) > 0 ? "in stock" : "out of stock",
    condition: "new",
    price: formatInrAmount(price),
    sale_price: hasValidSalePrice ? formatInrAmount(discountPrice) : "",
    link: `${FRONTEND_BASE_URL}/product/${product.id}`,
    image_link: buildPublicImageUrl(product.thumbnailImage),
    brand: "FOXECOM",
  };

  return CSV_HEADERS.map((header) => escapeCsvValue(row[header])).join(",");
}

async function getMetaProductFeedCsv(req, res) {
  try {
    const products = await Product.findAll({
      where: buildProductFilter(),
      attributes: [
        "id",
        "title",
        "price",
        "discountPrice",
        "stock",
        "thumbnailImage",
        "description",
      ],
      order: [["id", "ASC"]],
    });

    const lines = [CSV_HEADERS.join(",")];
    for (const product of products) {
      lines.push(buildCsvRow(product));
    }

    const csvContent = lines.join("\n");

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      'inline; filename="meta-product-feed.csv"'
    );

    return res.status(200).send(csvContent);
  } catch (error) {
    console.error("Error generating Meta product CSV feed:", error);
    return res.status(500).json({
      message: "Failed to generate Meta product feed.",
      error: error.message,
    });
  }
}

module.exports = {
  getMetaProductFeedCsv,
};
