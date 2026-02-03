const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/db");

const Review = sequelize.define(
  "Review",
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
  },
  {
    tableName: "reviews",
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ["productId", "userId"],
        name: "unique_user_product_review",
      },
    ],
  }
);

Review.associate = (models) => {
  Review.belongsTo(models.Product, { foreignKey: "productId", as: "product" });
  Review.belongsTo(models.User, { foreignKey: "userId", as: "user" });
};

module.exports = Review;
