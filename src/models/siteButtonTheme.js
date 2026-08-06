const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/db");

const SiteButtonTheme = sequelize.define(
  "SiteButtonTheme",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      defaultValue: 1,
    },
    draftColors: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: "JSON draft button colors for admin preview",
    },
    publishedColors: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: "JSON published button colors shown on the website",
    },
  },
  {
    tableName: "site_button_themes",
    timestamps: true,
  }
);

module.exports = SiteButtonTheme;
