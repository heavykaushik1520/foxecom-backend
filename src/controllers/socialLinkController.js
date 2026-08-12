const { SocialLink } = require("../models");

function parseBoolean(value) {
  if (value === true || value === false) return value;
  if (typeof value === "number") return value === 1;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "1") return true;
    if (normalized === "false" || normalized === "0") return false;
  }
  return undefined;
}

/**
 * Public: Get active social links for footer
 */
async function getPublicSocialLinks(req, res) {
  try {
    const socialLinks = await SocialLink.findAll({
      where: { isActive: true },
      order: [["sortOrder", "ASC"], ["id", "ASC"]],
    });

    return res.status(200).json({
      success: true,
      socialLinks,
    });
  } catch (error) {
    console.error("getPublicSocialLinks error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch social media links.",
    });
  }
}

/**
 * Admin: Get all social links
 */
async function getAllSocialLinks(req, res) {
  try {
    const socialLinks = await SocialLink.findAll({
      order: [["sortOrder", "ASC"], ["id", "ASC"]],
    });

    return res.status(200).json({
      success: true,
      socialLinks,
    });
  } catch (error) {
    console.error("getAllSocialLinks error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch social media links.",
    });
  }
}

/**
 * Admin: Create social link
 */
async function createSocialLink(req, res) {
  try {
    let icon = "";
    if (req.file) {
      // Relative URL path for uploaded file
      icon = `/uploads/images/social/${req.file.filename}`;
    } else if (req.body.icon) {
      icon = String(req.body.icon).trim();
    }

    const link = String(req.body.link || "").trim();
    const isActive = parseBoolean(req.body.isActive) ?? true;
    const sortOrder = Number.isInteger(Number(req.body.sortOrder)) ? Number(req.body.sortOrder) : 0;

    if (!icon) {
      return res.status(400).json({
        success: false,
        message: "Icon is required (upload an image file or provide an icon URL/class).",
      });
    }

    if (!link) {
      return res.status(400).json({
        success: false,
        message: "Target link URL is required.",
      });
    }

    const socialLink = await SocialLink.create({
      icon,
      link,
      isActive,
      sortOrder,
    });

    return res.status(201).json({
      success: true,
      message: "Social media link created successfully.",
      socialLink,
    });
  } catch (error) {
    console.error("createSocialLink error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to create social media link.",
    });
  }
}

/**
 * Admin: Update social link
 */
async function updateSocialLink(req, res) {
  try {
    const id = Number(req.params.id);
    const socialLink = await SocialLink.findByPk(id);

    if (!socialLink) {
      return res.status(404).json({
        success: false,
        message: "Social media link not found.",
      });
    }

    if (req.file) {
      socialLink.icon = `/uploads/images/social/${req.file.filename}`;
    } else if (req.body.icon !== undefined) {
      const iconStr = String(req.body.icon).trim();
      if (iconStr) {
        socialLink.icon = iconStr;
      }
    }

    if (req.body.link !== undefined) {
      const linkStr = String(req.body.link).trim();
      if (!linkStr) {
        return res.status(400).json({
          success: false,
          message: "Target link URL cannot be empty.",
        });
      }
      socialLink.link = linkStr;
    }

    if (req.body.isActive !== undefined) {
      const parsedActive = parseBoolean(req.body.isActive);
      if (parsedActive !== undefined) {
        socialLink.isActive = parsedActive;
      }
    }

    if (req.body.sortOrder !== undefined) {
      const parsedOrder = Number(req.body.sortOrder);
      if (!isNaN(parsedOrder)) {
        socialLink.sortOrder = parsedOrder;
      }
    }

    await socialLink.save();

    return res.status(200).json({
      success: true,
      message: "Social media link updated successfully.",
      socialLink,
    });
  } catch (error) {
    console.error("updateSocialLink error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update social media link.",
    });
  }
}

/**
 * Admin: Toggle social link active status
 */
async function toggleSocialLinkStatus(req, res) {
  try {
    const id = Number(req.params.id);
    const socialLink = await SocialLink.findByPk(id);

    if (!socialLink) {
      return res.status(404).json({
        success: false,
        message: "Social media link not found.",
      });
    }

    const requestedState = parseBoolean(req.body?.isActive);
    socialLink.isActive = requestedState !== undefined ? requestedState : !Boolean(socialLink.isActive);

    await socialLink.save();

    return res.status(200).json({
      success: true,
      message: `Social link ${socialLink.isActive ? "activated" : "deactivated"} successfully.`,
      socialLink,
    });
  } catch (error) {
    console.error("toggleSocialLinkStatus error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to toggle social media link status.",
    });
  }
}

/**
 * Admin: Delete social link
 */
async function deleteSocialLink(req, res) {
  try {
    const id = Number(req.params.id);
    const deleted = await SocialLink.destroy({ where: { id } });

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: "Social media link not found.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Social media link deleted successfully.",
    });
  } catch (error) {
    console.error("deleteSocialLink error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete social media link.",
    });
  }
}

module.exports = {
  getPublicSocialLinks,
  getAllSocialLinks,
  createSocialLink,
  updateSocialLink,
  toggleSocialLinkStatus,
  deleteSocialLink,
};
