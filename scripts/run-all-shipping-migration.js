/**
 * Add all shipping-related columns to orders table if missing.
 * Run from backend folder: npm run migrate:shipping
 * Safe to run multiple times (skips columns that already exist).
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { sequelize } = require('../src/config/db');

const COLUMNS = [
  { name: 'shiprocketOrderId', sql: 'ADD COLUMN `shiprocketOrderId` VARCHAR(255) NULL' },
  { name: 'shipmentId', sql: 'ADD COLUMN `shipmentId` VARCHAR(255) NULL' },
  { name: 'awbCode', sql: 'ADD COLUMN `awbCode` VARCHAR(255) NULL' },
  { name: 'courierName', sql: 'ADD COLUMN `courierName` VARCHAR(255) NULL' },
  { name: 'shipmentStatus', sql: "ADD COLUMN `shipmentStatus` VARCHAR(255) DEFAULT 'not created' NULL" },
  { name: 'shipping_label_url', sql: 'ADD COLUMN `shipping_label_url` VARCHAR(500) NULL' },
];

async function run() {
  for (const col of COLUMNS) {
    try {
      await sequelize.query(`ALTER TABLE orders ${col.sql}`);
      console.log('Added column:', col.name);
    } catch (err) {
      if (err.message && (err.message.includes('Duplicate column') || err.message.includes('already exists'))) {
        console.log('Column already exists:', col.name);
      } else {
        console.error('Failed to add', col.name, err.message);
      }
    }
  }
  console.log('Shipping migration finished.');
  await sequelize.close();
}

run().catch((e) => { console.error(e); process.exit(1); });
