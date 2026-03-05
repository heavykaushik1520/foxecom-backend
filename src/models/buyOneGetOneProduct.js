const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/db");

const BuyOneGetOneProduct = sequelize.define(
  "BuyOneGetOneProduct",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    buyOneGetOneId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: "buy_one_get_one",
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
      comment: "Order in which products appear in the BOGO section",
    },
  },
  {
    tableName: "buy_one_get_one_products",
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ["buyOneGetOneId", "productId"],
        name: "unique_bogo_product",
      },
      {
        fields: ["buyOneGetOneId"],
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

module.exports = BuyOneGetOneProduct;

