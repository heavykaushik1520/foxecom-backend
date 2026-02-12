-- =============================================================================
-- Migration: Replace Razorpay with PayU (orders table)
-- =============================================================================
-- Run this on your existing database after switching the app from Razorpay to PayU.
-- This renames payment gateway columns; no data loss.
--
-- Prerequisites: orders table exists with columns razorpayOrderId, razorpayPaymentId.
-- After running: use payuTxnId and payuPaymentId in the app.
-- =============================================================================

-- Step 1: Rename Razorpay columns to PayU columns
-- (Unique constraints, if any, follow the column rename in MySQL.)

ALTER TABLE `orders`
  CHANGE COLUMN `razorpayOrderId` `payuTxnId` VARCHAR(255) NULL,
  CHANGE COLUMN `razorpayPaymentId` `payuPaymentId` VARCHAR(255) NULL;

-- Optional: If you had unique indexes on the old columns, MySQL keeps them on the
-- renamed columns. To drop unique if you don't want it (e.g. allow retries):
-- ALTER TABLE `orders` DROP INDEX `orders_razorpay_order_id_unique`;
-- ALTER TABLE `orders` DROP INDEX `orders_razorpay_payment_id_unique`;

-- =============================================================================
-- Fresh database (no Razorpay columns)?
-- If your orders table does NOT have razorpayOrderId/razorpayPaymentId, run this instead:
-- =============================================================================
--
-- ALTER TABLE `orders`
--   ADD COLUMN `payuTxnId` VARCHAR(255) NULL AFTER `pinCode`,
--   ADD COLUMN `payuPaymentId` VARCHAR(255) NULL AFTER `payuTxnId`;
--
-- =============================================================================
