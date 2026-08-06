const { SiteButtonTheme } = require("../models");

const THEME_ID = 1;

const SOLID_GREEN = { bg: "#547535", hover: "#7aa84a", text: "#000000" };
const BUY_NOW_GREEN = { bg: "#6b9538", hover: "#5a7e2f", text: "#000000", border: "#6b9538" };
const SECONDARY = { bg: "#ffffff", hover: "#f8f9fa", text: "#212529", border: "#6c757d" };
const OUTLINE_DANGER = {
  bg: "transparent",
  hover: "#dc3545",
  text: "#dc3545",
  border: "#dc3545",
  hoverText: "#ffffff",
};
const OUTLINE_SECONDARY = {
  bg: "transparent",
  hover: "#6c757d",
  text: "#6c757d",
  border: "#6c757d",
  hoverText: "#ffffff",
};

const DEFAULT_BUTTON_THEME = {
  addToCart: { ...SOLID_GREEN },
  addToCartDetail: { bg: "#547535", hover: "#7aa84a", text: "#000000", border: "#547535" },
  buyNow: { ...BUY_NOW_GREEN },
  checkout: { ...SOLID_GREEN },
  proceedPayment: { ...SOLID_GREEN },
  contactSubmit: { ...SOLID_GREEN },
  continueShopping: { ...SOLID_GREEN },
  secondary: { ...SECONDARY },
  removeClear: { ...OUTLINE_DANGER },
  quantityFilter: { ...OUTLINE_SECONDARY },
};

const HEX_COLOR_REGEX = /^#([0-9A-Fa-f]{6})$/;

function isValidColor(value) {
  return typeof value === "string" && (value === "transparent" || HEX_COLOR_REGEX.test(value));
}

function migrateLegacyTheme(colors) {
  if (!colors || typeof colors !== "object") return {};

  const migrated = { ...colors };
  const primary = migrated.primary;
  const success = migrated.success;

  if (primary) {
    const solid = { bg: primary.bg, hover: primary.hover, text: primary.text };
    migrated.addToCart = migrated.addToCart || { ...solid };
    migrated.addToCartDetail =
      migrated.addToCartDetail ||
      { bg: primary.bg, hover: primary.hover, text: primary.text, border: primary.bg };
    migrated.checkout = migrated.checkout || { ...solid };
    migrated.proceedPayment = migrated.proceedPayment || { ...solid };
    migrated.contactSubmit = migrated.contactSubmit || { ...solid };
    migrated.continueShopping = migrated.continueShopping || { ...solid };
  }

  if (success) {
    migrated.continueShopping = migrated.continueShopping || {
      bg: success.bg,
      hover: success.hover,
      text: success.text,
    };
  }

  if (migrated.outlineDanger && !migrated.removeClear) {
    migrated.removeClear = { ...migrated.outlineDanger };
  }

  if (migrated.outlineSecondary && !migrated.quantityFilter) {
    migrated.quantityFilter = { ...migrated.outlineSecondary };
  }

  return migrated;
}

function mergeWithDefaults(colors) {
  const migrated = migrateLegacyTheme(colors);
  const merged = {};

  for (const [key, defaults] of Object.entries(DEFAULT_BUTTON_THEME)) {
    merged[key] = { ...defaults, ...(migrated?.[key] || {}) };
  }

  return merged;
}

function parseStoredColors(raw) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return mergeWithDefaults(parsed);
  } catch {
    return null;
  }
}

function validateColors(colors) {
  if (!colors || typeof colors !== "object") {
    return "Invalid button colors payload.";
  }

  const merged = mergeWithDefaults(colors);

  for (const [groupKey, defaults] of Object.entries(DEFAULT_BUTTON_THEME)) {
    const group = merged[groupKey];
    if (!group || typeof group !== "object") {
      return `Missing button group: ${groupKey}.`;
    }

    for (const field of Object.keys(defaults)) {
      if (!isValidColor(group[field])) {
        return `Invalid color for ${groupKey}.${field}. Use #RRGGBB or transparent.`;
      }
    }
  }

  return null;
}

async function getOrCreateThemeRow() {
  let theme = await SiteButtonTheme.findByPk(THEME_ID);
  if (!theme) {
    theme = await SiteButtonTheme.create({ id: THEME_ID });
  }
  return theme;
}

async function getPublishedButtonTheme(req, res) {
  try {
    const theme = await SiteButtonTheme.findByPk(THEME_ID, {
      attributes: ["publishedColors", "updatedAt"],
    });
    const colors = parseStoredColors(theme?.publishedColors) || DEFAULT_BUTTON_THEME;
    res.status(200).json({ success: true, colors, updatedAt: theme?.updatedAt || null });
  } catch (error) {
    console.error("getPublishedButtonTheme:", error);
    res.status(500).json({ success: false, message: "Failed to fetch button theme." });
  }
}

async function getAdminButtonTheme(req, res) {
  try {
    const theme = await SiteButtonTheme.findByPk(THEME_ID, {
      attributes: ["draftColors", "publishedColors", "updatedAt"],
    });

    const publishedColors = parseStoredColors(theme?.publishedColors) || DEFAULT_BUTTON_THEME;
    const draftColors = parseStoredColors(theme?.draftColors) || publishedColors;

    res.status(200).json({
      success: true,
      draftColors,
      publishedColors,
      defaults: DEFAULT_BUTTON_THEME,
      updatedAt: theme?.updatedAt || null,
    });
  } catch (error) {
    console.error("getAdminButtonTheme:", error);
    res.status(500).json({ success: false, message: "Failed to fetch button theme." });
  }
}

async function saveDraftButtonTheme(req, res) {
  try {
    const validationError = validateColors(req.body?.colors);
    if (validationError) {
      return res.status(400).json({ success: false, message: validationError });
    }

    const colors = mergeWithDefaults(req.body.colors);
    const theme = await getOrCreateThemeRow();
    theme.draftColors = JSON.stringify(colors);
    await theme.save();

    res.status(200).json({
      success: true,
      message: "Draft saved.",
      draftColors: colors,
    });
  } catch (error) {
    console.error("saveDraftButtonTheme:", error);
    res.status(500).json({ success: false, message: "Failed to save draft button theme." });
  }
}

async function publishButtonTheme(req, res) {
  try {
    const validationError = validateColors(req.body?.colors);
    if (validationError) {
      return res.status(400).json({ success: false, message: validationError });
    }

    const colors = mergeWithDefaults(req.body.colors);
    const theme = await getOrCreateThemeRow();
    theme.draftColors = JSON.stringify(colors);
    theme.publishedColors = JSON.stringify(colors);
    await theme.save();

    res.status(200).json({
      success: true,
      message: "Button colors published.",
      colors,
    });
  } catch (error) {
    console.error("publishButtonTheme:", error);
    res.status(500).json({ success: false, message: "Failed to publish button theme." });
  }
}

module.exports = {
  getPublishedButtonTheme,
  getAdminButtonTheme,
  saveDraftButtonTheme,
  publishButtonTheme,
  DEFAULT_BUTTON_THEME,
};
