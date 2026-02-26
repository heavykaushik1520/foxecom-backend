/**
 * Run Delhivery shipping migration (adds shipping_label_url to orders).
 * Usage: node scripts/run-delhivery-migration.js
 * Safe to run multiple times (ignores "duplicate column" error).
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { sequelize } = require('../src/config/db');

const SQL = `
ALTER TABLE orders
  ADD COLUMN shipping_label_url VARCHAR(500) NULL COMMENT 'Delhivery packing slip / label URL' AFTER shipmentStatus
`;

async function run() {
  try {
    await sequelize.query(SQL);
    console.log('Migration completed: shipping_label_url added to orders.');
  } catch (err) {
    if (err.message && err.message.includes('Duplicate column')) {
      console.log('Column shipping_label_url already exists; nothing to do.');
    } else {
      console.error('Migration failed:', err.message);
      process.exit(1);
    }
  } finally {
    await sequelize.close();
  }
}

run();
