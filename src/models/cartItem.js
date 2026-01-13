const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const CartItem = sequelize.define('CartItem', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  cartId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'cart', // table name
      key: 'id',
    },
  },
  productId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'products', // table name
      key: 'id',
    },
  },
  quantity: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1,
  },
}, {
  tableName: 'cart_items',
  timestamps: true,
});

//  Define associations here
CartItem.associate = ({ Cart, Product }) => {
  CartItem.belongsTo(Cart, {
    foreignKey: 'cartId',
    as: 'cart',
  });

  CartItem.belongsTo(Product, {
    foreignKey: 'productId',
    as: 'product',
  });
};

module.exports = CartItem;
