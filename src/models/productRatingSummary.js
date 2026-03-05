const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/db");

const ProductRatingSummary = sequelize.define(
  "ProductRatingSummary",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    productId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      unique: true,
    },
    count1: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    count2: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    count3: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    count4: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    count5: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  },
  {
    tableName: "product_rating_summaries",
    timestamps: true,
    indexes: [{ fields: ["productId"] }],
  }
);

ProductRatingSummary.associate = (models) => {
  ProductRatingSummary.belongsTo(models.Product, {
    foreignKey: "productId",
    as: "product",
  });
};

module.exports = ProductRatingSummary;
