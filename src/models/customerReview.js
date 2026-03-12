const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/db");

const CustomerReview = sequelize.define(
  "CustomerReview",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    productId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    orderId: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    rating: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: {
        min: 1,
        max: 5,
      },
    },
    reviewText: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    isVerifiedPurchase: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
  },
  {
    tableName: "customer_reviews",
    timestamps: true,
    indexes: [
      { fields: ["productId"] },
      { fields: ["userId"] },
      { unique: true, fields: ["productId", "userId"] },
    ],
  }
);

CustomerReview.associate = (models) => {
  CustomerReview.belongsTo(models.Product, {
    foreignKey: "productId",
    as: "product",
  });
  CustomerReview.belongsTo(models.User, {
    foreignKey: "userId",
    as: "user",
  });
  CustomerReview.belongsTo(models.Order, {
    foreignKey: "orderId",
    as: "order",
  });
};

module.exports = CustomerReview;

