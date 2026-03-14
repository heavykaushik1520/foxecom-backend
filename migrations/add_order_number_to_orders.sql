-- =============================================================================
-- Migration: Add human-readable order_number to orders table
-- =============================================================================
-- Format: SKU_LAST4/DDMMYYYY/ID (e.g. 1663/14032026/50)
-- Run once. Existing rows stay NULL; new orders get order_number set on create.
-- =============================================================================

ALTER TABLE orders
  ADD COLUMN order_number VARCHAR(64) NULL COMMENT 'Display order ID: skuLast4/DDMMYYYY/id' AFTER order_number_for_user;

-- =============================================================================
