const multer = require("multer");
const path = require("path");
const fs = require("fs");

const logoDir = "./uploads/images/logo";
if (!fs.existsSync(logoDir)) {
  fs.mkdirSync(logoDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: logoDir,
  filename(req, file, cb) {
    cb(null, `logo-${Date.now()}${path.extname(file.originalname)}`);
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

const logoUpload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter(req, file, cb) {
    checkFileType(file, cb);
  },
}).single("logo");

module.exports = logoUpload;
