-- Migration: Add shipping-related fields to orders table (Simple Version)
-- Run this SQL script on your database to add the missing columns
-- 
-- If you get errors saying columns already exist, that's fine - just ignore them

ALTER TABLE `orders` 
ADD COLUMN `shiprocketOrderId` VARCHAR(255) NULL AFTER `payuPaymentId`,
ADD COLUMN `shipmentId` VARCHAR(255) NULL AFTER `shiprocketOrderId`,
ADD COLUMN `awbCode` VARCHAR(255) NULL AFTER `shipmentId`,
ADD COLUMN `courierName` VARCHAR(255) NULL AFTER `awbCode`,
ADD COLUMN `shipmentStatus` VARCHAR(255) DEFAULT 'not created' AFTER `courierName`;
