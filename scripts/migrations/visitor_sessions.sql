-- Live visitor sessions (heartbeat). "Online" = last_seen within last 2 minutes (application logic).
-- Run via: node scripts/run-visitor-sessions-migration.js

CREATE TABLE IF NOT EXISTS visitor_sessions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  session_id VARCHAR(100) NOT NULL,
  user_id BIGINT NULL,
  current_page VARCHAR(255) NOT NULL DEFAULT '/',
  product_id BIGINT UNSIGNED NULL,
  is_logged_in TINYINT(1) NOT NULL DEFAULT 0,
  ip_address VARCHAR(45) NULL,
  user_agent TEXT NULL,
  last_seen DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_visitor_sessions_session_id (session_id),
  KEY idx_visitor_sessions_last_seen (last_seen),
  KEY idx_visitor_sessions_product_last_seen (product_id, last_seen)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
