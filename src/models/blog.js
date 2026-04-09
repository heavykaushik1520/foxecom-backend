const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/db");

const Blog = sequelize.define(
  "Blog",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    title: { type: DataTypes.STRING(255), allowNull: false },
    slug: { type: DataTypes.STRING(255), allowNull: false, unique: true },
    excerpt: { type: DataTypes.TEXT, allowNull: true },
    contentHtml: { type: DataTypes.TEXT("long"), allowNull: false },
    featuredImage: { type: DataTypes.STRING(512), allowNull: true },
    featuredImageAlt: { type: DataTypes.STRING(255), allowNull: true },
    videoUrl: { type: DataTypes.STRING(512), allowNull: true },
    authorName: { type: DataTypes.STRING(120), allowNull: true },
    status: {
      type: DataTypes.ENUM("draft", "published"),
      allowNull: false,
      defaultValue: "draft",
    },
    isFeatured: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    seoTitle: { type: DataTypes.STRING(255), allowNull: true },
    seoDescription: { type: DataTypes.STRING(320), allowNull: true },
    seoKeywords: { type: DataTypes.STRING(500), allowNull: true },
    canonicalUrl: { type: DataTypes.STRING(512), allowNull: true },
    publishedAt: { type: DataTypes.DATE, allowNull: true },
  },
  {
    tableName: "blogs",
    timestamps: true,
    indexes: [
      { unique: true, fields: ["slug"] },
      { fields: ["status", "publishedAt"] },
      { fields: ["isFeatured"] },
    ],
  }
);

Blog.associate = (models) => {
  Blog.belongsToMany(models.BlogTag, {
    through: models.BlogTagMap,
    foreignKey: "blogId",
    otherKey: "tagId",
    as: "tags",
  });

  Blog.belongsToMany(models.Product, {
    through: models.BlogRelatedProduct,
    foreignKey: "blogId",
    otherKey: "productId",
    as: "relatedProducts",
  });
};

module.exports = Blog;
