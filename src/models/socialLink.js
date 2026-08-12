const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/db");

const SocialLink = sequelize.define(
  "SocialLink",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    icon: {
      type: DataTypes.TEXT,
      allowNull: false,
      comment: "Icon image URL or path",
    },
    link: {
      type: DataTypes.STRING(1000),
      allowNull: false,
      comment: "Target destination URL for the social media link",
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: "is_active",
    },
    sortOrder: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: "sort_order",
    },
  },
  {
    tableName: "social_links",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
  }
);

module.exports = SocialLink;
