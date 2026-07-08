const { Op } = require("sequelize");
const {
  ProductGroup,
  Product,
  ProductImage,
  CaseDetails,
  MobileBrands,
  MobileModels,
} = require("../models");
const {
  slugifyFromTitle,
  normalizeSlugInput,
  ensureUniqueSlug,
} = require("../utils/productSlug");
const {
  serializeVariantProduct,
  variantSiblingInclude,
} = require("../utils/variantGroupHelper");

const groupProductInclude = [
  { model: ProductImage, as: "images" },
  { model: CaseDetails, as: "caseDetails", required: false },
];

async function ensureUniqueGroupSlug(baseSlug, excludeId = null) {
  const norm = normalizeSlugInput(baseSlug);
  if (norm && typeof norm === "object" && norm.error) {
    return norm;
  }
  let candidate = norm || slugifyFromTitle(baseSlug);
  if (!candidate) candidate = "variant-group";
  let suffix = 0;
  while (true) {
    const slug = suffix === 0 ? candidate : `${candidate}-${suffix}`;
    const where = { slug };
    if (excludeId != null) {
      where.id = { [Op.ne]: excludeId };
    }
    const taken = await ProductGroup.findOne({ where });
    if (!taken) return slug;
    suffix += 1;
  }
}

async function assignProductsToGroup(groupId, productIds, defaultProductId) {
  const ids = [...new Set(productIds.map((id) => parseInt(id, 10)).filter(Number.isFinite))];
  if (ids.length < 2) {
    const err = new Error("At least two products are required in a variant group.");
    err.status = 400;
    throw err;
  }

  const products = await Product.findAll({ where: { id: ids } });
  if (products.length !== ids.length) {
    const err = new Error("One or more selected products were not found.");
    err.status = 400;
    throw err;
  }

  const defaultId = parseInt(defaultProductId, 10);
  if (!Number.isFinite(defaultId) || !ids.includes(defaultId)) {
    const err = new Error("Default variant must be one of the selected products.");
    err.status = 400;
    throw err;
  }

  const occupied = await Product.findAll({
    where: {
      id: { [Op.in]: ids },
      [Op.and]: [
        { variantGroupId: { [Op.ne]: null } },
        { variantGroupId: { [Op.ne]: groupId } },
      ],
    },
  });
  if (occupied.length > 0) {
    const err = new Error(
      `Product "${occupied[0].title}" already belongs to another variant group. Remove it first.`
    );
    err.status = 409;
    throw err;
  }

  await Product.update(
    { variantGroupId: null, isDefaultVariant: false },
    { where: { variantGroupId: groupId, id: { [Op.notIn]: ids } } }
  );

  for (const id of ids) {
    await Product.update(
      {
        variantGroupId: groupId,
        isDefaultVariant: id === defaultId,
      },
      { where: { id } }
    );
  }
}

async function getAllVariantGroups(req, res) {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const offset = (page - 1) * limit;
    const search = String(req.query.search || "").trim();
    const normalizedSearch =
      search && search.toLowerCase() !== "undefined" ? search : "";

    const where = {};
    if (normalizedSearch) {
      where.name = { [Op.like]: `%${normalizedSearch}%` };
    }

    const { count, rows } = await ProductGroup.findAndCountAll({
      where,
      limit,
      offset,
      order: [["updatedAt", "DESC"]],
    });

    const groups = await Promise.all(
      rows.map(async (group) => {
        const g = group.toJSON();
        const memberCount = await Product.count({
          where: { variantGroupId: g.id },
        });
        const defaultProduct = await Product.findOne({
          where: { variantGroupId: g.id, isDefaultVariant: true },
          attributes: ["id", "title", "thumbnailImage", "slug"],
        });
        return {
          ...g,
          memberCount,
          defaultProduct: defaultProduct ? defaultProduct.toJSON() : null,
        };
      })
    );

    res.status(200).json({
      success: true,
      groups,
      pagination: {
        totalItems: count,
        totalPages: Math.ceil(count / limit) || 1,
        currentPage: page,
        limit,
      },
    });
  } catch (error) {
    console.error("getAllVariantGroups:", error);
    res.status(500).json({ message: "Failed to fetch variant groups", error: error.message });
  }
}

async function getVariantGroupById(req, res) {
  try {
    const { id } = req.params;
    const group = await ProductGroup.findByPk(id);
    if (!group) {
      return res.status(404).json({ message: "Variant group not found" });
    }

    const products = await Product.findAll({
      where: { variantGroupId: group.id },
      include: variantSiblingInclude,
      order: [
        ["isDefaultVariant", "DESC"],
        ["id", "ASC"],
      ],
    });

    res.status(200).json({
      success: true,
      group: {
        ...group.toJSON(),
        products: products.map(serializeVariantProduct),
        productIds: products.map((p) => p.id),
        defaultProductId: products.find((p) => p.isDefaultVariant)?.id || products[0]?.id || null,
      },
    });
  } catch (error) {
    console.error("getVariantGroupById:", error);
    res.status(500).json({ message: "Failed to fetch variant group", error: error.message });
  }
}

function normalizeVariantType(value) {
  return value === "model" ? "model" : "color";
}

async function createVariantGroup(req, res) {
  try {
    const { name, slug, productIds = [], defaultProductId, variantType } = req.body;
    if (!name || !String(name).trim()) {
      return res.status(400).json({ message: "Group name is required." });
    }

    let slugValue = null;
    const slugTrimmed = slug != null ? String(slug).trim() : "";
    if (slugTrimmed) {
      const norm = normalizeSlugInput(slugTrimmed);
      if (norm && typeof norm === "object" && norm.error) {
        return res.status(400).json({ message: norm.error });
      }
      slugValue = norm;
      const taken = await ProductGroup.findOne({ where: { slug: slugValue } });
      if (taken) {
        return res.status(409).json({ message: "Slug already in use." });
      }
    } else {
      slugValue = await ensureUniqueGroupSlug(name.trim());
    }

    const group = await ProductGroup.create({
      name: String(name).trim(),
      slug: slugValue,
      variantType: normalizeVariantType(variantType),
    });

    if (Array.isArray(productIds) && productIds.length > 0) {
      try {
        await assignProductsToGroup(group.id, productIds, defaultProductId);
      } catch (err) {
        await group.destroy();
        return res.status(err.status || 400).json({ message: err.message });
      }
    }

    const products = await Product.findAll({
      where: { variantGroupId: group.id },
      include: groupProductInclude,
    });

    res.status(201).json({
      success: true,
      message: "Variant group created successfully",
      group: {
        ...group.toJSON(),
        products: products.map(serializeVariantProduct),
        productIds: products.map((p) => p.id),
        defaultProductId: products.find((p) => p.isDefaultVariant)?.id || null,
      },
    });
  } catch (error) {
    console.error("createVariantGroup:", error);
    res.status(500).json({ message: "Failed to create variant group", error: error.message });
  }
}

async function updateVariantGroup(req, res) {
  try {
    const { id } = req.params;
    const group = await ProductGroup.findByPk(id);
    if (!group) {
      return res.status(404).json({ message: "Variant group not found" });
    }

    const { name, slug, productIds, defaultProductId, variantType } = req.body;
    const updatePayload = {};

    if (variantType != null) {
      updatePayload.variantType = normalizeVariantType(variantType);
    }

    if (name != null) {
      const trimmed = String(name).trim();
      if (!trimmed) {
        return res.status(400).json({ message: "Group name cannot be empty." });
      }
      updatePayload.name = trimmed;
    }

    if (Object.prototype.hasOwnProperty.call(req.body, "slug")) {
      const slugTrimmed = slug != null ? String(slug).trim() : "";
      if (!slugTrimmed) {
        updatePayload.slug = null;
      } else {
        const norm = normalizeSlugInput(slugTrimmed);
        if (norm && typeof norm === "object" && norm.error) {
          return res.status(400).json({ message: norm.error });
        }
        const taken = await ProductGroup.findOne({
          where: { slug: norm, id: { [Op.ne]: group.id } },
        });
        if (taken) {
          return res.status(409).json({ message: "Slug already in use." });
        }
        updatePayload.slug = norm;
      }
    }

    if (Object.keys(updatePayload).length > 0) {
      await group.update(updatePayload);
    }

    if (Array.isArray(productIds)) {
      try {
        await assignProductsToGroup(group.id, productIds, defaultProductId);
      } catch (err) {
        return res.status(err.status || 400).json({ message: err.message });
      }
    } else if (defaultProductId != null) {
      const defaultId = parseInt(defaultProductId, 10);
      const member = await Product.findOne({
        where: { id: defaultId, variantGroupId: group.id },
      });
      if (!member) {
        return res.status(400).json({ message: "Default product must belong to this group." });
      }
      await Product.update(
        { isDefaultVariant: false },
        { where: { variantGroupId: group.id } }
      );
      await Product.update(
        { isDefaultVariant: true },
        { where: { id: defaultId } }
      );
    }

    const products = await Product.findAll({
      where: { variantGroupId: group.id },
      include: variantSiblingInclude,
    });

    res.status(200).json({
      success: true,
      message: "Variant group updated successfully",
      group: {
        ...group.toJSON(),
        products: products.map(serializeVariantProduct),
        productIds: products.map((p) => p.id),
        defaultProductId: products.find((p) => p.isDefaultVariant)?.id || null,
      },
    });
  } catch (error) {
    console.error("updateVariantGroup:", error);
    res.status(500).json({ message: "Failed to update variant group", error: error.message });
  }
}

async function deleteVariantGroup(req, res) {
  try {
    const { id } = req.params;
    const group = await ProductGroup.findByPk(id);
    if (!group) {
      return res.status(404).json({ message: "Variant group not found" });
    }

    await Product.update(
      { variantGroupId: null, isDefaultVariant: false },
      { where: { variantGroupId: group.id } }
    );
    await group.destroy();

    res.status(200).json({
      success: true,
      message: "Variant group deleted. Products were unlinked but not removed.",
    });
  } catch (error) {
    console.error("deleteVariantGroup:", error);
    res.status(500).json({ message: "Failed to delete variant group", error: error.message });
  }
}

async function searchProductsForVariantGroup(req, res) {
  try {
    const searchRaw = String(req.query.search || "").trim();
    const search =
      searchRaw && searchRaw.toLowerCase() !== "undefined" ? searchRaw : "";
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));

    const where = {};
    if (search) {
      where.title = { [Op.like]: `%${search}%` };
    }

    const products = await Product.findAll({
      where,
      limit,
      order: [["updatedAt", "DESC"]],
      include: [
        { model: ProductImage, as: "images" },
        {
          model: CaseDetails,
          as: "caseDetails",
          required: false,
          include: [
            { model: MobileBrands, as: "brand", required: false },
            { model: MobileModels, as: "model", required: false },
          ],
        },
      ],
    });

    res.status(200).json({
      success: true,
      products: products.map((p) => {
        const row = p.toJSON();
        return {
          id: row.id,
          title: row.title,
          slug: row.slug,
          thumbnailImage: row.thumbnailImage,
          variantGroupId: row.variantGroupId,
          isDefaultVariant: row.isDefaultVariant,
          caseDetails: row.caseDetails,
        };
      }),
    });
  } catch (error) {
    console.error("searchProductsForVariantGroup:", error);
    res.status(500).json({ message: "Failed to search products", error: error.message });
  }
}

module.exports = {
  getAllVariantGroups,
  getVariantGroupById,
  createVariantGroup,
  updateVariantGroup,
  deleteVariantGroup,
  searchProductsForVariantGroup,
};
