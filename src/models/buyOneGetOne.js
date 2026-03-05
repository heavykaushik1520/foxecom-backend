const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/db");

const BuyOneGetOne = sequelize.define(
  "BuyOneGetOne",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    title: {
      type: DataTypes.STRING(255),
      allowNull: false,
      defaultValue: "Buy One Get One",
      comment: "Title for the BOGO section",
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      comment: "Whether the BOGO section is currently active and visible",
    },
    startDate: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "Optional start date for the BOGO section",
    },
    endDate: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "Optional end date for the BOGO section",
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: "Optional description for the BOGO offer",
    },
  },
  {
    tableName: "buy_one_get_one",
    timestamps: true,
    indexes: [
      {
        fields: ["isActive"],
      },
    ],
  }
);

BuyOneGetOne.associate = (models) => {
  BuyOneGetOne.belongsToMany(models.Product, {
    through: models.BuyOneGetOneProduct,
    foreignKey: "buyOneGetOneId",
    otherKey: "productId",
    as: "products",
    onDelete: "CASCADE",
  });
};

module.exports = BuyOneGetOne;

