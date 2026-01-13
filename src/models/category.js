const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/db");

const Category = sequelize.define(
  "Category",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING, allowNull: false, unique: true },
    slug: { type: DataTypes.TEXT, allowNull: false },
  },
  {
    tableName: "categories",
    timestamps: true,
  }
);

Category.associate = (models) => {
  Category.hasMany(models.Product, {
    foreignKey: "categoryId",
    as: "products",
    onDelete: "CASCADE",
  });
};

module.exports = Category;
