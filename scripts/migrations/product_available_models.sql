-- Canonical migration is scripts/run-product-available-models-migration.js (idempotent).
-- Manual equivalents (skip any statement that already applied):

-- CREATE TABLE product_available_models ...  (see runner JS for full DDL)

-- ALTER TABLE cart_items ADD COLUMN selectedModelId INT NULL;
-- ALTER TABLE cart_items ADD KEY idx_cart_items_selectedModelId (selectedModelId);
-- ALTER TABLE cart_items ADD CONSTRAINT fk_cart_items_selected_model FOREIGN KEY (selectedModelId) REFERENCES mobileModels (id) ON DELETE SET NULL;

-- ALTER TABLE order_items ADD COLUMN selectedModelId INT NULL;
-- ALTER TABLE order_items ADD COLUMN selectedModelName VARCHAR(255) NULL;
-- ALTER TABLE order_items ADD KEY idx_order_items_selectedModelId (selectedModelId);
-- ALTER TABLE order_items ADD CONSTRAINT fk_order_items_selected_model FOREIGN KEY (selectedModelId) REFERENCES mobileModels (id) ON DELETE SET NULL;
