const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/db");

const BlogRelatedProduct = sequelize.define(
  "BlogRelatedProduct",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    blogId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: "blogs", key: "id" },
      onDelete: "CASCADE",
    },
    productId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: "products", key: "id" },
      onDelete: "CASCADE",
    },
    sortOrder: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  },
  {
    tableName: "blog_related_products",
    timestamps: true,
    indexes: [{ unique: true, fields: ["blogId", "productId"] }],
  }
);

module.exports = BlogRelatedProduct;
