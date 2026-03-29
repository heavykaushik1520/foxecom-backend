const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/db");

const FoxcomOriginalsProduct = sequelize.define(
  "FoxcomOriginalsProduct",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    foxcomOriginalsId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: "foxcom_originals",
        key: "id",
      },
      onDelete: "CASCADE",
    },
    productId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: "products",
        key: "id",
      },
      onDelete: "CASCADE",
    },
    sortOrder: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      comment: "Order in which products appear in the Originals section",
    },
  },
  {
    tableName: "foxcom_originals_products",
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ["foxcomOriginalsId", "productId"],
        name: "unique_foxcom_originals_product",
      },
      { fields: ["foxcomOriginalsId"] },
      { fields: ["productId"] },
      { fields: ["sortOrder"] },
    ],
  }
);

module.exports = FoxcomOriginalsProduct;

