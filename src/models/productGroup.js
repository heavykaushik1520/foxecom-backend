const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/db");

const ProductGroup = sequelize.define(
  "ProductGroup",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    slug: {
      type: DataTypes.STRING(255),
      allowNull: true,
      unique: true,
    },
    variantType: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: "color",
    },
  },
  {
    tableName: "product_groups",
    timestamps: true,
  }
);

ProductGroup.associate = (models) => {
  ProductGroup.hasMany(models.Product, {
    foreignKey: "variantGroupId",
    as: "products",
  });
};

module.exports = ProductGroup;
