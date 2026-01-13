const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/db");
const bcrypt = require("bcryptjs");

const User = sequelize.define(
  "User",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement:true
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      validate: {
        notEmpty: true,
        isEmail: true,
        isValidEmail(value) {
          // Simple regex for email validation
          if (
            !/^([a-zA-Z0-9_\.-]+)@([a-zA-Z0-9\.-]+)\.([a-zA-Z]{2,6})$/.test(
              value
            )
          ) {
            throw new Error("Invalid email format.");
          }
        },
      },
    },
    password: { type: DataTypes.STRING, allowNull: false },
    role: { type: DataTypes.STRING, defaultValue: "customer" },
    reset_token: { type: DataTypes.STRING, allowNull: true },
    reset_token_expires: { type: DataTypes.DATE, allowNull: true },
  },
  {
    tableName: "users",
    timestamps: true,
    hooks: {
      beforeCreate: async (user) => {
        if (user.password)
          user.password = await bcrypt.hash(
            user.password,
            await bcrypt.genSalt(10)
          );
      },
      beforeUpdate: async (user) => {
        if (user.changed("password"))
          user.password = await bcrypt.hash(
            user.password,
            await bcrypt.genSalt(10)
          );
      },
    },
  }
);

User.associate = (models) => {
  User.hasOne(models.Cart, {
    foreignKey: "userId",
    as: "cart",
    onDelete: "CASCADE",
  });
  User.hasMany(models.Order, {
    foreignKey: "userId",
    as: "orders",
    onDelete: "CASCADE",
  });
};

module.exports = User;
