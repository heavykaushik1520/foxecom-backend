const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/db");

const BlogTag = sequelize.define(
  "BlogTag",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING(100), allowNull: false, unique: true },
    slug: { type: DataTypes.STRING(120), allowNull: false, unique: true },
  },
  {
    tableName: "blog_tags",
    timestamps: true,
  }
);

BlogTag.associate = (models) => {
  BlogTag.belongsToMany(models.Blog, {
    through: models.BlogTagMap,
    foreignKey: "tagId",
    otherKey: "blogId",
    as: "blogs",
  });
};

module.exports = BlogTag;
