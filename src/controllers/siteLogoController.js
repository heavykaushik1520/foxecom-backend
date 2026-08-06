const path = require("path");
const fs = require("fs").promises;
const { SiteLogo } = require("../models");

const LOGO_ID = 1;

async function deleteFileIfExists(filePath) {
  if (!filePath) return;
  const absolutePath = path.join(__dirname, "..", "..", filePath.replace(/^\//, ""));
  try {
    await fs.unlink(absolutePath);
  } catch (e) {
    if (e.code !== "ENOENT") console.error("Error deleting logo file:", e);
  }
}

async function getSiteLogo(req, res) {
  try {
    const logo = await SiteLogo.findByPk(LOGO_ID, {
      attributes: ["id", "imageUrl", "updatedAt"],
    });
    res.status(200).json({ success: true, logo: logo || null });
  } catch (error) {
    console.error("getSiteLogo:", error);
    res.status(500).json({ success: false, message: "Failed to fetch site logo." });
  }
}

async function updateSiteLogo(req, res) {
  let newImagePath = null;

  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({
        success: false,
        message: "Logo image is required.",
      });
    }

    newImagePath = `/uploads/images/logo/${file.filename}`;

    let logo = await SiteLogo.findByPk(LOGO_ID);
    if (logo) {
      await deleteFileIfExists(logo.imageUrl);
      logo.imageUrl = newImagePath;
      await logo.save();
    } else {
      logo = await SiteLogo.create({
        id: LOGO_ID,
        imageUrl: newImagePath,
      });
    }

    res.status(200).json({ success: true, logo });
  } catch (error) {
    if (newImagePath) await deleteFileIfExists(newImagePath);
    console.error("updateSiteLogo:", error);
    res.status(500).json({ success: false, message: error.message || "Failed to update site logo." });
  }
}

module.exports = {
  getSiteLogo,
  updateSiteLogo,
};
