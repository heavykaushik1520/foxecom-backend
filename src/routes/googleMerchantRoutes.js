const express = require("express");
const {
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
} = require("../controllers/googleMerchantController");

const router = express.Router();

router.get("/google-merchant/validate-products", validateGoogleMerchantProducts);
router.get("/google-merchant/preview-all", previewAllGoogleMerchantProducts);

router.get("/google-merchant/feed.csv", generateGoogleMerchantCsvFeed);
router.get("/google-merchant/feed-preview", previewGoogleMerchantCsvFeed);

router.get("/google-merchant/products", listGoogleMerchantProductsController);
router.get("/google-merchant/products/:productId", getGoogleMerchantProductController);

router.post("/google-merchant/sync-all", syncAllGoogleMerchantProducts);
router.post("/google-merchant/sync/:slug", syncGoogleMerchantProduct);
router.delete("/google-merchant/delete/:offerId", deleteGoogleMerchantProduct);

router.get("/google-merchant/preview/:slug", previewGoogleMerchantProduct);

module.exports = router;
