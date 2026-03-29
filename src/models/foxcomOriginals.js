const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/db");

const FoxcomOriginals = sequelize.define(
  "FoxcomOriginals",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    title: {
      type: DataTypes.STRING(255),
      allowNull: false,
      defaultValue: "FOXECOM Originals",
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      comment: "Whether this section is currently active and visible on the homepage",
    },
  },
  {
    tableName: "foxcom_originals",
    timestamps: true,
    indexes: [{ fields: ["isActive"] }],
  }
);

FoxcomOriginals.associate = (models) => {
  FoxcomOriginals.belongsToMany(models.Product, {
    through: models.FoxcomOriginalsProduct,
    foreignKey: "foxcomOriginalsId",
    otherKey: "productId",
    as: "products",
    onDelete: "CASCADE",
  });
};

module.exports = FoxcomOriginals;

