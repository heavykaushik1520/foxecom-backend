const { col } = require("sequelize");
const {
  Product,
  ProductImage,
  Category,
  CaseDetails,
  MobileBrands,
  MobileModels,
} = require("../models");
const { mapProductToGoogleMerchant } = require("../utils/googleMerchantMapper");
const {
  GOOGLE_MERCHANT_CSV_HEADERS,
  buildGoogleMerchantCsvString,
  buildGoogleMerchantFeedPreviewRows,
} = require("../utils/googleMerchantCsvFeed");
const {
  syncProductToGoogleMerchant,
  deleteProductFromGoogleMerchant,
  listGoogleMerchantProducts,
  getGoogleMerchantProduct,
} = require("../services/googleMerchantService");

/** @typedef {{ code: string, message: string }} MerchantValidationIssue */

const GOOGLE_TITLE_MAX_LEN = 150;

/**
 * @param {import("sequelize").Model|Record<string, unknown>} product
 * @param {Record<string, unknown>} payload
 * @returns {{ errors: MerchantValidationIssue[], warnings: MerchantValidationIssue[] }}
 */
function collectMerchantReadinessIssues(product, payload) {
  /** @type {MerchantValidationIssue[]} */
  const errors = [];
  /** @type {MerchantValidationIssue[]} */
  const warnings = [];

  const plain =
    product && typeof product.toJSON === "function"
      ? product.toJSON()
      : { ...product };

  const slug = plain.slug != null ? String(plain.slug).trim() : "";
  const title = payload.title != null ? String(payload.title).trim() : "";

  if (plain.id == null) {
    errors.push({
      code: "MISSING_PRODUCT_ID",
      message: "Product id is missing; offerId cannot be set reliably.",
    });
  }

  if (!slug) {
    errors.push({
      code: "MISSING_SLUG",
      message: "Product slug is required for a valid item link.",
    });
  }

  if (!title) {
    errors.push({
      code: "MISSING_TITLE",
      message: "Title is required for Google Merchant.",
    });
  } else if (title.length > GOOGLE_TITLE_MAX_LEN) {
    warnings.push({
      code: "TITLE_LONG",
      message: `Title is ${title.length} characters; Google recommends ${GOOGLE_TITLE_MAX_LEN} or fewer (may be truncated).`,
    });
  }

  if (!payload.imageLink || !String(payload.imageLink).trim()) {
    errors.push({
      code: "MISSING_IMAGE_LINK",
      message: "A main image (thumbnailImage) is required for Google Merchant.",
    });
  } else if (!/^https:\/\//i.test(String(payload.imageLink))) {
    warnings.push({
      code: "IMAGE_NOT_HTTPS",
      message: "Image URL should use https for best compatibility with Google.",
    });
  }

  if (!payload.price || !String(payload.price).trim()) {
    errors.push({
      code: "INVALID_PRICE",
      message: "A valid price in INR is required for Google Merchant.",
    });
  } else {
    const m = /^([\d.]+)\s+INR$/i.exec(String(payload.price).trim());
    const num = m ? parseFloat(m[1]) : NaN;
    if (Number.isNaN(num) || num <= 0) {
      errors.push({
        code: "INVALID_PRICE",
        message: "Price must be a positive number formatted as INR.",
      });
    }
  }

  if (payload.salePrice && payload.price) {
    const saleM = /^([\d.]+)\s+INR$/i.exec(String(payload.salePrice).trim());
    const priceM = /^([\d.]+)\s+INR$/i.exec(String(payload.price).trim());
    const saleNum = saleM ? parseFloat(saleM[1]) : NaN;
    const priceNum = priceM ? parseFloat(priceM[1]) : NaN;
    if (
      !Number.isNaN(saleNum) &&
      !Number.isNaN(priceNum) &&
      saleNum >= priceNum
    ) {
      warnings.push({
        code: "SALE_PRICE_NOT_LOWER_THAN_PRICE",
        message: "salePrice should be lower than price when both are present.",
      });
    }
  }

  if (!payload.sku) {
    warnings.push({
      code: "MISSING_SKU",
      message: "SKU is recommended for Google Merchant (used as sku / mpn in the feed).",
    });
  }

  if (!plain.category) {
    warnings.push({
      code: "MISSING_CATEGORY",
      message: "Category relation missing; productType falls back to a default.",
    });
  }

  const caseDetails = plain.caseDetails || plain.details;
  if (!caseDetails) {
    warnings.push({
      code: "MISSING_CASE_DETAILS",
      message: "No case details; color, material, and custom labels may be omitted.",
    });
  } else {
    if (
      !caseDetails.brand ||
      !String(caseDetails.brand.name || "").trim()
    ) {
      warnings.push({
        code: "MISSING_DEVICE_BRAND",
        message: "Case brand (customLabel0) is empty.",
      });
    }
    if (
      !caseDetails.model ||
      !String(caseDetails.model.name || "").trim()
    ) {
      warnings.push({
        code: "MISSING_DEVICE_MODEL",
        message: "Case model (customLabel1) is empty.",
      });
    }
  }

  if (!plain.images || plain.images.length === 0) {
    warnings.push({
      code: "NO_GALLERY_IMAGES",
      message: "No gallery images on record; consider adding more for richer listings.",
    });
  }

  return { errors, warnings };
}

/**
 * Hard gate before calling Merchant API insert.
 * @param {import("sequelize").Model|Record<string, unknown>} product
 * @returns {{ isValid: boolean, errors: MerchantValidationIssue[] }}
 */
function validateProductForSync(product) {
  /** @type {MerchantValidationIssue[]} */
  const errors = [];
  const plain =
    product && typeof product.toJSON === "function"
      ? product.toJSON()
      : { ...product };

  if (plain.id == null) {
    errors.push({
      code: "MISSING_ID",
      message: "Product id is required for sync.",
    });
  }

  if (!plain.title || !String(plain.title).trim()) {
    errors.push({
      code: "MISSING_TITLE",
      message: "Product title is required for sync.",
    });
  }

  if (!plain.slug || !String(plain.slug).trim()) {
    errors.push({
      code: "MISSING_SLUG",
      message: "Product slug is required for sync.",
    });
  }

  const priceNum =
    plain.price != null && plain.price !== ""
      ? Number(plain.price)
      : NaN;
  if (Number.isNaN(priceNum) || priceNum <= 0) {
    errors.push({
      code: "INVALID_PRICE",
      message: "Product price must be a number greater than 0.",
    });
  }

  if (!plain.thumbnailImage || !String(plain.thumbnailImage).trim()) {
    errors.push({
      code: "MISSING_THUMBNAIL",
      message: "thumbnailImage is required for sync.",
    });
  }

  if (plain.categoryId == null || plain.categoryId === "") {
    errors.push({
      code: "MISSING_CATEGORY_ID",
      message: "categoryId is required for sync.",
    });
  }

  return { isValid: errors.length === 0, errors };
}

/**
 * @param {unknown} err
 * @returns {{ status: number, data: unknown, message: string }}
 */
function mapGoogleMerchantError(err) {
  if (
    err &&
    typeof err === "object" &&
    typeof err.status === "number" &&
    "data" in err
  ) {
    return {
      status: err.status,
      data: err.data,
      message: typeof err.message === "string" ? err.message : "Google Merchant API error",
    };
  }
  return {
    status: 500,
    data: null,
    message: err instanceof Error ? err.message : "Unexpected error",
  };
}

const previewGoogleMerchantIncludes = [
  { model: ProductImage, as: "images" },
  { model: Category, as: "category" },
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

/**
 * GET preview of Google Merchant payload for a product by slug (no Google API calls).
 */
async function previewGoogleMerchantProduct(req, res) {
  try {
    const raw = req.params.slug != null ? String(req.params.slug).trim() : "";
    if (!raw) {
      return res.status(400).json({
        success: false,
        message: "Product slug is required.",
      });
    }

    const slug = raw.toLowerCase();

    const product = await Product.findOne({
      where: { slug },
      include: previewGoogleMerchantIncludes,
    });

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found.",
      });
    }

    const merchantPayload = mapProductToGoogleMerchant(product);

    return res.status(200).json({
      success: true,
      productSlug: product.slug,
      merchantPayload,
    });
  } catch (err) {
    console.error("previewGoogleMerchantProduct:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to build Google Merchant preview.",
    });
  }
}

/**
 * GET bulk preview of Google Merchant payloads for all products (no Google API calls).
 */
async function previewAllGoogleMerchantProducts(req, res) {
  try {
    const products = await Product.findAll({
      include: previewGoogleMerchantIncludes,
      order: [["id", "ASC"]],
    });

    const items = products.map((product) => ({
      productSlug: product.slug,
      merchantPayload: mapProductToGoogleMerchant(product),
    }));

    return res.status(200).json({
      success: true,
      count: items.length,
      items,
    });
  } catch (err) {
    console.error("previewAllGoogleMerchantProducts:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to build Google Merchant bulk preview.",
    });
  }
}

/**
 * GET validation report for all products before Google Merchant sync (no external APIs).
 */
async function validateGoogleMerchantProducts(req, res) {
  try {
    const products = await Product.findAll({
      include: previewGoogleMerchantIncludes,
      order: [["id", "ASC"]],
    });

    const items = products.map((product) => {
      const merchantPayload = mapProductToGoogleMerchant(product);
      const { errors, warnings } = collectMerchantReadinessIssues(
        product,
        merchantPayload
      );
      return {
        productId: product.id,
        productSlug: product.slug,
        offerId: merchantPayload.offerId,
        ready: errors.length === 0,
        errorCount: errors.length,
        warningCount: warnings.length,
        errors,
        warnings,
      };
    });

    const readyCount = items.filter((i) => i.ready).length;
    const totalWarnings = items.reduce((s, i) => s + i.warningCount, 0);

    return res.status(200).json({
      success: true,
      summary: {
        totalProducts: items.length,
        readyForSync: readyCount,
        notReady: items.length - readyCount,
        totalErrors: items.reduce((s, i) => s + i.errorCount, 0),
        totalWarnings,
      },
      items,
    });
  } catch (err) {
    console.error("validateGoogleMerchantProducts:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to validate products for Google Merchant.",
    });
  }
}

/**
 * POST sync one product by slug to Google Merchant (ProductInputs insert).
 */
async function syncGoogleMerchantProduct(req, res) {
  const raw = req.params.slug != null ? String(req.params.slug).trim() : "";
  const slugParam = raw.toLowerCase();

  try {
    if (!raw) {
      return res.status(400).json({
        success: false,
        message: "Product slug is required.",
      });
    }

    const product = await Product.findOne({
      where: { slug: slugParam },
      include: previewGoogleMerchantIncludes,
    });

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found.",
      });
    }

    const { isValid, errors } = validateProductForSync(product);
    if (!isValid) {
      return res.status(400).json({
        success: false,
        message: "Product is not eligible for Google Merchant sync",
        productSlug: product.slug,
        errors,
      });
    }

    const merchantPayload = mapProductToGoogleMerchant(product);

    try {
      const googleResponse = await syncProductToGoogleMerchant(merchantPayload);
      return res.status(200).json({
        success: true,
        message: "Product synced to Google Merchant Center successfully",
        productSlug: product.slug,
        merchantPayload,
        googleResponse,
      });
    } catch (apiErr) {
      const googleError = mapGoogleMerchantError(apiErr);
      console.error(
        "syncGoogleMerchantProduct Google error:",
        product.slug,
        googleError.status,
        JSON.stringify(googleError.data || {}).slice(0, 2000)
      );
      return res.status(googleError.status >= 400 && googleError.status < 600 ? googleError.status : 502).json({
        success: false,
        message: "Failed to sync product to Google Merchant Center",
        productSlug: product.slug,
        googleError,
      });
    }
  } catch (err) {
    console.error("syncGoogleMerchantProduct:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to sync product to Google Merchant Center",
      productSlug: slugParam || null,
      googleError: mapGoogleMerchantError(err),
    });
  }
}

/**
 * POST sync many products (paginated, sequential API calls).
 */
async function syncAllGoogleMerchantProducts(req, res) {
  try {
    const page = Math.max(1, parseInt(String(req.query.page || "1"), 10) || 1);
    const limitRaw = parseInt(String(req.query.limit || "50"), 10);
    const limit = Math.min(200, Math.max(1, Number.isNaN(limitRaw) ? 50 : limitRaw));
    const onlyEligible =
      String(req.query.onlyEligible || "true").toLowerCase() !== "false";

    const offset = (page - 1) * limit;

    const { count, rows: products } = await Product.findAndCountAll({
      include: previewGoogleMerchantIncludes,
      order: [["createdAt", "DESC"]],
      limit,
      offset,
      distinct: true,
      col: col("Product.id"),
    });

    const totalRecords = count;
    const totalPages = totalRecords === 0 ? 0 : Math.ceil(totalRecords / limit);

    /** @type {Array<{ id: number, slug: string|null, offerId: string, googleResponse: unknown }>} */
    const syncedProducts = [];
    /** @type {Array<{ id: number, slug: string|null, title: string|null, errors: MerchantValidationIssue[] }>} */
    const skippedProducts = [];
    /** @type {Array<{ id: number, slug: string|null, offerId: string, googleError: { status: number, data: unknown, message: string } }>} */
    const failedProducts = [];

    let attempted = 0;
    let synced = 0;
    let skipped = 0;
    let failed = 0;

    for (const product of products) {
      const { isValid, errors } = validateProductForSync(product);
      const merchantPayload = mapProductToGoogleMerchant(product);
      const offerId = String(merchantPayload.offerId || "");

      if (!isValid && onlyEligible) {
        skippedProducts.push({
          id: product.id,
          slug: product.slug,
          title: product.title,
          errors,
        });
        skipped += 1;
        continue;
      }

      attempted += 1;
      try {
        const googleResponse = await syncProductToGoogleMerchant(merchantPayload);
        syncedProducts.push({
          id: product.id,
          slug: product.slug,
          offerId,
          googleResponse,
        });
        synced += 1;
      } catch (apiErr) {
        const googleError = mapGoogleMerchantError(apiErr);
        console.error(
          "syncAllGoogleMerchantProducts failed:",
          product.slug,
          offerId,
          googleError.status,
          JSON.stringify(googleError.data || {}).slice(0, 1500)
        );
        failedProducts.push({
          id: product.id,
          slug: product.slug,
          offerId,
          googleError,
        });
        failed += 1;
      }
    }

    return res.status(200).json({
      success: true,
      summary: {
        totalProductsInPage: products.length,
        attempted,
        synced,
        skipped,
        failed,
      },
      pagination: {
        currentPage: page,
        limit,
        totalPages,
        totalRecords,
      },
      syncedProducts,
      skippedProducts,
      failedProducts,
    });
  } catch (err) {
    console.error("syncAllGoogleMerchantProducts:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to run bulk Google Merchant sync.",
    });
  }
}

/**
 * DELETE product input from Google Merchant by offer id.
 */
async function deleteGoogleMerchantProduct(req, res) {
  try {
    const offerId =
      req.params.offerId != null ? String(req.params.offerId).trim() : "";
    if (!offerId) {
      return res.status(400).json({
        success: false,
        message: "offerId is required.",
      });
    }

    try {
      const googleResponse = await deleteProductFromGoogleMerchant(offerId);
      return res.status(200).json({
        success: true,
        message: "Product deleted from Google Merchant Center successfully",
        offerId,
        googleResponse,
      });
    } catch (apiErr) {
      const googleError = mapGoogleMerchantError(apiErr);
      console.error(
        "deleteGoogleMerchantProduct Google error:",
        offerId,
        googleError.status,
        JSON.stringify(googleError.data || {}).slice(0, 2000)
      );
      return res.status(googleError.status >= 400 && googleError.status < 600 ? googleError.status : 502).json({
        success: false,
        message: "Failed to delete product from Google Merchant Center",
        offerId,
        googleError,
      });
    }
  } catch (err) {
    console.error("deleteGoogleMerchantProduct:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to delete product from Google Merchant Center",
      offerId: req.params.offerId || null,
      googleError: mapGoogleMerchantError(err),
    });
  }
}

/**
 * GET processed products from Google Merchant (paginated).
 */
async function listGoogleMerchantProductsController(req, res) {
  try {
    const ps = parseInt(String(req.query.pageSize || "20"), 10);
    const pageSize = Math.min(100, Math.max(1, Number.isNaN(ps) ? 20 : ps));
    const pageToken = req.query.pageToken
      ? String(req.query.pageToken)
      : undefined;

    const googleResponse = await listGoogleMerchantProducts(pageSize, pageToken);
    return res.status(200).json({
      success: true,
      googleResponse,
    });
  } catch (apiErr) {
    const googleError = mapGoogleMerchantError(apiErr);
    console.error(
      "listGoogleMerchantProductsController:",
      googleError.status,
      JSON.stringify(googleError.data || {}).slice(0, 2000)
    );
    return res.status(googleError.status >= 400 && googleError.status < 600 ? googleError.status : 502).json({
      success: false,
      message: "Failed to list Google Merchant products",
      googleError,
    });
  }
}

/**
 * GET single processed product from Google Merchant.
 */
async function getGoogleMerchantProductController(req, res) {
  try {
    const productId =
      req.params.productId != null ? String(req.params.productId).trim() : "";
    if (!productId) {
      return res.status(400).json({
        success: false,
        message: "productId is required.",
      });
    }

    const googleResponse = await getGoogleMerchantProduct(productId);
    return res.status(200).json({
      success: true,
      googleResponse,
    });
  } catch (apiErr) {
    const googleError = mapGoogleMerchantError(apiErr);
    console.error(
      "getGoogleMerchantProductController:",
      googleError.status,
      JSON.stringify(googleError.data || {}).slice(0, 2000)
    );
    return res.status(googleError.status >= 400 && googleError.status < 600 ? googleError.status : 502).json({
      success: false,
      message: "Failed to get Google Merchant product",
      googleError,
    });
  }
}

/**
 * Public CSV feed for Google Merchant Center (no auth, no API).
 */
async function generateGoogleMerchantCsvFeed(req, res) {
  try {
    const products = await Product.findAll({
      include: previewGoogleMerchantIncludes,
      order: [["createdAt", "DESC"]],
    });

    const eligible = products.filter((p) => validateProductForSync(p).isValid);

    const csvContent = buildGoogleMerchantCsvString(eligible);

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      'inline; filename="google-merchant-feed.csv"'
    );

    return res.status(200).send(csvContent);
  } catch (err) {
    console.error("generateGoogleMerchantCsvFeed:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to generate Google Merchant CSV feed.",
    });
  }
}

/**
 * JSON preview of the same rows that would appear in feed.csv (eligible products only).
 */
async function previewGoogleMerchantCsvFeed(req, res) {
  try {
    const products = await Product.findAll({
      include: previewGoogleMerchantIncludes,
      order: [["createdAt", "DESC"]],
    });

    const eligible = products.filter((p) => validateProductForSync(p).isValid);
    const rows = buildGoogleMerchantFeedPreviewRows(eligible);

    return res.status(200).json({
      success: true,
      generatedAt: new Date().toISOString(),
      count: rows.length,
      headers: GOOGLE_MERCHANT_CSV_HEADERS,
      rows,
    });
  } catch (err) {
    console.error("previewGoogleMerchantCsvFeed:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to build Google Merchant feed preview.",
    });
  }
}

module.exports = {
  previewGoogleMerchantProduct,
  previewAllGoogleMerchantProducts,
  validateGoogleMerchantProducts,
  syncGoogleMerchantProduct,
  syncAllGoogleMerchantProducts,
  deleteGoogleMerchantProduct,
  listGoogleMerchantProductsController,
  getGoogleMerchantProductController,
  generateGoogleMerchantCsvFeed,
  previewGoogleMerchantCsvFeed,
};
