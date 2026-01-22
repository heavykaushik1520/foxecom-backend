const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/db");

const Order = sequelize.define(
  "Order",
  {
    id: {
      type: DataTypes.INTEGER, 
      primaryKey: true,
      autoIncrement: true,
    },
    userId: {
      type: DataTypes.INTEGER, 
      allowNull: false,
    },
    totalAmount: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
    firstName: { type: DataTypes.TEXT, allowNull: true },
    lastName: { type: DataTypes.TEXT, allowNull: false },
    mobileNumber: { type: DataTypes.BIGINT, allowNull: false },
    emailAddress: { type: DataTypes.STRING, allowNull: false },
    fullAddress: { type: DataTypes.TEXT, allowNull: false },
    townOrCity: { type: DataTypes.STRING, allowNull: false },
    country: { type: DataTypes.STRING, allowNull: false },
    state: { type: DataTypes.STRING, allowNull: false },
    pinCode: { type: DataTypes.INTEGER, allowNull: false },
    status: {
      type: DataTypes.ENUM(
        "pending",
        "paid",
        "processing",
        "shipped",
        "delivered",
        "cancelled"
      ),
      defaultValue: "pending",
      allowNull: false,
    },
    razorpayOrderId: { type: DataTypes.STRING, allowNull: true, unique: true },
    razorpayPaymentId: {
      type: DataTypes.STRING,
      allowNull: true,
      unique: true,
    },
    shiprocketOrderId: { type: DataTypes.STRING, allowNull: true },
    shipmentId: { type: DataTypes.STRING, allowNull: true },
    awbCode: { type: DataTypes.STRING, allowNull: true },
    courierName: { type: DataTypes.STRING, allowNull: true },
    shipmentStatus: { type: DataTypes.STRING, defaultValue: "not created" },
  },
  {
    tableName: "orders",
    timestamps: true,
  }
);

Order.associate = (models) => {
  Order.belongsTo(models.User, { foreignKey: "userId", as: "user" });
  Order.hasMany(models.OrderItem, { foreignKey: "orderId", as: "orderItems" });
  Order.belongsToMany(models.Product, {
    through: models.OrderItem,
    as: "products",
    foreignKey: "orderId",
    otherKey: "productId",
  });
};

module.exports = Order;
