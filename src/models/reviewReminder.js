const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/db");

const ReviewReminder = sequelize.define(
  "ReviewReminder",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    orderId: { type: DataTypes.INTEGER, allowNull: false },
    productId: { type: DataTypes.INTEGER, allowNull: false },
    userId: { type: DataTypes.INTEGER, allowNull: false },
    email: { type: DataTypes.STRING(255), allowNull: false },
    sendAt: { type: DataTypes.DATE, allowNull: false },
    isSent: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    sentAt: { type: DataTypes.DATE, allowNull: true },
    isReviewed: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  },
  {
    tableName: "review_reminders",
    timestamps: true,
    indexes: [
      // Idempotency: one reminder per product per delivered order per user
      { unique: true, fields: ["orderId", "productId", "userId"] },
      // Cron query acceleration
      { fields: ["sendAt", "isSent", "isReviewed"] },
      { fields: ["userId", "productId"] },
    ],
  }
);

ReviewReminder.associate = (models) => {
  ReviewReminder.belongsTo(models.Order, { foreignKey: "orderId", as: "order" });
  ReviewReminder.belongsTo(models.Product, { foreignKey: "productId", as: "product" });
  ReviewReminder.belongsTo(models.User, { foreignKey: "userId", as: "user" });
};

module.exports = ReviewReminder;

