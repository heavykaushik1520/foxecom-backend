const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/db");

const Marquee = sequelize.define(
  "Marquee",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    text: {
      type: DataTypes.TEXT("long"),
      allowNull: false,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: "is_active",
    },
  },
  {
    tableName: "marquees",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
  }
);

module.exports = Marquee;
