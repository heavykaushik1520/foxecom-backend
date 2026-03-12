-- =============================================================================
-- Migration: Add UPI repeat-purchase discount fields to orders table
-- =============================================================================
-- Adds: subtotal (before discount), discount_amount, upi_discount_percent,
--       preferred_payment_method, order_number_for_user (1st, 2nd, 3rd... purchase).
-- Run once. Existing rows get NULL/0 defaults; new orders will populate these.
-- =============================================================================

ALTER TABLE orders
  ADD COLUMN subtotal DECIMAL(10,2) NULL COMMENT 'Amount before UPI discount' AFTER totalAmount,
  ADD COLUMN discount_amount DECIMAL(10,2) DEFAULT 0 COMMENT 'UPI discount amount applied' AFTER subtotal,
  ADD COLUMN upi_discount_percent TINYINT DEFAULT 0 COMMENT '0, 10, or 20' AFTER discount_amount,
  ADD COLUMN preferred_payment_method VARCHAR(32) NULL COMMENT 'UPI or OTHER' AFTER upi_discount_percent,
  ADD COLUMN order_number_for_user INT NULL COMMENT '1st, 2nd, 3rd... order for this user' AFTER preferred_payment_method;

-- =============================================================================
