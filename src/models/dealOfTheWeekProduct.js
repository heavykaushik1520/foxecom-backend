const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/db");

const DealOfTheWeekProduct = sequelize.define(
  "DealOfTheWeekProduct",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    dealOfTheWeekId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: "deal_of_the_week",
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
      comment: "Order in which products appear in the deal",
    },
  },
  {
    tableName: "deal_of_the_week_products",
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ["dealOfTheWeekId", "productId"],
        name: "unique_deal_product",
      },
      {
        fields: ["dealOfTheWeekId"],
      },
      {
        fields: ["productId"],
      },
      {
        fields: ["sortOrder"],
      },
    ],
  }
);

module.exports = DealOfTheWeekProduct;
