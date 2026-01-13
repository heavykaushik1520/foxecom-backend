const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/db");

const MobileBrands = sequelize.define(
  "MobileBrands",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    name: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
  },
  {
    tableName: "mobileBrands",
    timestamps: true,
  }
);

MobileBrands.associate = (models) => {
  MobileBrands.hasMany(models.MobileModels, {
    foreignKey: "brandId",
    as: "mobileModels",
    onDelete: "CASCADE",
  });

  MobileBrands.hasMany(models.CaseDetails, { foreignKey: "brandId" });
};

module.exports = MobileBrands;
