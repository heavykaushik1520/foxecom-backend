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
    payuTxnId: { type: DataTypes.STRING, allowNull: true },
    payuPaymentId: { type: DataTypes.STRING, allowNull: true },
    paymentMode: { type: DataTypes.STRING(64), allowNull: true },
    bankRefNo: { type: DataTypes.STRING(255), allowNull: true },
    payuStatus: { type: DataTypes.STRING(64), allowNull: true },
    payuError: { type: DataTypes.TEXT, allowNull: true },
    payuResponse: { type: DataTypes.JSON, allowNull: true },
    shiprocketOrderId: { type: DataTypes.STRING, allowNull: true },
    shipmentId: { type: DataTypes.STRING, allowNull: true },
    awbCode: { type: DataTypes.STRING, allowNull: true },
    courierName: { type: DataTypes.STRING, allowNull: true },
    shipmentStatus: { type: DataTypes.STRING, defaultValue: "not created" },
    shippingLabelUrl: { type: DataTypes.STRING(500), allowNull: true, field: "shipping_label_url" },
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
