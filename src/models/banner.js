const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/db");

const Banner = sequelize.define(
  "Banner",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    desktopImageUrl: {
      type: DataTypes.STRING(500),
      allowNull: false,
      comment: "Desktop banner image (1521x516 recommended)",
    },
    mobileImageUrl: {
      type: DataTypes.STRING(500),
      allowNull: false,
      comment: "Mobile banner image (531x316 recommended)",
    },
    sortOrder: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
  },
  {
    tableName: "banners",
    timestamps: true,
  }
);

module.exports = Banner;
