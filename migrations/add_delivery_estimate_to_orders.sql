-- Add estimated delivery fields to orders (Delhivery TAT snapshot at order time)
ALTER TABLE orders
  ADD COLUMN estimated_delivery_from DATE NULL AFTER shipmentStatus,
  ADD COLUMN estimated_delivery_to DATE NULL AFTER estimated_delivery_from,
  ADD COLUMN tat_days_at_order TINYINT UNSIGNED NULL AFTER estimated_delivery_to,
  ADD COLUMN delivery_estimate_label VARCHAR(64) NULL AFTER tat_days_at_order;
