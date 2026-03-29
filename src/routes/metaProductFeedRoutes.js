const express = require("express");
const { getMetaProductFeedCsv } = require("../controllers/metaProductFeedController");
const { isAdmin } = require("../middleware/authMiddleware");

const router = express.Router();

// Admin-protected CSV feed for Meta/Facebook Product Catalog.
router.get("/meta-product-feed.csv", isAdmin, getMetaProductFeedCsv);

module.exports = router;
