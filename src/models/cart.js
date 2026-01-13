const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/db");

const Cart = sequelize.define(
  "Cart",
  {
    id: {
      type: DataTypes.INTEGER, 
      primaryKey: true,
      autoIncrement: true,     // Added for integer IDs
    },
    userId: { 
      type: DataTypes.INTEGER, 
      allowNull: true, 
      unique: true 
    },
    guestCartId: { 
      type: DataTypes.INTEGER, 
      allowNull: true, 
      unique: true 
    },
  },
  {
    tableName: "cart",
    timestamps: true,
  }
);

Cart.associate = (models) => {
  Cart.belongsTo(models.User, { foreignKey: "userId", as: "user" });
  Cart.belongsToMany(models.Product, {
    through: models.CartItem,
    as: "products",
    foreignKey: "cartId",
    otherKey: "productId",
  });
  Cart.hasMany(models.CartItem, { foreignKey: "cartId", as: "cartItems" });
};

module.exports = Cart;