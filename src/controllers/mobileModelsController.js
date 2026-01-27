const { MobileModels, MobileBrands, CaseDetails } = require("../models");
const { Op } = require("sequelize");

async function createMobileModel(req, res) {
  try {
    const { name, brandId } = req.body;
    
    // Enhanced validation
    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ success: false, message: "Model name is required and must be a non-empty string." });
    }
    if (!brandId) {
      return res.status(400).json({ success: false, message: "Brand ID is required." });
    }

    // Check if brand exists
    const brand = await MobileBrands.findByPk(brandId);
    if (!brand) {
      return res.status(404).json({ success: false, message: "Mobile brand not found." });
    }

    const trimmedName = name.trim();
    
    // Check if model already exists for this brand
    const existingModel = await MobileModels.findOne({ 
      where: { 
        name: { [Op.iLike]: trimmedName },
        brandId: brandId
      } 
    });
    if (existingModel) {
      return res.status(409).json({ success: false, message: "Model with this name already exists for this brand." });
    }

    const newModel = await MobileModels.create({ name: trimmedName, brandId });
    const modelWithBrand = await MobileModels.findByPk(newModel.id, {
      include: [
        { model: MobileBrands, as: "mobileBrands" },
        { model: CaseDetails }
      ]
    });
    
    res.status(201).json({ 
      success: true,
      message: "Mobile model created successfully",
      model: modelWithBrand 
    });
  } catch (error) {
    console.error("Error creating mobile model:", error);
    if (error.name === 'SequelizeForeignKeyConstraintError') {
      return res.status(400).json({ success: false, message: "Invalid brand ID." });
    }
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({ success: false, message: "Model with this name already exists for this brand." });
    }
    res.status(500).json({ success: false, message: "Failed to create mobile model", error: error.message });
  }
}

async function getAllMobileModels(req, res) {
  try {
    const { page = 1, limit = 10, search, brandId } = req.query;
    const offset = (page - 1) * limit;
    
    // Build where clause for search and brandId filter
    const where = {};
    if (search && search.trim()) {
      where.name = { [Op.like]: `%${search.trim()}%` };
    }
    if (brandId) {
      where.brandId = parseInt(brandId);
    }
    
    const { count, rows: models } = await MobileModels.findAndCountAll({
      where,
      include: [
        { model: MobileBrands, as: "mobileBrands" },
        { model: CaseDetails }
      ],
      order: [['createdAt', 'ASC']],
      limit: parseInt(limit),
      offset: offset,
    });
    
    res.status(200).json({
      models,
      pagination: {
        totalItems: count,
        totalPages: Math.ceil(count / limit),
        currentPage: parseInt(page),
        itemsPerPage: parseInt(limit)
      }
    });
  } catch (error) {
    console.error("Error fetching mobile models:", error);
    res.status(500).json({ message: "Failed to fetch mobile models", error: error.message });
  }
}

async function getMobileModelById(req, res) {
  try {
    const { id } = req.params;
    const model = await MobileModels.findByPk(id, {
      include: [
        { model: MobileBrands, as: "mobileBrands" },
        { model: CaseDetails }
      ]
    });
    if (!model) {
      return res.status(404).json({ message: "Mobile model not found" });
    }
    res.status(200).json(model);
  } catch (error) {
    console.error(`Error fetching mobile model with ID ${req.params.id}:`, error);
    res.status(500).json({ message: "Failed to fetch mobile model", error: error.message });
  }
}

async function updateMobileModel(req, res) {
  try {
    const { id } = req.params;
    const { name, brandId } = req.body;

    // Check if model exists
    const model = await MobileModels.findByPk(id);
    if (!model) {
      return res.status(404).json({ success: false, message: "Mobile model not found" });
    }

    const updateData = {};
    
    // Validate and update name
    if (name !== undefined) {
      if (!name || typeof name !== "string" || !name.trim()) {
        return res.status(400).json({ success: false, message: "Model name must be a non-empty string." });
      }
      updateData.name = name.trim();
    }
    
    // Validate and update brandId
    if (brandId !== undefined) {
      const brand = await MobileBrands.findByPk(brandId);
      if (!brand) {
        return res.status(404).json({ success: false, message: "Mobile brand not found." });
      }
      updateData.brandId = brandId;
    }

    // Check for duplicate name if name or brandId is being updated
    if (updateData.name || updateData.brandId) {
      const finalName = updateData.name || model.name;
      const finalBrandId = updateData.brandId || model.brandId;
      
      const existingModel = await MobileModels.findOne({ 
        where: { 
          name: { [Op.iLike]: finalName },
          brandId: finalBrandId,
          id: { [Op.ne]: id }
        } 
      });
      if (existingModel) {
        return res.status(409).json({ success: false, message: "Model with this name already exists for this brand." });
      }
    }

    await model.update(updateData);
    const updatedModel = await MobileModels.findByPk(id, {
      include: [
        { model: MobileBrands, as: "mobileBrands" },
        { model: CaseDetails }
      ]
    });
    
    return res.status(200).json({ 
      success: true,
      message: "Mobile model updated successfully",
      model: updatedModel 
    });
  } catch (error) {
    console.error(`Error updating mobile model with ID ${req.params.id}:`, error);
    if (error.name === 'SequelizeForeignKeyConstraintError') {
      return res.status(400).json({ success: false, message: "Invalid brand ID." });
    }
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({ success: false, message: "Model with this name already exists for this brand." });
    }
    res.status(500).json({ success: false, message: "Failed to update mobile model", error: error.message });
  }
}

async function deleteMobileModel(req, res) {
  try {
    const { id } = req.params;
    
    // Check if model exists and has associated case details
    const model = await MobileModels.findByPk(id, {
      include: [
        { model: MobileBrands, as: "mobileBrands" },
        { model: CaseDetails }
      ]
    });
    
    if (!model) {
      return res.status(404).json({ success: false, message: "Mobile model not found" });
    }
    
    // Check if model has associated case details
    if (model.CaseDetails && model.CaseDetails.length > 0) {
      return res.status(400).json({ 
        success: false,
        message: "Cannot delete model that has associated case details. Please delete case details first.",
        caseDetailsCount: model.CaseDetails.length
      });
    }
    
    const modelInfo = {
      id: model.id,
      name: model.name,
      brandId: model.brandId
    };
    
    await model.destroy();
    
    return res.status(200).json({ 
      success: true,
      message: "Mobile model deleted successfully",
      deletedModel: modelInfo
    });
  } catch (error) {
    console.error(`Error deleting mobile model with ID ${req.params.id}:`, error);
    res.status(500).json({ success: false, message: "Failed to delete mobile model", error: error.message });
  }
}

// Bulk delete mobile models
async function bulkDeleteMobileModels(req, res) {
  try {
    const { modelIds } = req.body;
    
    if (!Array.isArray(modelIds) || modelIds.length === 0) {
      return res.status(400).json({ success: false, message: "Model IDs array is required" });
    }

    // Check if all models exist and don't have dependencies
    const models = await MobileModels.findAll({
      where: { id: modelIds },
      include: [
        { model: MobileBrands, as: "mobileBrands" },
        { model: CaseDetails }
      ]
    });

    if (models.length !== modelIds.length) {
      return res.status(400).json({ 
        success: false,
        message: "Some models not found",
        found: models.length,
        requested: modelIds.length
      });
    }

    // Check for dependencies
    const modelsWithDependencies = models.filter(model => 
      model.CaseDetails && model.CaseDetails.length > 0
    );

    if (modelsWithDependencies.length > 0) {
      return res.status(400).json({ 
        success: false,
        message: "Some models have associated case details and cannot be deleted",
        modelsWithDependencies: modelsWithDependencies.map(m => ({ id: m.id, name: m.name }))
      });
    }

    const deletedCount = await MobileModels.destroy({
      where: { id: modelIds }
    });

    res.status(200).json({
      success: true,
      message: "Models deleted successfully",
      deletedCount,
      deletedModels: models.map(m => ({ id: m.id, name: m.name }))
    });
  } catch (error) {
    console.error("Error bulk deleting models:", error);
    res.status(500).json({ 
      success: false,
      message: "Failed to bulk delete models", 
      error: error.message 
    });
  }
}

module.exports = {
  createMobileModel,
  getAllMobileModels,
  getMobileModelById,
  updateMobileModel,
  deleteMobileModel,
  bulkDeleteMobileModels,
};
