const multer = require("multer");
const path = require("path");

const storage = multer.diskStorage({
  destination: "./uploads/images/",
  filename(req, file, cb) {
    cb(null, `${file.fieldname}-${Date.now()}${path.extname(file.originalname)}`);
  },
});

function checkFileType(file, cb) {
  const filetypes = /jpeg|jpg|webp|png/;
  const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = filetypes.test(file.mimetype);

  if (mimetype && extname) return cb(null, true);
  return cb("Error: Images Only!");
}

const blogUpload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter(req, file, cb) {
    checkFileType(file, cb);
  },
}).single("featuredImage");

module.exports = blogUpload;
