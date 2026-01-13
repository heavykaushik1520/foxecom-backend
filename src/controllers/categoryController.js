// src/controllers/categoryController.js

const { Category, Product } = require("../models");

async function createCategory(req, res) {
  try {
    const { name } = req.body;
    
    // Validation
    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ message: "Category name is required and must be a non-empty string." });
    }
    
    // Check if category with same name already exists
    const existingCategory = await Category.findOne({ where: { name: name.trim() } });
    if (existingCategory) {
      return res.status(409).json({ message: "Category with this name already exists." });
    }
    
    const newCategory = await Category.create({ name: name.trim() });
    res.status(201).json({
      message: "Category created successfully",
      category: newCategory
    });
  } catch (error) {
    console.error("Error creating category:", error);
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({ message: "Category with this name already exists." });
    }
    res
      .status(500)
      .json({ message: "Failed to create category", error: error.message });
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
    });
    res.status(200).json(categories);
  } catch (error) {
    console.error("Error fetching all categories with products:", error);
    res
      .status(500)
      .json({
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
    res
      .status(500)
      .json({ message: "Failed to fetch category", error: error.message });
  }
}

// Update an existing category by ID
async function updateCategory(req, res) {
  const { id } = req.params;
  const { name } = req.body;
  
  try {
    // Validation
    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ message: "Category name is required and must be a non-empty string." });
    }
    
    // Check if category exists
    const existingCategory = await Category.findByPk(id);
    if (!existingCategory) {
      return res.status(404).json({ message: "Category not found" });
    }
    
    // Check if another category with same name already exists
    const duplicateCategory = await Category.findOne({ 
      where: { 
        name: name.trim(),
        id: { [require('sequelize').Op.ne]: id } // Exclude current category
      } 
    });
    if (duplicateCategory) {
      return res.status(409).json({ message: "Category with this name already exists." });
    }
    
    const [updatedRows] = await Category.update(
      { name: name.trim() }, 
      { where: { id: id } }
    );

    if (updatedRows > 0) {
      const updatedCategory = await Category.findByPk(id, {
        include: {
          model: Product,
          as: "products",
        },
      });
      return res.status(200).json({
        message: "Category updated successfully",
        category: updatedCategory
      });
    } else {
      return res.status(404).json({ message: "Category not found" });
    }
  } catch (error) {
    console.error(`Error updating category with ID ${id}:`, error);
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({ message: "Category with this name already exists." });
    }
    res
      .status(500)
      .json({ message: "Failed to update category", error: error.message });
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
    
    const deletedRows = await Category.destroy({
      where: { id: id },
    });

    if (deletedRows > 0) {
      return res.status(200).json({ 
        message: "Category deleted successfully",
        deletedCategory: {
          id: category.id,
          name: category.name
        }
      });
    } else {
      return res.status(404).json({ message: "Category not found" });
    }
  } catch (error) {
    console.error(`Error deleting category with ID ${id}:`, error);
    res
      .status(500)
      .json({ message: "Failed to delete category", error: error.message });
  }
}

module.exports = {
  createCategory,
  getAllCategories,
  getCategoryById,
  updateCategory,
  deleteCategory,
};
