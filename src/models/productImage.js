//src/models/productImage.js
const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/db");

const ProductImage = sequelize.define(
  "ProductImage",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    imageUrl: { type: DataTypes.STRING, allowNull: false },
    productId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: "products",
        key: "id",
      },
      onDelete: "CASCADE",
    },
  },
  {
    tableName: "product_images",
    timestamps: true,
  }
);

ProductImage.associate = (models) => {
  ProductImage.belongsTo(models.Product, {
    foreignKey: "productId",
    as: "product",
  });
};

module.exports = ProductImage;
