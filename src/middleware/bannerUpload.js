// Multer config for billboard banner uploads: desktop + mobile images
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const bannerDir = "./uploads/images/banners";
if (!fs.existsSync(bannerDir)) {
  fs.mkdirSync(bannerDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: bannerDir,
  filename: function (req, file, cb) {
    const prefix = file.fieldname === "desktopImage" ? "desktop" : "mobile";
    cb(null, `${prefix}-${Date.now()}${path.extname(file.originalname)}`);
  },
});

function checkFileType(file, cb) {
  const filetypes = /jpeg|jpg|webp|png/;
  const ext = path.extname(file.originalname).toLowerCase();
  const mimetype = file.mimetype;
  if (filetypes.test(ext) && /image\/(jpeg|jpg|webp|png)/.test(mimetype)) {
    return cb(null, true);
  }
  cb(new Error("Only images (jpeg, jpg, webp, png) are allowed."));
}

const bannerUpload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB per file
  fileFilter: function (req, file, cb) {
    checkFileType(file, cb);
  },
}).fields([
  { name: "desktopImage", maxCount: 1 },
  { name: "mobileImage", maxCount: 1 },
]);

module.exports = bannerUpload;
