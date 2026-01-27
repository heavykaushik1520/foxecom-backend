const { MobileBrands, MobileModels, CaseDetails } = require("../models");
const { Op } = require("sequelize");

async function createMobileBrand(req, res) {
  try {
    const { name } = req.body;
    
    // Enhanced validation
    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ success: false, message: "Brand name is required and must be a non-empty string." });
    }
    
    const trimmedName = name.trim();
    
    // Check if brand already exists
    const existingBrand = await MobileBrands.findOne({ 
      where: { name: { [Op.iLike]: trimmedName } } 
    });
    if (existingBrand) {
      return res.status(409).json({ success: false, message: "Brand with this name already exists." });
    }
    
    const newBrand = await MobileBrands.create({ name: trimmedName });
    res.status(201).json({ 
      success: true,
      message: "Mobile brand created successfully",
      brand: newBrand 
    });
  } catch (error) {
    console.error("Error creating mobile brand:", error);
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({ success: false, message: "Brand with this name already exists." });
    }
    res.status(500).json({ success: false, message: "Failed to create mobile brand", error: error.message });
  }
}

async function getAllMobileBrands(req, res) {
  try {
    const { page = 1, limit = 10, search } = req.query;
    const offset = (page - 1) * limit;
    
    // Build where clause for search
    const where = {};
    if (search && search.trim()) {
      where.name = { [Op.like]: `%${search.trim()}%` };
    }
    
    const { count, rows: brands } = await MobileBrands.findAndCountAll({
      where,
      include: [
        { model: MobileModels, as: "mobileModels" },
        { model: CaseDetails }
      ],
      order: [['createdAt', 'ASC']],
      limit: parseInt(limit),
      offset: offset,
    });
    
    res.status(200).json({
      brands,
      pagination: {
        totalItems: count,
        totalPages: Math.ceil(count / limit),
        currentPage: parseInt(page),
        itemsPerPage: parseInt(limit)
      }
    });
  } catch (error) {
    console.error("Error fetching mobile brands:", error);
    res.status(500).json({ message: "Failed to fetch mobile brands", error: error.message });
  }
}

async function getMobileBrandById(req, res) {
  try {
    const { id } = req.params;
    const brand = await MobileBrands.findByPk(id, {
      include: [
        { model: MobileModels, as: "mobileModels" },
        { model: CaseDetails }
      ]
    });
    if (!brand) {
      return res.status(404).json({ message: "Mobile brand not found" });
    }
    res.status(200).json(brand);
  } catch (error) {
    console.error(`Error fetching mobile brand with ID ${req.params.id}:`, error);
    res.status(500).json({ message: "Failed to fetch mobile brand", error: error.message });
  }
}

async function updateMobileBrand(req, res) {
  try {
    const { id } = req.params;
    const { name } = req.body;
    
    // Check if brand exists
    const brand = await MobileBrands.findByPk(id);
    if (!brand) {
      return res.status(404).json({ success: false, message: "Mobile brand not found" });
    }
    
    // Enhanced validation
    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ success: false, message: "Brand name is required and must be a non-empty string." });
    }
    
    const trimmedName = name.trim();
    
    // Check if another brand with same name exists
    const existingBrand = await MobileBrands.findOne({ 
      where: { 
        name: { [Op.iLike]: trimmedName },
        id: { [Op.ne]: id }
      } 
    });
    if (existingBrand) {
      return res.status(409).json({ success: false, message: "Brand with this name already exists." });
    }

    await brand.update({ name: trimmedName });
    const updatedBrand = await MobileBrands.findByPk(id, {
      include: [
        { model: MobileModels, as: "mobileModels" },
        { model: CaseDetails }
      ]
    });
    
    return res.status(200).json({ 
      success: true,
      message: "Mobile brand updated successfully",
      brand: updatedBrand 
    });
  } catch (error) {
    console.error(`Error updating mobile brand with ID ${req.params.id}:`, error);
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({ success: false, message: "Brand with this name already exists." });
    }
    res.status(500).json({ success: false, message: "Failed to update mobile brand", error: error.message });
  }
}

async function deleteMobileBrand(req, res) {
  try {
    const { id } = req.params;
    
    // Check if brand exists and has associated models
    const brand = await MobileBrands.findByPk(id, {
      include: [
        { model: MobileModels, as: "mobileModels" },
        { model: CaseDetails }
      ]
    });
    
    if (!brand) {
      return res.status(404).json({ success: false, message: "Mobile brand not found" });
    }
    
    // Check if brand has associated models or case details
    if (brand.mobileModels && brand.mobileModels.length > 0) {
      return res.status(400).json({ 
        success: false,
        message: "Cannot delete brand that has associated mobile models. Please delete or reassign models first.",
        modelsCount: brand.mobileModels.length
      });
    }
    
    if (brand.CaseDetails && brand.CaseDetails.length > 0) {
      return res.status(400).json({ 
        success: false,
        message: "Cannot delete brand that has associated case details. Please delete case details first.",
        caseDetailsCount: brand.CaseDetails.length
      });
    }
    
    const brandInfo = {
      id: brand.id,
      name: brand.name
    };
    
    await brand.destroy();
    
    return res.status(200).json({ 
      success: true,
      message: "Mobile brand deleted successfully",
      deletedBrand: brandInfo
    });
  } catch (error) {
    console.error(`Error deleting mobile brand with ID ${req.params.id}:`, error);
    res.status(500).json({ success: false, message: "Failed to delete mobile brand", error: error.message });
  }
}

// Bulk delete mobile brands
async function bulkDeleteMobileBrands(req, res) {
  try {
    const { brandIds } = req.body;
    
    if (!Array.isArray(brandIds) || brandIds.length === 0) {
      return res.status(400).json({ success: false, message: "Brand IDs array is required" });
    }

    // Check if all brands exist and don't have dependencies
    const brands = await MobileBrands.findAll({
      where: { id: brandIds },
      include: [
        { model: MobileModels, as: "mobileModels" },
        { model: CaseDetails }
      ]
    });

    if (brands.length !== brandIds.length) {
      return res.status(400).json({ 
        success: false,
        message: "Some brands not found",
        found: brands.length,
        requested: brandIds.length
      });
    }

    // Check for dependencies
    const brandsWithDependencies = brands.filter(brand => 
      (brand.mobileModels && brand.mobileModels.length > 0) ||
      (brand.CaseDetails && brand.CaseDetails.length > 0)
    );

    if (brandsWithDependencies.length > 0) {
      return res.status(400).json({ 
        success: false,
        message: "Some brands have associated models or case details and cannot be deleted",
        brandsWithDependencies: brandsWithDependencies.map(b => ({ id: b.id, name: b.name }))
      });
    }

    const deletedCount = await MobileBrands.destroy({
      where: { id: brandIds }
    });

    res.status(200).json({
      success: true,
      message: "Brands deleted successfully",
      deletedCount,
      deletedBrands: brands.map(b => ({ id: b.id, name: b.name }))
    });
  } catch (error) {
    console.error("Error bulk deleting brands:", error);
    res.status(500).json({ 
      success: false,
      message: "Failed to bulk delete brands", 
      error: error.message 
    });
  }
}

module.exports = {
  createMobileBrand,
  getAllMobileBrands,
  getMobileBrandById,
  updateMobileBrand,
  deleteMobileBrand,
  bulkDeleteMobileBrands,
};
