/**
 * Creates product_groups and variant columns on products / caseDetails.
 * Usage: node scripts/run-product-variant-groups-migration.js
 */
require("dotenv").config({
  path: require("path").join(__dirname, "..", ".env"),
});
const { sequelize } = require("../src/config/db");

const CREATE_GROUPS = `
CREATE TABLE IF NOT EXISTS product_groups (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NULL,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY unique_product_group_slug (slug),
  KEY idx_product_groups_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

const STEPS = [
  { label: "product_groups table", sql: CREATE_GROUPS },
  {
    label: "products.variantGroupId",
    sql: "ALTER TABLE products ADD COLUMN variantGroupId INT NULL",
  },
  {
    label: "products.isDefaultVariant",
    sql:
      "ALTER TABLE products ADD COLUMN isDefaultVariant TINYINT(1) NOT NULL DEFAULT 0",
  },
  {
    label: "products idx variantGroupId",
    sql:
      "ALTER TABLE products ADD KEY idx_products_variantGroupId (variantGroupId)",
  },
  {
    label: "products FK variantGroupId",
    sql:
      "ALTER TABLE products ADD CONSTRAINT fk_products_variant_group FOREIGN KEY (variantGroupId) REFERENCES product_groups (id) ON DELETE SET NULL",
  },
  {
    label: "caseDetails.colorHex",
    sql: "ALTER TABLE caseDetails ADD COLUMN colorHex VARCHAR(7) NULL",
  },
  {
    label: "product_groups.variantType",
    sql:
      "ALTER TABLE product_groups ADD COLUMN variantType VARCHAR(20) NOT NULL DEFAULT 'color'",
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
  console.log("Product variant groups migration finished.");
  await sequelize.close();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
