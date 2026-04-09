function slugifyFromTitle(title) {
  if (!title || typeof title !== "string") return "";
  return title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeSlugInput(raw) {
  if (raw == null) return "";
  const trimmed = String(raw).trim().toLowerCase();
  if (!trimmed) return "";
  if (!/^[a-z0-9-]+$/.test(trimmed)) {
    return { error: "Slug can contain only lowercase letters, numbers, and hyphens." };
  }
  if (/^-|-$/.test(trimmed) || /--/.test(trimmed)) {
    return { error: "Slug format is invalid." };
  }
  return trimmed;
}

async function ensureUniqueSlug(Model, baseSlug, excludeId) {
  const cleanBase = normalizeSlugInput(baseSlug);
  if (!cleanBase || typeof cleanBase === "object") {
    return "";
  }

  let candidate = cleanBase;
  let counter = 2;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const where = { slug: candidate };
    if (excludeId != null) {
      where.id = { [Model.sequelize.Sequelize.Op.ne]: excludeId };
    }
    const existing = await Model.findOne({ where });
    if (!existing) return candidate;
    candidate = `${cleanBase}-${counter}`;
    counter += 1;
  }
}

module.exports = {
  slugifyFromTitle,
  normalizeSlugInput,
  ensureUniqueSlug,
};
