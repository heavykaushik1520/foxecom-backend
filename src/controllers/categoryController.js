// src/controllers/categoryController.js

const { Category, Product } = require("../models");
const { Op } = require("sequelize");

// Helper to validate string input
const isValidString = (str) => str && typeof str === "string" && str.trim().length > 0;

async function createCategory(req, res) {
  try {
    const { name, slug } = req.body;
    
    // Validation
    if (!isValidString(name)) {
      return res.status(400).json({ message: "Category name is required and must be a non-empty string." });
    }

    if (!isValidString(slug)) {
      return res.status(400).json({ message: "Category slug is required and must be a non-empty string." });
    }
    
    const trimmedName = name.trim();
    const trimmedSlug = slug.trim();

    // Check if category with same name already exists
    const existingCategory = await Category.findOne({ where: { name: trimmedName } });
    if (existingCategory) {
      return res.status(409).json({ message: "Category with this name already exists." });
    }
    
    // Check if category with same slug already exists (optional but recommended for robust URLs)
    const existingSlug = await Category.findOne({ where: { slug: trimmedSlug } });
    if (existingSlug) {
        return res.status(409).json({ message: "Category with this slug already exists." });
    }
    
    const newCategory = await Category.create({ name: trimmedName, slug: trimmedSlug });
    res.status(201).json({
      message: "Category created successfully",
      category: newCategory
    });
  } catch (error) {
    console.error("Error creating category:", error);
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({ message: "Category with this name or slug already exists." });
    }
    res.status(500).json({ message: "Failed to create category", error: error.message });
  }
}

// Get all categories
async function getAllCategories(req, res) {
  try {
    const categories = await Category.findAll({
      include: {
        model: Product,
        as: "products",
      },
      order: [['createdAt', 'ASC']] // Return newest first by default
    });
    res.status(200).json(categories);
  } catch (error) {
    console.error("Error fetching all categories with products:", error);
    res.status(500).json({
        message: "Failed to fetch categories with products",
        error: error.message,
      });
  }
}

// Get a single category by ID
async function getCategoryById(req, res) {
  const { id } = req.params;
  try {
    const category = await Category.findByPk(id, {
      include: {
        model: Product,
        as: "products",
      },
    });
    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }
    res.status(200).json(category);
  } catch (error) {
    console.error(`Error fetching category with ID ${id}:`, error);
    res.status(500).json({ message: "Failed to fetch category", error: error.message });
  }
}

// Update an existing category by ID
async function updateCategory(req, res) {
  const { id } = req.params;
  const { name, slug } = req.body;
  
  try {
    // Check if category exists first
    const existingCategory = await Category.findByPk(id);
    if (!existingCategory) {
      return res.status(404).json({ message: "Category not found" });
    }

    const updates = {};

    // Validate and prepare name update
    if (name !== undefined) {
        if (!isValidString(name)) {
            return res.status(400).json({ message: "Category name must be a non-empty string." });
        }
        updates.name = name.trim();

        // Check uniqueness for name
        const duplicateName = await Category.findOne({ 
            where: { 
              name: updates.name,
              id: { [Op.ne]: id } 
            } 
        });
        if (duplicateName) {
            return res.status(409).json({ message: "Category with this name already exists." });
        }
    }

    // Validate and prepare slug update
    if (slug !== undefined) {
        if (!isValidString(slug)) {
            return res.status(400).json({ message: "Category slug must be a non-empty string." });
        }
        updates.slug = slug.trim();

        // Check uniqueness for slug could be added here if assumed unique, 
        // usually good practice for SEO friendly URLs
    }

    if (Object.keys(updates).length === 0) {
        return res.status(400).json({ message: "No valid fields provided for update." });
    }
    
    await existingCategory.update(updates);
    
    // Reload to get associations if needed, or just return updated instance
    const updatedCategory = await Category.findByPk(id, {
        include: { model: Product, as: "products" }
    });

    return res.status(200).json({
      message: "Category updated successfully",
      category: updatedCategory
    });

  } catch (error) {
    console.error(`Error updating category with ID ${id}:`, error);
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({ message: "Category with this name already exists." });
    }
    res.status(500).json({ message: "Failed to update category", error: error.message });
  }
}

async function deleteCategory(req, res) {
  const { id } = req.params;
  try {
    // Check if category exists
    const category = await Category.findByPk(id, {
      include: {
        model: Product,
        as: "products",
      },
    });
    
    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }
    
    // Check if category has products
    if (category.products && category.products.length > 0) {
      return res.status(400).json({ 
        message: "Cannot delete category that contains products. Please remove all products from this category first.",
        productsCount: category.products.length
      });
    }
    
    await category.destroy();

    return res.status(200).json({ 
      message: "Category deleted successfully",
      deletedCategory: {
        id: category.id,
        name: category.name
      }
    });
  } catch (error) {
    console.error(`Error deleting category with ID ${id}:`, error);
    res.status(500).json({ message: "Failed to delete category", error: error.message });
  }
}

module.exports = {
  createCategory,
  getAllCategories,
  getCategoryById,
  updateCategory,
  deleteCategory,
};
