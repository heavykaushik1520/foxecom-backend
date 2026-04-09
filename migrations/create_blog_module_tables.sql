CREATE TABLE IF NOT EXISTS `blogs` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `title` VARCHAR(255) NOT NULL,
  `slug` VARCHAR(255) NOT NULL,
  `excerpt` TEXT NULL,
  `contentHtml` LONGTEXT NOT NULL,
  `featuredImage` VARCHAR(512) NULL,
  `featuredImageAlt` VARCHAR(255) NULL,
  `videoUrl` VARCHAR(512) NULL,
  `authorName` VARCHAR(120) NULL,
  `status` ENUM('draft', 'published') NOT NULL DEFAULT 'draft',
  `isFeatured` TINYINT(1) NOT NULL DEFAULT 0,
  `seoTitle` VARCHAR(255) NULL,
  `seoDescription` VARCHAR(320) NULL,
  `seoKeywords` VARCHAR(500) NULL,
  `canonicalUrl` VARCHAR(512) NULL,
  `publishedAt` DATETIME NULL,
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_blogs_slug` (`slug`),
  KEY `idx_blogs_status_publishedAt` (`status`, `publishedAt`),
  KEY `idx_blogs_isFeatured` (`isFeatured`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `blog_tags` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(100) NOT NULL,
  `slug` VARCHAR(120) NOT NULL,
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_blog_tags_slug` (`slug`),
  UNIQUE KEY `uq_blog_tags_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `blog_tag_maps` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `blogId` INT NOT NULL,
  `tagId` INT NOT NULL,
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_blog_tag_maps_blog_tag` (`blogId`, `tagId`),
  KEY `idx_blog_tag_maps_blogId` (`blogId`),
  KEY `idx_blog_tag_maps_tagId` (`tagId`),
  CONSTRAINT `fk_blog_tag_maps_blog`
    FOREIGN KEY (`blogId`) REFERENCES `blogs` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_blog_tag_maps_tag`
    FOREIGN KEY (`tagId`) REFERENCES `blog_tags` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `blog_related_products` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `blogId` INT NOT NULL,
  `productId` INT NOT NULL,
  `sortOrder` INT NOT NULL DEFAULT 0,
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_blog_related_products_blog_product` (`blogId`, `productId`),
  KEY `idx_blog_related_products_blogId` (`blogId`),
  KEY `idx_blog_related_products_productId` (`productId`),
  CONSTRAINT `fk_blog_related_products_blog`
    FOREIGN KEY (`blogId`) REFERENCES `blogs` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_blog_related_products_product`
    FOREIGN KEY (`productId`) REFERENCES `products` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
