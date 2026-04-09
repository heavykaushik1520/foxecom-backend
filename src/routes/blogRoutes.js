const express = require("express");
const router = express.Router();
const { isAdmin } = require("../middleware/authMiddleware");
const blogUpload = require("../middleware/blogUpload");
const blogController = require("../controllers/blogController");

// Public APIs
router.get("/blogs", blogController.getPublishedBlogs);
router.get("/blogs/featured", blogController.getFeaturedBlogs);
router.get("/blogs/tags", blogController.getBlogTags);
router.get("/blogs/:slug/related", blogController.getRelatedBlogs);
router.get("/blogs/:slug/related-products", blogController.getRelatedProducts);
router.get("/blog/:slug", blogController.getPublishedBlogBySlug);

// Admin APIs
router.get("/admin/blogs", isAdmin, blogController.getAdminBlogs);
router.get("/admin/blogs/:id", isAdmin, blogController.getBlogByIdAdmin);
router.get("/admin/blogs/:id/preview", isAdmin, blogController.getBlogPreview);
router.post("/admin/blogs", isAdmin, blogUpload, blogController.createBlog);
router.put("/admin/blogs/:id", isAdmin, blogUpload, blogController.updateBlog);
router.delete("/admin/blogs/:id", isAdmin, blogController.deleteBlog);
router.patch("/admin/blogs/:id/status", isAdmin, blogController.setBlogStatus);
router.patch("/admin/blogs/:id/featured", isAdmin, blogController.toggleBlogFeatured);

module.exports = router;
