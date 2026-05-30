const { ProductAvailableModels } = require("../models");

async function resolveCartLineUnitPrice(product, selectedModelId) {
  let unit =
    product.discountPrice != null && product.discountPrice !== ""
      ? parseFloat(product.discountPrice)
      : parseFloat(product.price);
  if (!Number.isFinite(unit)) unit = 0;

  const sid =
    selectedModelId != null && selectedModelId !== ""
      ? parseInt(String(selectedModelId), 10)
      : null;
  if (!sid || Number.isNaN(sid)) return unit;

  const pam = await ProductAvailableModels.findOne({
    where: { productId: product.id, modelId: sid },
  });
  if (pam != null && pam.priceOverride != null && pam.priceOverride !== "") {
    const o = parseFloat(pam.priceOverride);
    if (Number.isFinite(o)) unit = o;
  }
  return unit;
}

module.exports = { resolveCartLineUnitPrice };
