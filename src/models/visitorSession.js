const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/db");

/**
 * Live visitor heartbeat rows.
 *
 * Create the table manually (example DDL — adjust if your DB differs):
 *
 * CREATE TABLE IF NOT EXISTS visitor_sessions (
 *   id INT AUTO_INCREMENT PRIMARY KEY,
 *   session_id VARCHAR(100) NOT NULL,
 *   user_id BIGINT NULL,
 *   current_page VARCHAR(255) NOT NULL DEFAULT '/',
 *   product_id BIGINT UNSIGNED NULL,
 *   is_logged_in TINYINT(1) NOT NULL DEFAULT 0,
 *   ip_address VARCHAR(45) NULL,
 *   user_agent TEXT NULL,
 *   last_seen DATETIME NOT NULL,
 *   created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 *   updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 *   UNIQUE KEY uk_visitor_sessions_session_id (session_id),
 *   KEY idx_visitor_sessions_last_seen (last_seen),
 *   KEY idx_visitor_sessions_product_last_seen (product_id, last_seen)
 * ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
 *
 * Online = last_seen within application window (see visitorSessionService.ONLINE_WINDOW_MINUTES).
 */
const VisitorSession = sequelize.define(
  "VisitorSession",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    session_id: {
      type: DataTypes.STRING(100),
      allowNull: false,
      unique: { name: "uk_visitor_sessions_session_id" },
    },
    user_id: {
      type: DataTypes.BIGINT,
      allowNull: true,
    },
    current_page: {
      type: DataTypes.STRING(255),
      allowNull: false,
      defaultValue: "/",
    },
    product_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true,
    },
    is_logged_in: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    ip_address: {
      type: DataTypes.STRING(45),
      allowNull: true,
    },
    user_agent: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    last_seen: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  },
  {
    tableName: "visitor_sessions",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    indexes: [
      { name: "idx_visitor_sessions_last_seen", fields: ["last_seen"] },
      { name: "idx_visitor_sessions_product_last_seen", fields: ["product_id", "last_seen"] },
    ],
  }
);

module.exports = VisitorSession;
