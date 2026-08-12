const multer = require("multer");
const path = require("path");
const fs = require("fs");

const socialDir = "./uploads/images/social";
if (!fs.existsSync(socialDir)) {
  fs.mkdirSync(socialDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: socialDir,
  filename(req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, `social-${uniqueSuffix}${path.extname(file.originalname)}`);
  },
});

function checkFileType(file, cb) {
  const filetypes = /jpeg|jpg|webp|png|svg|ico|gif/;
  const ext = path.extname(file.originalname).toLowerCase();
  const mimetype = file.mimetype;
  if (filetypes.test(ext) || mimetype.includes("svg") || mimetype.includes("image")) {
    return cb(null, true);
  }
  cb(new Error("Only image files (JPEG, JPG, PNG, WEBP, SVG, ICO, GIF) are allowed."));
}

const socialIconUpload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
  fileFilter(req, file, cb) {
    checkFileType(file, cb);
  },
}).single("iconFile");

// Middleware wrapper to catch Multer errors cleanly
const uploadSocialIconMiddleware = (req, res, next) => {
  socialIconUpload(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ success: false, message: `Upload error: ${err.message}` });
    } else if (err) {
      return res.status(400).json({ success: false, message: err.message });
    }
    next();
  });
};

module.exports = uploadSocialIconMiddleware;
