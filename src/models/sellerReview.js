const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/db");

const SellerReview = sequelize.define(
  "SellerReview",
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
    adminId: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    rating: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: { min: 1, max: 5 },
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    /** Calendar date shown on the storefront (admin-chosen, editable). */
    reviewDate: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
    images: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: [],
    },
  },
  {
    tableName: "seller_reviews",
    timestamps: true,
    indexes: [{ fields: ["productId"] }, { fields: ["adminId"] }],
  }
);

SellerReview.associate = (models) => {
  SellerReview.belongsTo(models.Product, { foreignKey: "productId", as: "product" });
  SellerReview.belongsTo(models.Admin, { foreignKey: "adminId", as: "admin" });
};

module.exports = SellerReview;
