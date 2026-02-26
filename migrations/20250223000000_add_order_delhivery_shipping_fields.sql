-- Add Delhivery shipping fields to orders table (safe: only adds columns, no data loss)
-- Run once. Existing rows are unchanged. If column already exists, you can ignore the error.

ALTER TABLE orders
  ADD COLUMN shipping_label_url VARCHAR(500) NULL COMMENT 'Delhivery packing slip / label URL' AFTER shipmentStatus;
