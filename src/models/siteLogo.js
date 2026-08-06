const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/db");

const SiteLogo = sequelize.define(
  "SiteLogo",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      defaultValue: 1,
    },
    imageUrl: {
      type: DataTypes.STRING(500),
      allowNull: false,
      comment: "Site-wide logo image used in navbar and footer",
    },
  },
  {
    tableName: "site_logos",
    timestamps: true,
  }
);

module.exports = SiteLogo;
