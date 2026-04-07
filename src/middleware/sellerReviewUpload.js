const multer = require("multer");
const path = require("path");
const fs = require("fs");

const dir = "./uploads/images/seller-reviews";
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: dir,
  filename(req, file, cb) {
    cb(null, `sr-${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`);
  },
});

function checkFileType(file, cb) {
  const filetypes = /jpeg|jpg|webp|png/;
  const ext = path.extname(file.originalname).toLowerCase();
  if (filetypes.test(ext) && /image\/(jpeg|jpg|webp|png)/.test(file.mimetype)) {
    return cb(null, true);
  }
  cb(new Error("Only images (jpeg, jpg, webp, png) are allowed."));
}

const sellerReviewUpload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter(req, file, cb) {
    checkFileType(file, cb);
  },
}).array("images", 5);

module.exports = sellerReviewUpload;
