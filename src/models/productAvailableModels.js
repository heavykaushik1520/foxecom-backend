const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/db");

const ProductAvailableModels = sequelize.define(
  "ProductAvailableModels",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    productId: { type: DataTypes.INTEGER, allowNull: false },
    brandId: { type: DataTypes.INTEGER, allowNull: false },
    modelId: { type: DataTypes.INTEGER, allowNull: false },
    priceOverride: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
  },
  {
    tableName: "product_available_models",
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ["productId", "modelId"],
        name: "unique_product_model",
      },
    ],
  }
);

ProductAvailableModels.associate = (models) => {
  ProductAvailableModels.belongsTo(models.Product, {
    foreignKey: "productId",
    as: "product",
  });
  ProductAvailableModels.belongsTo(models.MobileBrands, {
    foreignKey: "brandId",
    as: "brand",
  });
  ProductAvailableModels.belongsTo(models.MobileModels, {
    foreignKey: "modelId",
    as: "model",
  });
};

module.exports = ProductAvailableModels;
