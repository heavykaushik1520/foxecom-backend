-- Website analytics: one row per page view (full hit log).
-- Run against your MySQL database (same DB as the app).
-- mysql -u USER -p DB_NAME < migrations/create_website_visits_table.sql

CREATE TABLE IF NOT EXISTS website_visits (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  visitor_id VARCHAR(128) NOT NULL,
  page VARCHAR(512) NOT NULL,
  ip_address VARCHAR(64) NOT NULL DEFAULT '',
  user_agent TEXT NULL,
  visit_date DATE NOT NULL,
  visited_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_website_visits_visit_date (visit_date),
  KEY idx_website_visits_page (page),
  KEY idx_website_visits_visitor_date (visitor_id, visit_date),
  KEY idx_website_visits_visitor_page_date (visitor_id, page(191), visit_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
