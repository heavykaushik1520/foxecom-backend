const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/db");

const CaseDetails = sequelize.define(
  "CaseDetails",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    productId: { type: DataTypes.INTEGER, allowNull: false },
    brandId: { type: DataTypes.INTEGER, allowNull: false },
    modelId: { type: DataTypes.INTEGER, allowNull: false },
    color: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    material: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    caseType: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    tableName: "caseDetails",
    timestamps: true,
  }
);

CaseDetails.associate = (models) => {
  CaseDetails.belongsTo(models.Product, { foreignKey: "productId", as: "product" });

  CaseDetails.belongsTo(models.MobileBrands, { foreignKey: "brandId", as: "brand" });
  
  CaseDetails.belongsTo(models.MobileModels, { foreignKey: "modelId", as: "model" });
};

module.exports = CaseDetails;
