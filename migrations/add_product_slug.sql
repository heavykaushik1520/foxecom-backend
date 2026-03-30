-- SEO-friendly product URLs: optional unique slug (lowercase), NULL = use numeric id in URLs
ALTER TABLE `products`
  ADD COLUMN `slug` VARCHAR(255) NULL AFTER `title`;

CREATE UNIQUE INDEX `idx_products_slug` ON `products` (`slug`);
