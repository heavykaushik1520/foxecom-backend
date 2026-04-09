const { Op } = require("sequelize");
const {
  Blog,
  BlogTag,
  Product,
  BlogTagMap,
  BlogRelatedProduct,
} = require("../models");
const {
  slugifyFromTitle,
  normalizeSlugInput,
  ensureUniqueSlug,
} = require("../utils/blogSlug");
const { validateBlogPayload } = require("../validation/blogValidation");
const { sanitizeBlogHtml } = require("../utils/blogContentSanitizer");
const { generateSitemap } = require("../utils/generateSitemap");

const blogIncludeForDetail = [
  { model: BlogTag, as: "tags", through: { attributes: [] } },
  {
    model: Product,
    as: "relatedProducts",
    through: { attributes: ["sortOrder"] },
    attributes: ["id", "title", "slug", "price", "discountPrice", "thumbnailImage"],
  },
];

function estimateReadingTime(contentHtml) {
  const stripped = String(contentHtml || "").replace(/<[^>]*>/g, " ");
  const words = stripped.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 200));
}

async function syncTags(blogId, tags = []) {
  await BlogTagMap.destroy({ where: { blogId } });
  if (!tags.length) return;

  const ids = [];
  for (const nameRaw of tags) {
    const name = String(nameRaw).trim();
    if (!name) continue;
    const slug = slugifyFromTitle(name);
    if (!slug) continue;
    const [tag] = await BlogTag.findOrCreate({
      where: { slug },
      defaults: { name, slug },
    });
    ids.push(tag.id);
  }

  const uniqueTagIds = [...new Set(ids)];
  if (!uniqueTagIds.length) return;
  await BlogTagMap.bulkCreate(
    uniqueTagIds.map((tagId) => ({ blogId, tagId })),
    { ignoreDuplicates: true }
  );
}

async function syncRelatedProducts(blogId, relatedProductIds = []) {
  if (relatedProductIds.length > 10) {
    throw new Error("A blog can have at most 10 related products.");
  }
  await BlogRelatedProduct.destroy({ where: { blogId } });
  if (!relatedProductIds.length) return;

  const products = await Product.findAll({
    where: { id: { [Op.in]: relatedProductIds } },
    attributes: ["id"],
  });
  const existingProductIds = new Set(products.map((p) => p.id));
  const rows = relatedProductIds
    .filter((id, idx) => Number.isInteger(id) && existingProductIds.has(id) && relatedProductIds.indexOf(id) === idx)
    .map((productId, idx) => ({ blogId, productId, sortOrder: idx }));

  if (rows.length) {
    await BlogRelatedProduct.bulkCreate(rows, { ignoreDuplicates: true });
  }
}

function normalizeBlogOutput(blogModel) {
  if (!blogModel) return null;
  const blog = blogModel.toJSON ? blogModel.toJSON() : blogModel;
  if (Array.isArray(blog.relatedProducts)) {
    blog.relatedProducts = blog.relatedProducts
      .slice()
      .sort((a, b) => (a.BlogRelatedProduct?.sortOrder || 0) - (b.BlogRelatedProduct?.sortOrder || 0));
  }
  return blog;
}

async function regenerateSitemapSafe() {
  try {
    await generateSitemap();
  } catch (err) {
    console.error("Sitemap regeneration failed after blog change:", err.message);
  }
}

async function createBlog(req, res) {
  try {
    const { errors, normalized } = validateBlogPayload(req.body, { isUpdate: false });
    if (errors.length) return res.status(400).json({ success: false, errors });

    let slug;
    if (normalized.slug) {
      const parsed = normalizeSlugInput(normalized.slug);
      if (parsed && typeof parsed === "object" && parsed.error) {
        return res.status(400).json({ success: false, message: parsed.error });
      }
      slug = parsed;
      const exists = await Blog.findOne({ where: { slug } });
      if (exists) return res.status(409).json({ success: false, message: "Slug already in use." });
    } else {
      slug = await ensureUniqueSlug(Blog, slugifyFromTitle(normalized.title), null);
    }

    const status = normalized.status || "draft";
    const sanitizedContent = sanitizeBlogHtml(normalized.contentHtml);
    if (!sanitizedContent || !sanitizedContent.replace(/<[^>]*>/g, "").trim()) {
      return res.status(400).json({ success: false, message: "Content is required after sanitization." });
    }
    const blog = await Blog.create({
      title: normalized.title,
      slug,
      excerpt: normalized.excerpt || null,
      contentHtml: sanitizedContent,
      featuredImage: req.file ? `/uploads/images/${req.file.filename}` : null,
      featuredImageAlt: normalized.featuredImageAlt || null,
      videoUrl: normalized.videoUrl || null,
      authorName: normalized.authorName || null,
      status,
      isFeatured: normalized.isFeatured,
      seoTitle: normalized.seoTitle || null,
      seoDescription: normalized.seoDescription || null,
      seoKeywords: normalized.seoKeywords || null,
      canonicalUrl: normalized.canonicalUrl || null,
      publishedAt: status === "published" ? new Date() : null,
    });

    await syncTags(blog.id, normalized.tags);
    await syncRelatedProducts(blog.id, normalized.relatedProductIds);

    const created = await Blog.findByPk(blog.id, { include: blogIncludeForDetail });
    await regenerateSitemapSafe();
    return res.status(201).json({ success: true, blog: normalizeBlogOutput(created) });
  } catch (error) {
    console.error("Error creating blog:", error);
    return res.status(500).json({ success: false, message: "Failed to create blog", error: error.message });
  }
}

async function updateBlog(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    const blog = await Blog.findByPk(id);
    if (!blog) return res.status(404).json({ success: false, message: "Blog not found." });

    const { errors, normalized } = validateBlogPayload(req.body, { isUpdate: true });
    if (errors.length) return res.status(400).json({ success: false, errors });

    if (Object.prototype.hasOwnProperty.call(req.body, "slug")) {
      const parsed = normalizeSlugInput(normalized.slug || "");
      if (parsed && typeof parsed === "object" && parsed.error) {
        return res.status(400).json({ success: false, message: parsed.error });
      }
      if (parsed) {
        const exists = await Blog.findOne({ where: { slug: parsed, id: { [Op.ne]: id } } });
        if (exists) return res.status(409).json({ success: false, message: "Slug already in use." });
        blog.slug = parsed;
      } else {
        blog.slug = await ensureUniqueSlug(Blog, slugifyFromTitle(normalized.title || blog.title), id);
      }
    } else if (normalized.title && normalized.title !== blog.title) {
      blog.slug = await ensureUniqueSlug(Blog, slugifyFromTitle(normalized.title), id);
    }

    if (normalized.title != null) blog.title = normalized.title;
    if (Object.prototype.hasOwnProperty.call(req.body, "excerpt")) blog.excerpt = normalized.excerpt;
    if (normalized.contentHtml != null) {
      const cleanHtml = sanitizeBlogHtml(normalized.contentHtml);
      if (!cleanHtml || !cleanHtml.replace(/<[^>]*>/g, "").trim()) {
        return res.status(400).json({ success: false, message: "Content is required after sanitization." });
      }
      blog.contentHtml = cleanHtml;
    }
    if (req.file) blog.featuredImage = `/uploads/images/${req.file.filename}`;
    if (Object.prototype.hasOwnProperty.call(req.body, "featuredImageAlt")) blog.featuredImageAlt = normalized.featuredImageAlt;
    if (Object.prototype.hasOwnProperty.call(req.body, "videoUrl")) blog.videoUrl = normalized.videoUrl;
    if (Object.prototype.hasOwnProperty.call(req.body, "authorName")) blog.authorName = normalized.authorName;
    if (Object.prototype.hasOwnProperty.call(req.body, "seoTitle")) blog.seoTitle = normalized.seoTitle;
    if (Object.prototype.hasOwnProperty.call(req.body, "seoDescription")) blog.seoDescription = normalized.seoDescription;
    if (Object.prototype.hasOwnProperty.call(req.body, "seoKeywords")) blog.seoKeywords = normalized.seoKeywords;
    if (Object.prototype.hasOwnProperty.call(req.body, "canonicalUrl")) blog.canonicalUrl = normalized.canonicalUrl;

    if (normalized.status) {
      blog.status = normalized.status;
      if (normalized.status === "published" && !blog.publishedAt) {
        blog.publishedAt = new Date();
      }
      if (normalized.status === "draft") {
        blog.publishedAt = null;
      }
    }

    if (Object.prototype.hasOwnProperty.call(req.body, "isFeatured")) {
      blog.isFeatured = normalized.isFeatured;
    }

    await blog.save();

    if (Object.prototype.hasOwnProperty.call(req.body, "tags")) {
      await syncTags(blog.id, normalized.tags);
    }
    if (Object.prototype.hasOwnProperty.call(req.body, "relatedProductIds")) {
      await syncRelatedProducts(blog.id, normalized.relatedProductIds);
    }

    const updated = await Blog.findByPk(blog.id, { include: blogIncludeForDetail });
    await regenerateSitemapSafe();
    return res.status(200).json({ success: true, blog: normalizeBlogOutput(updated) });
  } catch (error) {
    console.error("Error updating blog:", error);
    return res.status(500).json({ success: false, message: "Failed to update blog", error: error.message });
  }
}

async function deleteBlog(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    const deleted = await Blog.destroy({ where: { id } });
    if (!deleted) return res.status(404).json({ success: false, message: "Blog not found." });
    await regenerateSitemapSafe();
    return res.status(200).json({ success: true, message: "Blog deleted successfully." });
  } catch (error) {
    console.error("Error deleting blog:", error);
    return res.status(500).json({ success: false, message: "Failed to delete blog", error: error.message });
  }
}

async function getBlogByIdAdmin(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    const blog = await Blog.findByPk(id, { include: blogIncludeForDetail });
    if (!blog) return res.status(404).json({ success: false, message: "Blog not found." });
    return res.status(200).json({ success: true, blog: normalizeBlogOutput(blog) });
  } catch (error) {
    console.error("Error fetching admin blog by id:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch blog", error: error.message });
  }
}

async function getAdminBlogs(req, res) {
  try {
    const {
      page = 1,
      limit = 20,
      q,
      status,
      featured,
      sort = "newest",
    } = req.query;

    const where = {};
    if (status && ["draft", "published"].includes(String(status))) where.status = status;
    if (featured === "true") where.isFeatured = true;
    if (featured === "false") where.isFeatured = false;
    if (q) {
      where[Op.or] = [
        { title: { [Op.like]: `%${q}%` } },
        { slug: { [Op.like]: `%${q}%` } },
        { excerpt: { [Op.like]: `%${q}%` } },
      ];
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const offset = (pageNum - 1) * limitNum;
    const order = sort === "oldest" ? [["createdAt", "ASC"]] : [["createdAt", "DESC"]];

    const { count, rows } = await Blog.findAndCountAll({
      where,
      include: [{ model: BlogTag, as: "tags", through: { attributes: [] } }],
      limit: limitNum,
      offset,
      order,
    });

    return res.status(200).json({
      success: true,
      pagination: {
        totalItems: count,
        totalPages: Math.ceil(count / limitNum),
        currentPage: pageNum,
        limit: limitNum,
      },
      blogs: rows.map((row) => normalizeBlogOutput(row)),
    });
  } catch (error) {
    console.error("Error fetching admin blogs:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch blogs", error: error.message });
  }
}

async function setBlogStatus(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    const status = String(req.body.status || "").trim();
    if (!["draft", "published"].includes(status)) {
      return res.status(400).json({ success: false, message: "Status must be draft or published." });
    }
    const blog = await Blog.findByPk(id);
    if (!blog) return res.status(404).json({ success: false, message: "Blog not found." });

    blog.status = status;
    if (status === "published" && !blog.publishedAt) blog.publishedAt = new Date();
    if (status === "draft") blog.publishedAt = null;
    await blog.save();
    await regenerateSitemapSafe();

    return res.status(200).json({ success: true, blog: normalizeBlogOutput(blog) });
  } catch (error) {
    console.error("Error updating blog status:", error);
    return res.status(500).json({ success: false, message: "Failed to update status", error: error.message });
  }
}

async function toggleBlogFeatured(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    const blog = await Blog.findByPk(id);
    if (!blog) return res.status(404).json({ success: false, message: "Blog not found." });
    blog.isFeatured = !blog.isFeatured;
    await blog.save();
    await regenerateSitemapSafe();
    return res.status(200).json({ success: true, blog: normalizeBlogOutput(blog) });
  } catch (error) {
    console.error("Error toggling featured blog:", error);
    return res.status(500).json({ success: false, message: "Failed to toggle featured state", error: error.message });
  }
}

async function getBlogPreview(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    const blog = await Blog.findByPk(id, { include: blogIncludeForDetail });
    if (!blog) return res.status(404).json({ success: false, message: "Blog not found." });
    return res.status(200).json({
      success: true,
      preview: {
        ...normalizeBlogOutput(blog),
        readingTimeMinutes: estimateReadingTime(blog.contentHtml),
      },
    });
  } catch (error) {
    console.error("Error loading blog preview:", error);
    return res.status(500).json({ success: false, message: "Failed to load preview", error: error.message });
  }
}

async function getPublishedBlogs(req, res) {
  try {
    const { page = 1, limit = 9, q, tag, sort = "newest" } = req.query;
    const where = { status: "published" };
    if (q) {
      where[Op.or] = [
        { title: { [Op.like]: `%${q}%` } },
        { excerpt: { [Op.like]: `%${q}%` } },
      ];
    }

    const include = [{ model: BlogTag, as: "tags", through: { attributes: [] } }];
    if (tag) {
      include[0].where = { slug: String(tag).trim().toLowerCase() };
      include[0].required = true;
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 9));
    const offset = (pageNum - 1) * limitNum;
    const order = sort === "oldest" ? [["publishedAt", "ASC"]] : [["publishedAt", "DESC"]];

    const { count, rows } = await Blog.findAndCountAll({
      where,
      include,
      limit: limitNum,
      offset,
      order,
    });

    return res.status(200).json({
      success: true,
      pagination: {
        totalItems: count,
        totalPages: Math.ceil(count / limitNum),
        currentPage: pageNum,
        limit: limitNum,
      },
      blogs: rows.map((row) => normalizeBlogOutput(row)),
    });
  } catch (error) {
    console.error("Error fetching published blogs:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch blogs", error: error.message });
  }
}

async function getPublishedBlogBySlug(req, res) {
  try {
    const slug = String(req.params.slug || "").trim().toLowerCase();
    const blog = await Blog.findOne({
      where: { slug, status: "published" },
      include: blogIncludeForDetail,
    });
    if (!blog) return res.status(404).json({ success: false, message: "Blog not found." });

    return res.status(200).json({
      success: true,
      blog: {
        ...normalizeBlogOutput(blog),
        readingTimeMinutes: estimateReadingTime(blog.contentHtml),
      },
    });
  } catch (error) {
    console.error("Error fetching blog by slug:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch blog", error: error.message });
  }
}

async function getFeaturedBlogs(req, res) {
  try {
    const limit = Math.min(10, Math.max(1, parseInt(req.query.limit, 10) || 3));
    const blogs = await Blog.findAll({
      where: { status: "published", isFeatured: true },
      include: [{ model: BlogTag, as: "tags", through: { attributes: [] } }],
      order: [["publishedAt", "DESC"]],
      limit,
    });
    return res.status(200).json({ success: true, blogs: blogs.map((b) => normalizeBlogOutput(b)) });
  } catch (error) {
    console.error("Error fetching featured blogs:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch featured blogs", error: error.message });
  }
}

async function getRelatedBlogs(req, res) {
  try {
    const slug = String(req.params.slug || "").trim().toLowerCase();
    const baseBlog = await Blog.findOne({
      where: { slug, status: "published" },
      include: [{ model: BlogTag, as: "tags", through: { attributes: [] } }],
    });
    if (!baseBlog) return res.status(404).json({ success: false, message: "Blog not found." });

    const tagIds = baseBlog.tags.map((t) => t.id);
    if (!tagIds.length) return res.status(200).json({ success: true, blogs: [] });

    const blogs = await Blog.findAll({
      where: { id: { [Op.ne]: baseBlog.id }, status: "published" },
      include: [
        {
          model: BlogTag,
          as: "tags",
          where: { id: { [Op.in]: tagIds } },
          through: { attributes: [] },
          required: true,
        },
      ],
      order: [["publishedAt", "DESC"]],
      limit: 3,
    });
    return res.status(200).json({ success: true, blogs: blogs.map((b) => normalizeBlogOutput(b)) });
  } catch (error) {
    console.error("Error fetching related blogs:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch related blogs", error: error.message });
  }
}

async function getBlogTags(req, res) {
  try {
    const tags = await BlogTag.findAll({ order: [["name", "ASC"]] });
    return res.status(200).json({ success: true, tags });
  } catch (error) {
    console.error("Error fetching blog tags:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch tags", error: error.message });
  }
}

async function getRelatedProducts(req, res) {
  try {
    const slug = String(req.params.slug || "").trim().toLowerCase();
    const blog = await Blog.findOne({
      where: { slug, status: "published" },
      include: [
        {
          model: Product,
          as: "relatedProducts",
          through: { attributes: ["sortOrder"] },
          attributes: ["id", "title", "slug", "price", "discountPrice", "thumbnailImage"],
        },
      ],
    });
    if (!blog) return res.status(404).json({ success: false, message: "Blog not found." });
    const normalizedBlog = normalizeBlogOutput(blog);
    return res.status(200).json({ success: true, products: normalizedBlog.relatedProducts || [] });
  } catch (error) {
    console.error("Error fetching related products:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch related products", error: error.message });
  }
}

module.exports = {
  createBlog,
  updateBlog,
  deleteBlog,
  getBlogByIdAdmin,
  getAdminBlogs,
  setBlogStatus,
  toggleBlogFeatured,
  getBlogPreview,
  getPublishedBlogs,
  getPublishedBlogBySlug,
  getFeaturedBlogs,
  getRelatedBlogs,
  getBlogTags,
  getRelatedProducts,
};
