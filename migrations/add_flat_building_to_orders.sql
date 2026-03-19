-- Add flat_number and building_name to orders if missing (for invoice and address display)
-- Run once; safe to run if columns already exist (you may see errors, then skip).

-- MySQL / MariaDB (check and add flat_number)
SET @dbname = DATABASE();
SET @tablename = "orders";
SET @col = "flat_number";
SET @stmt = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE table_schema = @dbname AND table_name = @tablename AND column_name = @col) > 0,
  "SELECT 'flat_number exists' AS msg",
  "ALTER TABLE orders ADD COLUMN flat_number TEXT NULL"
));
PREPARE s FROM @stmt;
EXECUTE s;
DEALLOCATE PREPARE s;

-- building_name
SET @col = "building_name";
SET @stmt = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE table_schema = @dbname AND table_name = @tablename AND column_name = @col) > 0,
  "SELECT 'building_name exists' AS msg",
  "ALTER TABLE orders ADD COLUMN building_name TEXT NULL"
));
PREPARE s FROM @stmt;
EXECUTE s;
DEALLOCATE PREPARE s;
