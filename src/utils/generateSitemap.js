const fs = require("fs").promises;
const path = require("path");
const { Op } = require("sequelize");
const { Product, Category } = require("../models");
const { sequelize } = require("../config/db");

const BASE_URL = process.env.BASE_URL || "https://www.foxecom.in";
const PUBLIC_HTML_DIR =
  process.env.SITEMAP_OUTPUT_DIR || "/home/foxecomin/public_html";

const MAIN_SITEMAP_PATH = path.join(PUBLIC_HTML_DIR, "sitemap.xml");
const PAGE_SITEMAP_PATH = path.join(PUBLIC_HTML_DIR, "page-sitemap.xml");
const PRODUCT_SITEMAP_PATH = path.join(PUBLIC_HTML_DIR, "product-sitemap.xml");
const CATEGORY_SITEMAP_PATH = path.join(PUBLIC_HTML_DIR, "category-sitemap.xml");

const STATIC_ROUTES = [
  { path: "/", priority: "1.0", changefreq: "daily" },
  { path: "/shop", priority: "0.9", changefreq: "daily" },
  { path: "/deal-of-the-week", priority: "0.9", changefreq: "weekly" },
  { path: "/about-us", priority: "0.7", changefreq: "monthly" },
  { path: "/contact-us", priority: "0.7", changefreq: "monthly" },
  { path: "/privacy-policy", priority: "0.5", changefreq: "yearly" },
  { path: "/terms", priority: "0.5", changefreq: "yearly" },
  { path: "/refund-policy", priority: "0.5", changefreq: "yearly" },
  { path: "/disclaimer", priority: "0.5", changefreq: "yearly" },
];

function escapeXml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function formatLastmod(value) {
  const d =
    value instanceof Date && !Number.isNaN(value.getTime())
      ? value
      : new Date();

  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function urlEntry(loc, lastmod, changefreq, priority) {
  return (
    "  <url>\n" +
    `    <loc>${escapeXml(loc)}</loc>\n` +
    `    <lastmod>${lastmod}</lastmod>\n` +
    `    <changefreq>${changefreq}</changefreq>\n` +
    `    <priority>${priority}</priority>\n` +
    "  </url>"
  );
}

function sitemapIndexEntry(loc, lastmod) {
  return (
    "  <sitemap>\n" +
    `    <loc>${escapeXml(loc)}</loc>\n` +
    `    <lastmod>${lastmod}</lastmod>\n` +
    "  </sitemap>"
  );
}

async function writeFileSafe(filePath, content) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, "utf8");
}

async function generatePageSitemap(today) {
  const chunks = [];

  for (const route of STATIC_ROUTES) {
    const loc = route.path === "/" ? `${BASE_URL}/` : `${BASE_URL}${route.path}`;
    chunks.push(urlEntry(loc, today, route.changefreq, route.priority));
  }

  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    chunks.join("\n") +
    "\n</urlset>\n";

  await writeFileSafe(PAGE_SITEMAP_PATH, xml);
  console.log(`Page sitemap written successfully to ${PAGE_SITEMAP_PATH}`);
}

async function generateProductSitemap(today) {
  const products = await Product.findAll({
    attributes: ["slug", "updatedAt"],
    where: {
      [Op.and]: [
        { slug: { [Op.ne]: null } },
        sequelize.where(sequelize.fn("TRIM", sequelize.col("slug")), Op.ne, ""),
        // { isActive: true }, // uncomment if you have it
      ],
    },
    order: [["updatedAt", "DESC"]],
  });

  const chunks = [];

  for (const row of products) {
    const slug = String(row.slug || "").trim();
    if (!slug) continue;

    const lastmod = row.updatedAt ? formatLastmod(row.updatedAt) : today;
    const loc = `${BASE_URL}/product/${encodeURIComponent(slug)}`;

    chunks.push(urlEntry(loc, lastmod, "weekly", "0.8"));
  }

  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    chunks.join("\n") +
    "\n</urlset>\n";

  await writeFileSafe(PRODUCT_SITEMAP_PATH, xml);
  console.log(`Product sitemap written successfully to ${PRODUCT_SITEMAP_PATH}`);
}

async function generateCategorySitemap(today) {
  const categories = await Category.findAll({
    attributes: ["slug", "updatedAt"],
    where: {
      [Op.and]: [
        { slug: { [Op.ne]: null } },
        sequelize.where(sequelize.fn("TRIM", sequelize.col("slug")), Op.ne, ""),
        // { isActive: true }, // uncomment if you have it
      ],
    },
    order: [["updatedAt", "DESC"]],
  });

  const chunks = [];

  for (const row of categories) {
    const slug = String(row.slug || "").trim();
    if (!slug) continue;

    const lastmod = row.updatedAt ? formatLastmod(row.updatedAt) : today;

    // CURRENT CATEGORY URL FORMAT
    const loc = `${BASE_URL}/shop?categorySlug=${encodeURIComponent(slug)}`;

    chunks.push(urlEntry(loc, lastmod, "weekly", "0.7"));
  }

  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    chunks.join("\n") +
    "\n</urlset>\n";

  await writeFileSafe(CATEGORY_SITEMAP_PATH, xml);
  console.log(`Category sitemap written successfully to ${CATEGORY_SITEMAP_PATH}`);
}

async function generateMainSitemapIndex(today) {
  const chunks = [
    sitemapIndexEntry(`${BASE_URL}/page-sitemap.xml`, today),
    sitemapIndexEntry(`${BASE_URL}/product-sitemap.xml`, today),
    sitemapIndexEntry(`${BASE_URL}/category-sitemap.xml`, today),
    // later:
    // sitemapIndexEntry(`${BASE_URL}/blog-sitemap.xml`, today),
  ];

  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    chunks.join("\n") +
    "\n</sitemapindex>\n";

  await writeFileSafe(MAIN_SITEMAP_PATH, xml);
  console.log(`Main sitemap index written successfully to ${MAIN_SITEMAP_PATH}`);
}

async function generateSitemap() {
  try {
    const today = formatLastmod(new Date());

    await generatePageSitemap(today);
    await generateProductSitemap(today);
    await generateCategorySitemap(today);
    await generateMainSitemapIndex(today);

    console.log("All sitemap files generated successfully.");
  } catch (err) {
    console.error("Sitemap generation failed:", err.message);
    throw err;
  }
}

module.exports = { generateSitemap };