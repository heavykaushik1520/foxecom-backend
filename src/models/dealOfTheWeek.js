const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/db");

const DealOfTheWeek = sequelize.define(
  "DealOfTheWeek",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    title: {
      type: DataTypes.STRING(255),
      allowNull: false,
      defaultValue: "Deal of the Week",
      comment: "Title for the deal section",
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      comment: "Whether the deal is currently active and visible",
    },
    startDate: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "Optional start date for the deal",
    },
    endDate: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "Optional end date for the deal",
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: "Optional description for the deal",
    },
  },
  {
    tableName: "deal_of_the_week",
    timestamps: true,
    indexes: [
      {
        fields: ["isActive"],
      },
    ],
  }
);

DealOfTheWeek.associate = (models) => {
  // Many-to-many relationship with Products
  DealOfTheWeek.belongsToMany(models.Product, {
    through: models.DealOfTheWeekProduct,
    foreignKey: "dealOfTheWeekId",
    otherKey: "productId",
    as: "products",
    onDelete: "CASCADE",
  });
};

module.exports = DealOfTheWeek;
