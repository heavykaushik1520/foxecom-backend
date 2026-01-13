const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/db");

const MobileModels = sequelize.define(
  "MobileModels",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    //foreign key brandId
    brandId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    name: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
  },
  {
    tableName: "mobileModels",
    timestamps: true,
  }
);

MobileModels.associate= (models)=>{
    MobileModels.belongsTo(models.MobileBrands,{
        foreignKey : "brandId",
        as:"mobileBrands"
    });

    MobileModels.hasMany(models.CaseDetails, { foreignKey: "modelId" });
}

module.exports = MobileModels;
