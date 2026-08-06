/**
 * Add delivery estimate snapshot columns to orders table if missing.
 * Run from backend folder: node scripts/run-delivery-estimate-migration.js
 * Safe to run multiple times (skips columns that already exist).
 */
require("dotenv").config({
  path: require("path").join(__dirname, "..", ".env"),
});
const { sequelize } = require("../src/config/db");

const COLUMNS = [
  {
    name: "estimated_delivery_from",
    sql: "ADD COLUMN `estimated_delivery_from` DATE NULL",
  },
  {
    name: "estimated_delivery_to",
    sql: "ADD COLUMN `estimated_delivery_to` DATE NULL",
  },
  {
    name: "tat_days_at_order",
    sql: "ADD COLUMN `tat_days_at_order` TINYINT UNSIGNED NULL",
  },
  {
    name: "delivery_estimate_label",
    sql: "ADD COLUMN `delivery_estimate_label` VARCHAR(64) NULL",
  },
];

async function run() {
  for (const col of COLUMNS) {
    try {
      await sequelize.query(`ALTER TABLE orders ${col.sql}`);
      console.log("Added column:", col.name);
    } catch (err) {
      const msg = err.message || "";
      if (msg.includes("Duplicate column") || msg.includes("already exists")) {
        console.log("Column already exists:", col.name);
      } else {
        console.error("Failed to add", col.name, msg);
        process.exitCode = 1;
      }
    }
  }
  console.log("Delivery estimate migration finished.");
  await sequelize.close();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
