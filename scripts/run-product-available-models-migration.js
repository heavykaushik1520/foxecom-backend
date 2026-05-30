/**
 * Creates product_available_models and adds cart/order line model columns.
 * Usage: node scripts/run-product-available-models-migration.js
 * Safe to run multiple times (skips existing objects where possible).
 */
require("dotenv").config({
  path: require("path").join(__dirname, "..", ".env"),
});
const { sequelize } = require("../src/config/db");

const CREATE_PAM = `
CREATE TABLE IF NOT EXISTS product_available_models (
  id INT AUTO_INCREMENT PRIMARY KEY,
  productId INT NOT NULL,
  brandId INT NOT NULL,
  modelId INT NOT NULL,
  priceOverride DECIMAL(10, 2) NULL,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY unique_product_model (productId, modelId),
  KEY idx_product_available_models_productId (productId),
  CONSTRAINT fk_pam_product FOREIGN KEY (productId) REFERENCES products (id) ON DELETE CASCADE,
  CONSTRAINT fk_pam_brand FOREIGN KEY (brandId) REFERENCES mobileBrands (id) ON DELETE RESTRICT,
  CONSTRAINT fk_pam_model FOREIGN KEY (modelId) REFERENCES mobileModels (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

const STEPS = [
  { label: "product_available_models table", sql: CREATE_PAM },
  {
    label: "cart_items.selectedModelId",
    sql: "ALTER TABLE cart_items ADD COLUMN selectedModelId INT NULL",
  },
  {
    label: "cart_items idx selectedModelId",
    sql:
      "ALTER TABLE cart_items ADD KEY idx_cart_items_selectedModelId (selectedModelId)",
  },
  {
    label: "cart_items FK selectedModelId",
    sql:
      "ALTER TABLE cart_items ADD CONSTRAINT fk_cart_items_selected_model FOREIGN KEY (selectedModelId) REFERENCES mobileModels (id) ON DELETE SET NULL",
  },
  {
    label: "order_items.selectedModelId",
    sql: "ALTER TABLE order_items ADD COLUMN selectedModelId INT NULL",
  },
  {
    label: "order_items.selectedModelName",
    sql: "ALTER TABLE order_items ADD COLUMN selectedModelName VARCHAR(255) NULL",
  },
  {
    label: "order_items idx selectedModelId",
    sql:
      "ALTER TABLE order_items ADD KEY idx_order_items_selectedModelId (selectedModelId)",
  },
  {
    label: "order_items FK selectedModelId",
    sql:
      "ALTER TABLE order_items ADD CONSTRAINT fk_order_items_selected_model FOREIGN KEY (selectedModelId) REFERENCES mobileModels (id) ON DELETE SET NULL",
  },
];

function isAlreadyExistsError(err) {
  const m = err?.message || "";
  return (
    m.includes("Duplicate column") ||
    m.includes("already exists") ||
    m.includes("Duplicate key name") ||
    m.includes("Duplicate foreign key") ||
    m.includes("errno: 1050") ||
    m.includes("errno: 1060") ||
    m.includes("errno: 1061") ||
    m.includes("errno: 1826")
  );
}

async function run() {
  for (const step of STEPS) {
    try {
      await sequelize.query(step.sql);
      console.log("OK:", step.label);
    } catch (err) {
      if (isAlreadyExistsError(err)) {
        console.log("Skip (already applied):", step.label);
      } else {
        console.error("Failed:", step.label, err.message);
        process.exitCode = 1;
      }
    }
  }
  console.log("Product available models migration finished.");
  await sequelize.close();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
