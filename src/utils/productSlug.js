const { Op } = require("sequelize");

function stripHtml(s) {
  return String(s || "").replace(/<[^>]*>/g, "").trim();
}

function slugifyFromTitle(title) {
  const base = stripHtml(title)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 200);
  return base || null;
}

/**
 * Normalize admin-provided slug: lowercase, allowed chars [a-z0-9-].
 * Returns string or { error: message }.
 */
function normalizeSlugInput(raw) {
  if (raw == null) return null;
  const s = String(raw).trim().toLowerCase();
  if (!s) return null;
  const cleaned = s
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!cleaned) return null;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(cleaned)) {
    return { error: "Slug may only contain lowercase letters, numbers, and hyphens." };
  }
  return cleaned;
}

async function ensureUniqueSlug(Product, baseSlug, excludeProductId = null) {
  let counter = 0;
  const root = baseSlug || "product";
  while (counter <= 10000) {
    const candidate = counter === 0 ? root : `${root}-${counter}`;
    const where = { slug: candidate };
    if (excludeProductId != null) {
      where.id = { [Op.ne]: excludeProductId };
    }
    const existing = await Product.findOne({ where });
    if (!existing) return candidate;
    counter += 1;
  }
  throw new Error("Could not allocate a unique slug");
}

/**
 * Public GET /products/:param — numeric string => primary key; otherwise => slug lookup.
 */
function isNumericProductIdParam(param) {
  const trimmed = String(param || "").trim();
  return /^\d+$/.test(trimmed);
}

module.exports = {
  stripHtml,
  slugifyFromTitle,
  normalizeSlugInput,
  ensureUniqueSlug,
  isNumericProductIdParam,
};
