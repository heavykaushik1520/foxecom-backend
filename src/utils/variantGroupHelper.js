const { Op } = require("sequelize");
const {
  Product,
  ProductGroup,
  ProductImage,
  CaseDetails,
  MobileBrands,
  MobileModels,
} = require("../models");

const variantSiblingInclude = [
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
];

function serializeVariantProduct(row) {
  const p = row.toJSON ? row.toJSON() : row;
  const stock = p.stock != null ? parseInt(p.stock, 10) : null;
  const color = p.caseDetails?.color || null;
  const colorHex = p.caseDetails?.colorHex || null;
  return {
    id: p.id,
    title: p.title,
    slug: p.slug,
    sku: p.sku,
    price: p.price,
    discountPrice: p.discountPrice,
    stock,
    inStock: stock == null ? true : stock > 0,
    thumbnailImage: p.thumbnailImage,
    images: p.images || [],
    isDefaultVariant: Boolean(p.isDefaultVariant),
    caseDetails: p.caseDetails
      ? {
          color,
          colorHex,
          material: p.caseDetails.material,
          brand: p.caseDetails.brand,
          model: p.caseDetails.model,
        }
      : null,
    color,
    colorHex,
  };
}

async function attachVariantGroupDetails(productData) {
  const data = productData.toJSON ? productData.toJSON() : { ...productData };
  if (!data.variantGroupId) {
    data.variantGroup = null;
    return data;
  }

  const group = await ProductGroup.findByPk(data.variantGroupId);
  if (!group) {
    data.variantGroup = null;
    return data;
  }

  const siblings = await Product.findAll({
    where: { variantGroupId: group.id },
    include: variantSiblingInclude,
    order: [
      ["isDefaultVariant", "DESC"],
      ["id", "ASC"],
    ],
  });

  data.variantGroup = {
    id: group.id,
    name: group.name,
    slug: group.slug,
    variantType: group.variantType === "model" ? "model" : "color",
    variants: siblings.map(serializeVariantProduct),
  };

  return data;
}

async function attachVariantGroupDetailsToProducts(products) {
  return Promise.all(
    products.map((p) => attachVariantGroupDetails(p))
  );
}

/** Listing filter: show standalone products or default variant per group. */
function listingVariantWhereClause() {
  return {
    [Op.or]: [
      { variantGroupId: null },
      { isDefaultVariant: true },
    ],
  };
}

function mergeListingVariantFilter(existingWhere = {}) {
  const variantClause = listingVariantWhereClause();
  if (!existingWhere || Object.keys(existingWhere).length === 0) {
    return variantClause;
  }
  return { [Op.and]: [existingWhere, variantClause] };
}

module.exports = {
  attachVariantGroupDetails,
  attachVariantGroupDetailsToProducts,
  listingVariantWhereClause,
  mergeListingVariantFilter,
  serializeVariantProduct,
  variantSiblingInclude,
};
