-- =============================================================================
-- Migration: Add PayU full response fields to orders table
-- =============================================================================
-- Run after PayU SDK integration. Stores paymentMode, bankRefNo, payuStatus,
-- payuError, and raw payuResponse for each order.
-- =============================================================================

ALTER TABLE `orders`
  ADD COLUMN `paymentMode` VARCHAR(64) NULL AFTER `payuPaymentId`,
  ADD COLUMN `bankRefNo` VARCHAR(255) NULL AFTER `paymentMode`,
  ADD COLUMN `payuStatus` VARCHAR(64) NULL AFTER `bankRefNo`,
  ADD COLUMN `payuError` TEXT NULL AFTER `payuStatus`,
  ADD COLUMN `payuResponse` JSON NULL AFTER `payuError`;

-- =============================================================================
