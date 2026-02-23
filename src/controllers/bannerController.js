const path = require("path");
const fs = require("fs").promises;
const { imageSizeFromFile } = require("image-size/fromFile");
const { Banner } = require("../models");

// Desktop: 1521 x 516 — allow ±~100px tolerance
const DESKTOP_WIDTH_MIN = 1400;
const DESKTOP_WIDTH_MAX = 1650;
const DESKTOP_HEIGHT_MIN = 450;
const DESKTOP_HEIGHT_MAX = 580;

// Mobile: 531 x 316 — allow ±~50px tolerance
const MOBILE_WIDTH_MIN = 480;
const MOBILE_WIDTH_MAX = 580;
const MOBILE_HEIGHT_MIN = 280;
const MOBILE_HEIGHT_MAX = 350;

function validateDesktopDimensions(width, height) {
  return (
    width >= DESKTOP_WIDTH_MIN &&
    width <= DESKTOP_WIDTH_MAX &&
    height >= DESKTOP_HEIGHT_MIN &&
    height <= DESKTOP_HEIGHT_MAX
  );
}

function validateMobileDimensions(width, height) {
  return (
    width >= MOBILE_WIDTH_MIN &&
    width <= MOBILE_WIDTH_MAX &&
    height >= MOBILE_HEIGHT_MIN &&
    height <= MOBILE_HEIGHT_MAX
  );
}

async function deleteFileIfExists(filePath) {
  if (!filePath) return;
  const absolutePath = path.join(__dirname, "..", "..", filePath.replace(/^\//, ""));
  try {
    await fs.unlink(absolutePath);
  } catch (e) {
    if (e.code !== "ENOENT") console.error("Error deleting file:", e);
  }
}

/**
 * Public: get all banners for billboard (ordered by sortOrder)
 */
async function getAllBanners(req, res) {
  try {
    const banners = await Banner.findAll({
      order: [["sortOrder", "ASC"], ["id", "ASC"]],
      attributes: ["id", "desktopImageUrl", "mobileImageUrl", "sortOrder"],
    });
    res.status(200).json({ success: true, banners });
  } catch (error) {
    console.error("getAllBanners:", error);
    res.status(500).json({ success: false, message: "Failed to fetch banners." });
  }
}

/**
 * Admin: get all banners (same as public, for admin list)
 */
async function getAllBannersAdmin(req, res) {
  return getAllBanners(req, res);
}

/**
 * Admin: create a new banner (expects multipart: desktopImage, mobileImage)
 */
async function createBanner(req, res) {
  let desktopPath = null;
  let mobilePath = null;

  try {
    const files = req.files || {};
    const desktopFile = files.desktopImage?.[0];
    const mobileFile = files.mobileImage?.[0];

    if (!desktopFile || !mobileFile) {
      if (desktopFile) await deleteFileIfExists(`/uploads/images/banners/${desktopFile.filename}`);
      if (mobileFile) await deleteFileIfExists(`/uploads/images/banners/${mobileFile.filename}`);
      return res.status(400).json({
        success: false,
        message: "Both desktop and mobile images are required.",
      });
    }

    // Use multer's .path so we read from the same location the file was saved (cwd-relative)
    const desktopFullPath = desktopFile.path;
    const mobileFullPath = mobileFile.path;

    let desktopDimensions, mobileDimensions;
    try {
      desktopDimensions = await imageSizeFromFile(desktopFullPath);
      mobileDimensions = await imageSizeFromFile(mobileFullPath);
    } catch (dimErr) {
      await deleteFileIfExists(`/uploads/images/banners/${desktopFile.filename}`);
      await deleteFileIfExists(`/uploads/images/banners/${mobileFile.filename}`);
      const errMsg = dimErr && dimErr.message ? dimErr.message : "Unsupported or invalid image.";
      return res.status(400).json({
        success: false,
        message: `Could not read image dimensions. ${errMsg} Use JPEG, PNG, or WebP.`,
      });
    }

    const dW = desktopDimensions.width || 0;
    const dH = desktopDimensions.height || 0;
    const mW = mobileDimensions.width || 0;
    const mH = mobileDimensions.height || 0;

    if (!validateDesktopDimensions(dW, dH)) {
      await deleteFileIfExists(`/uploads/images/banners/${desktopFile.filename}`);
      await deleteFileIfExists(`/uploads/images/banners/${mobileFile.filename}`);
      return res.status(400).json({
        success: false,
        message: `Desktop image must be between ${DESKTOP_WIDTH_MIN}-${DESKTOP_WIDTH_MAX}px width and ${DESKTOP_HEIGHT_MIN}-${DESKTOP_HEIGHT_MAX}px height. Current: ${dW}×${dH}. Recommended: 1521×516.`,
      });
    }

    if (!validateMobileDimensions(mW, mH)) {
      await deleteFileIfExists(`/uploads/images/banners/${desktopFile.filename}`);
      await deleteFileIfExists(`/uploads/images/banners/${mobileFile.filename}`);
      return res.status(400).json({
        success: false,
        message: `Mobile image must be between ${MOBILE_WIDTH_MIN}-${MOBILE_WIDTH_MAX}px width and ${MOBILE_HEIGHT_MIN}-${MOBILE_HEIGHT_MAX}px height. Current: ${mW}×${mH}. Recommended: 531×316.`,
      });
    }

    desktopPath = `/uploads/images/banners/${desktopFile.filename}`;
    mobilePath = `/uploads/images/banners/${mobileFile.filename}`;

    const maxOrder = await Banner.max("sortOrder");
    const sortOrder = (maxOrder != null ? maxOrder : -1) + 1;

    const banner = await Banner.create({
      desktopImageUrl: desktopPath,
      mobileImageUrl: mobilePath,
      sortOrder,
    });

    res.status(201).json({ success: true, banner });
  } catch (error) {
    if (desktopPath) await deleteFileIfExists(desktopPath);
    if (mobilePath) await deleteFileIfExists(mobilePath);
    console.error("createBanner:", error);
    res.status(500).json({ success: false, message: error.message || "Failed to create banner." });
  }
}

/**
 * Admin: update banner (optional new desktop and/or mobile image; validate if provided)
 */
async function updateBanner(req, res) {
  const bannerId = parseInt(req.params.id, 10);
  const files = req.files || {};
  const desktopFile = files.desktopImage?.[0];
  const mobileFile = files.mobileImage?.[0];

  let newDesktopPath = null;
  let newMobilePath = null;

  try {
    const banner = await Banner.findByPk(bannerId);
    if (!banner) {
      if (desktopFile) await deleteFileIfExists(`/uploads/images/banners/${desktopFile.filename}`);
      if (mobileFile) await deleteFileIfExists(`/uploads/images/banners/${mobileFile.filename}`);
      return res.status(404).json({ success: false, message: "Banner not found." });
    }

    if (desktopFile) {
      let dims;
      try {
        dims = await imageSizeFromFile(desktopFile.path);
      } catch (e) {
        await deleteFileIfExists(`/uploads/images/banners/${desktopFile.filename}`);
        return res.status(400).json({
          success: false,
          message: "Could not read desktop image dimensions. Use JPEG, PNG, or WebP.",
        });
      }
      const w = dims.width || 0;
      const h = dims.height || 0;
      if (!validateDesktopDimensions(w, h)) {
        await deleteFileIfExists(`/uploads/images/banners/${desktopFile.filename}`);
        return res.status(400).json({
          success: false,
          message: `Desktop image must be ${DESKTOP_WIDTH_MIN}-${DESKTOP_WIDTH_MAX}×${DESKTOP_HEIGHT_MIN}-${DESKTOP_HEIGHT_MAX}px. Current: ${w}×${h}.`,
        });
      }
      newDesktopPath = `/uploads/images/banners/${desktopFile.filename}`;
    }

    if (mobileFile) {
      let dims;
      try {
        dims = await imageSizeFromFile(mobileFile.path);
      } catch (e) {
        await deleteFileIfExists(`/uploads/images/banners/${mobileFile.filename}`);
        if (newDesktopPath) await deleteFileIfExists(newDesktopPath);
        return res.status(400).json({
          success: false,
          message: "Could not read mobile image dimensions. Use JPEG, PNG, or WebP.",
        });
      }
      const w = dims.width || 0;
      const h = dims.height || 0;
      if (!validateMobileDimensions(w, h)) {
        await deleteFileIfExists(`/uploads/images/banners/${mobileFile.filename}`);
        if (newDesktopPath) await deleteFileIfExists(newDesktopPath);
        return res.status(400).json({
          success: false,
          message: `Mobile image must be ${MOBILE_WIDTH_MIN}-${MOBILE_WIDTH_MAX}×${MOBILE_HEIGHT_MIN}-${MOBILE_HEIGHT_MAX}px. Current: ${w}×${h}.`,
        });
      }
      newMobilePath = `/uploads/images/banners/${mobileFile.filename}`;
    }

    if (newDesktopPath) {
      await deleteFileIfExists(banner.desktopImageUrl);
      banner.desktopImageUrl = newDesktopPath;
    }
    if (newMobilePath) {
      await deleteFileIfExists(banner.mobileImageUrl);
      banner.mobileImageUrl = newMobilePath;
    }

    await banner.save();
    res.status(200).json({ success: true, banner });
  } catch (error) {
    if (newDesktopPath) await deleteFileIfExists(newDesktopPath);
    if (newMobilePath) await deleteFileIfExists(newMobilePath);
    console.error("updateBanner:", error);
    res.status(500).json({ success: false, message: error.message || "Failed to update banner." });
  }
}

/**
 * Admin: delete banner and its image files
 */
async function deleteBanner(req, res) {
  const id = parseInt(req.params.id, 10);
  try {
    const banner = await Banner.findByPk(id);
    if (!banner) {
      return res.status(404).json({ success: false, message: "Banner not found." });
    }
    await deleteFileIfExists(banner.desktopImageUrl);
    await deleteFileIfExists(banner.mobileImageUrl);
    await banner.destroy();
    res.status(200).json({ success: true, message: "Banner deleted." });
  } catch (error) {
    console.error("deleteBanner:", error);
    res.status(500).json({ success: false, message: "Failed to delete banner." });
  }
}

/**
 * Admin: reorder banners (body: { order: [id1, id2, ...] })
 */
async function reorderBanners(req, res) {
  try {
    const { order: idOrder } = req.body;
    if (!Array.isArray(idOrder) || idOrder.length === 0) {
      return res.status(400).json({ success: false, message: "Invalid order array." });
    }
    for (let i = 0; i < idOrder.length; i++) {
      await Banner.update({ sortOrder: i }, { where: { id: idOrder[i] } });
    }
    const banners = await Banner.findAll({
      order: [["sortOrder", "ASC"], ["id", "ASC"]],
      attributes: ["id", "desktopImageUrl", "mobileImageUrl", "sortOrder"],
    });
    res.status(200).json({ success: true, banners });
  } catch (error) {
    console.error("reorderBanners:", error);
    res.status(500).json({ success: false, message: "Failed to reorder banners." });
  }
}

module.exports = {
  getAllBanners,
  getAllBannersAdmin,
  createBanner,
  updateBanner,
  deleteBanner,
  reorderBanners,
};
