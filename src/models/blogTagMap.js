const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/db");

const BlogTagMap = sequelize.define(
  "BlogTagMap",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    blogId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: "blogs", key: "id" },
      onDelete: "CASCADE",
    },
    tagId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: "blog_tags", key: "id" },
      onDelete: "CASCADE",
    },
  },
  {
    tableName: "blog_tag_maps",
    timestamps: true,
    indexes: [{ unique: true, fields: ["blogId", "tagId"] }],
  }
);

module.exports = BlogTagMap;
