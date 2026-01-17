// src/utils/categoryDetailsHelper.js
// Utility to handle category-specific product details (e.g., CaseDetails for mobile cases)

const { CaseDetails, MobileBrands, MobileModels } = require("../models");

/**
 * Adds category-specific details to a product based on its category
 * @param {Object} product - Product instance or product data
 * @returns {Promise<Object>} - Product with category-specific details
 */
async function addCategorySpecificDetails(product) {
  try {
    const productData = product.toJSON ? product.toJSON() : product;
    
    // Check if product belongs to mobile cases category
    const categoryName = productData.category?.name?.toLowerCase() || '';
    
    if (categoryName.includes('case')) {
      const caseDetails = await CaseDetails.findOne({
        where: { productId: productData.id },
        include: [
          { model: MobileBrands, as: "brand" },
          { model: MobileModels, as: "model" }
        ]
      });
      
      if (caseDetails) {
        productData.caseDetails = caseDetails;
      }
    }
    
    // Add more category-specific details here as needed
    // Example: if (categoryName.includes('charger')) { ... }
    // Example: if (categoryName.includes('headphone')) { ... }
    
    return productData;
  } catch (error) {
    console.error("Error adding category-specific details:", error);
    return product.toJSON ? product.toJSON() : product;
  }
}

/**
 * Adds category-specific details to multiple products
 * @param {Array} products - Array of product instances or product data
 * @returns {Promise<Array>} - Array of products with category-specific details
 */
async function addCategorySpecificDetailsToProducts(products) {
  try {
    return await Promise.all(
      products.map(product => addCategorySpecificDetails(product))
    );
  } catch (error) {
    console.error("Error adding category-specific details to products:", error);
    return products.map(p => p.toJSON ? p.toJSON() : p);
  }
}

module.exports = {
  addCategorySpecificDetails,
  addCategorySpecificDetailsToProducts
};
