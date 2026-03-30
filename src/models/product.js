const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/db");

const Product = sequelize.define(
  "Product",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    title: { type: DataTypes.STRING, allowNull: false },
    slug: {
      type: DataTypes.STRING(255),
      allowNull: true,
      unique: true,
      validate: {
        isLowercaseIfPresent(value) {
          if (value != null && value !== "" && value !== String(value).toLowerCase()) {
            throw new Error("Slug must be stored in lowercase.");
          }
        },
      },
    },
    categoryId: { type: DataTypes.INTEGER, allowNull: false },
    price: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      validate: {
        min: 0,
        isDecimal: true,
      },
    },
    discountPrice: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      validate: {
        min: 0,
        isDecimal: true,
      },
    },
    stock: {
      type: DataTypes.INTEGER,
      allowNull: true,

    },

    sku: {
      type: DataTypes.STRING,
      allowNull: true
    },
    thumbnailImage: {
      type: DataTypes.STRING,
      allowNull: false,
    },

    description: { type: DataTypes.TEXT },

  },
  {
    tableName: "products",
    timestamps: true,
  }
);

Product.associate = (models) => {
  Product.hasMany(models.ProductImage, {
    foreignKey: "productId",
    as: "images",
    onDelete: "CASCADE",
  });
  Product.belongsTo(models.Category, {
    foreignKey: "categoryId",
    as: "category",
  });
  Product.belongsToMany(models.Cart, {
    through: models.CartItem,
    as: "carts",
    foreignKey: "productId",
    otherKey: "cartId",
  });
  Product.belongsToMany(models.Order, {
    through: models.OrderItem,
    as: "orders",
    foreignKey: "productId",
    otherKey: "orderId",
  });

  Product.hasOne(models.CaseDetails, {
    foreignKey: "productId",
    as: "details"
  });
  Product.hasMany(models.Review, {
    foreignKey: "productId",
    as: "reviews",
    onDelete: "CASCADE",
  });
  Product.hasOne(models.ProductRatingSummary, {
    foreignKey: "productId",
    as: "ratingSummary",
  });
};

module.exports = Product;
