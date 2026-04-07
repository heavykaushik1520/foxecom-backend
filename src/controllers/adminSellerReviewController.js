const path = require("path");
const fs = require("fs");
const { SellerReview, Product, sequelize } = require("../models");
const { Op } = require("sequelize");

function filesToPublicPaths(files) {
  return (files || []).map((f) => `/uploads/images/seller-reviews/${f.filename}`);
}

function resolveDiskPath(publicPath) {
  if (!publicPath || typeof publicPath !== "string") return null;
  const normalized = publicPath.replace(/^\/+/, "");
  if (!normalized.startsWith("uploads/images/seller-reviews/")) return null;
  return path.join(__dirname, "..", normalized);
}

function unlinkPublicImages(paths) {
  for (const p of paths || []) {
    const abs = resolveDiskPath(p);
    if (!abs) continue;
    try {
      if (fs.existsSync(abs)) fs.unlinkSync(abs);
    } catch (e) {
      console.warn("Seller review image unlink:", e.message);
    }
  }
}

function parseExistingImages(body) {
  const raw = body.existingImages;
  if (raw == null || raw === "") return [];
  if (Array.isArray(raw)) return raw.filter(Boolean);
  try {
    const j = JSON.parse(raw);
    return Array.isArray(j) ? j.filter(Boolean) : [];
  } catch {
    return [];
  }
}

function parseRating(body) {
  const r = parseInt(body.rating, 10);
  return Number.isFinite(r) ? r : NaN;
}

function todayDateOnly() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Expect YYYY-MM-DD */
function parseReviewDate(raw) {
  if (raw == null || raw === "") return null;
  const s = String(raw).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return s;
}

function resolveReviewDateForCreate(body) {
  const raw = body.reviewDate;
  if (raw == null || raw === "") return { ok: true, value: todayDateOnly() };
  const parsed = parseReviewDate(raw);
  if (!parsed) return { ok: false };
  return { ok: true, value: parsed };
}

/**
 * GET /admin/seller-reviews/stats/per-product
 * How many seller reviews the current admin has added per product.
 */
async function getPerProductStats(req, res) {
  try {
    const adminId = req.admin?.adminId;
    if (adminId == null) {
      return res.json({ stats: [], legacyToken: true });
    }

    const counts = await SellerReview.findAll({
      attributes: [
        "productId",
        [sequelize.fn("COUNT", sequelize.col("SellerReview.id")), "reviewCount"],
      ],
      where: { adminId },
      group: ["productId"],
      raw: true,
    });

    const productIds = counts.map((c) => c.productId);
    if (productIds.length === 0) {
      return res.json({ stats: [] });
    }

    const products = await Product.findAll({
      where: { id: { [Op.in]: productIds } },
      attributes: ["id", "title", "thumbnailImage"],
    });
    const byId = new Map(products.map((p) => [p.id, p]));

    const stats = counts.map((c) => {
      const p = byId.get(c.productId);
      return {
        productId: c.productId,
        reviewCount: parseInt(c.reviewCount, 10) || 0,
        product: p
          ? { id: p.id, title: p.title, thumbnailImage: p.thumbnailImage }
          : null,
      };
    });

    stats.sort((a, b) => b.reviewCount - a.reviewCount);
    return res.json({ stats });
  } catch (error) {
    console.error("getPerProductStats:", error);
    return res.status(500).json({ message: "Failed to load stats." });
  }
}

/**
 * GET /admin/seller-reviews?page&limit&productId&rating&search&sortBy&sortOrder
 */
async function listSellerReviews(req, res) {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const productId = req.query.productId ? parseInt(req.query.productId, 10) : null;
    const rating = req.query.rating ? parseInt(req.query.rating, 10) : null;
    const search = (req.query.search || "").trim();
    const sortBy = ["createdAt", "rating", "name", "reviewDate"].includes(req.query.sortBy)
      ? req.query.sortBy
      : "createdAt";
    const sortOrder = (req.query.sortOrder || "desc").toLowerCase() === "asc" ? "ASC" : "DESC";

    const where = {};
    if (productId) where.productId = productId;
    if (rating >= 1 && rating <= 5) where.rating = rating;
    if (search) {
      where[Op.or] = [
        { name: { [Op.like]: `%${search}%` } },
        { message: { [Op.like]: `%${search}%` } },
      ];
    }

    const { count, rows } = await SellerReview.findAndCountAll({
      where,
      limit,
      offset: (page - 1) * limit,
      order: [[sortBy, sortOrder]],
      include: [{ model: Product, as: "product", attributes: ["id", "title", "thumbnailImage"] }],
    });

    return res.json({
      sellerReviews: rows,
      pagination: {
        totalItems: count,
        totalPages: Math.ceil(count / limit),
        currentPage: page,
        limit,
      },
    });
  } catch (error) {
    console.error("listSellerReviews:", error);
    return res.status(500).json({ message: "Failed to fetch seller reviews." });
  }
}

/**
 * GET /admin/seller-reviews/by-product/:productId?page&limit
 */
async function listByProduct(req, res) {
  try {
    const productId = parseInt(req.params.productId, 10);
    if (!productId) {
      return res.status(400).json({ message: "Invalid product id." });
    }

    const product = await Product.findByPk(productId, { attributes: ["id", "title", "thumbnailImage"] });
    if (!product) {
      return res.status(404).json({ message: "Product not found." });
    }

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));

    const { count, rows } = await SellerReview.findAndCountAll({
      where: { productId },
      limit,
      offset: (page - 1) * limit,
      order: [
        ["reviewDate", "DESC"],
        ["createdAt", "DESC"],
      ],
      include: [{ model: Product, as: "product", attributes: ["id", "title", "thumbnailImage"] }],
    });

    return res.json({
      product,
      sellerReviews: rows,
      pagination: {
        totalItems: count,
        totalPages: Math.ceil(count / limit),
        currentPage: page,
        limit,
      },
    });
  } catch (error) {
    console.error("listByProduct:", error);
    return res.status(500).json({ message: "Failed to fetch reviews for product." });
  }
}

/**
 * GET /admin/seller-reviews/:id
 */
async function getOne(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    const row = await SellerReview.findByPk(id, {
      include: [{ model: Product, as: "product", attributes: ["id", "title", "thumbnailImage"] }],
    });
    if (!row) {
      return res.status(404).json({ message: "Seller review not found." });
    }
    return res.json({ sellerReview: row });
  } catch (error) {
    console.error("getOne seller review:", error);
    return res.status(500).json({ message: "Failed to fetch seller review." });
  }
}

/**
 * POST /admin/seller-reviews (multipart: productId, name, rating, message, images 1–5)
 */
async function create(req, res) {
  try {
    const { productId: pidRaw, name, message } = req.body;
    const productId = parseInt(pidRaw, 10);
    const rating = parseRating(req.body);
    const files = req.files || [];

    const dateRes = resolveReviewDateForCreate(req.body);
    if (!dateRes.ok) {
      return res.status(400).json({ message: "Invalid review date. Use YYYY-MM-DD." });
    }

    if (!name || !String(name).trim()) {
      return res.status(400).json({ message: "Name is required." });
    }
    if (rating < 1 || rating > 5) {
      return res.status(400).json({ message: "Rating must be between 1 and 5." });
    }
    if (!productId) {
      return res.status(400).json({ message: "Product is required." });
    }
    if (files.length < 1 || files.length > 5) {
      return res.status(400).json({ message: "Upload between 1 and 5 images." });
    }

    const product = await Product.findByPk(productId);
    if (!product) {
      unlinkPublicImages(filesToPublicPaths(files));
      return res.status(404).json({ message: "Product not found." });
    }

    const images = filesToPublicPaths(files);
    const adminId = req.admin?.adminId ?? null;

    const sellerReview = await SellerReview.create({
      productId,
      adminId,
      name: String(name).trim(),
      rating,
      message: message != null ? String(message).trim() || null : null,
      reviewDate: dateRes.value,
      images,
    });

    const withProduct = await SellerReview.findByPk(sellerReview.id, {
      include: [{ model: Product, as: "product", attributes: ["id", "title", "thumbnailImage"] }],
    });

    return res.status(201).json({ sellerReview: withProduct });
  } catch (error) {
    console.error("create seller review:", error);
    if (req.files?.length) unlinkPublicImages(filesToPublicPaths(req.files));
    return res.status(500).json({ message: "Failed to create seller review." });
  }
}

/**
 * PUT /admin/seller-reviews/:id (multipart: name, rating, message, existingImages JSON string, images 0–5)
 */
async function update(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    const row = await SellerReview.findByPk(id);
    if (!row) {
      if (req.files?.length) unlinkPublicImages(filesToPublicPaths(req.files));
      return res.status(404).json({ message: "Seller review not found." });
    }

    const { name, message } = req.body;
    const rating = req.body.rating !== undefined ? parseRating(req.body) : row.rating;
    const existing = parseExistingImages(req.body);
    const newFiles = req.files || [];
    const newPaths = filesToPublicPaths(newFiles);

    for (const p of existing) {
      if (typeof p !== "string" || !p.includes("seller-reviews")) {
        return res.status(400).json({ message: "Invalid existing image path." });
      }
    }

    const merged = [...existing, ...newPaths];
    if (merged.length < 1 || merged.length > 5) {
      unlinkPublicImages(newPaths);
      return res.status(400).json({ message: "Total images must be between 1 and 5." });
    }

    if (name !== undefined && !String(name).trim()) {
      unlinkPublicImages(newPaths);
      return res.status(400).json({ message: "Name cannot be empty." });
    }
    if (rating < 1 || rating > 5) {
      unlinkPublicImages(newPaths);
      return res.status(400).json({ message: "Rating must be between 1 and 5." });
    }

    const prev = Array.isArray(row.images) ? row.images : [];
    const removed = prev.filter((p) => !merged.includes(p));
    unlinkPublicImages(removed);

    const updatePayload = {
      ...(name !== undefined && { name: String(name).trim() }),
      ...(req.body.rating !== undefined && { rating }),
      ...(message !== undefined && { message: message != null ? String(message).trim() || null : null }),
      images: merged,
    };

    if (req.body.reviewDate !== undefined) {
      const raw = req.body.reviewDate;
      if (raw === null || raw === "") {
        updatePayload.reviewDate = null;
      } else {
        const parsed = parseReviewDate(String(raw));
        if (!parsed) {
          unlinkPublicImages(newPaths);
          return res.status(400).json({ message: "Invalid review date. Use YYYY-MM-DD." });
        }
        updatePayload.reviewDate = parsed;
      }
    }

    await row.update(updatePayload);

    const withProduct = await SellerReview.findByPk(row.id, {
      include: [{ model: Product, as: "product", attributes: ["id", "title", "thumbnailImage"] }],
    });

    return res.json({ sellerReview: withProduct });
  } catch (error) {
    console.error("update seller review:", error);
    if (req.files?.length) unlinkPublicImages(filesToPublicPaths(req.files));
    return res.status(500).json({ message: "Failed to update seller review." });
  }
}

/**
 * DELETE /admin/seller-reviews/:id
 */
async function remove(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    const row = await SellerReview.findByPk(id);
    if (!row) {
      return res.status(404).json({ message: "Seller review not found." });
    }
    const imgs = Array.isArray(row.images) ? row.images : [];
    await row.destroy();
    unlinkPublicImages(imgs);
    return res.status(204).send();
  } catch (error) {
    console.error("delete seller review:", error);
    return res.status(500).json({ message: "Failed to delete seller review." });
  }
}

module.exports = {
  getPerProductStats,
  listSellerReviews,
  listByProduct,
  getOne,
  create,
  update,
  remove,
};
