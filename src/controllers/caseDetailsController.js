const { CaseDetails, Product, MobileBrands, MobileModels, ProductImage, Category } = require("../models");

async function createCaseDetail(req, res) {
  try {
    const { productId, brandId, modelId, color, material, caseType } = req.body;
    
    // Validation
    if (!productId || !brandId || !modelId) {
      return res.status(400).json({ message: "Product ID, Brand ID, and Model ID are required." });
    }

    // Check if product exists
    const product = await Product.findByPk(productId, {
      include: [{ model: Category, as: "category" }]
    });
    
    if (!product) {
      return res.status(404).json({ message: "Product not found." });
    }

    // Verify product belongs to mobile cases category
    if (!product.category || !product.category.name || 
        !product.category.name.toLowerCase().includes('case')) {
      return res.status(400).json({ 
        message: "Case details can only be added to mobile case products." 
      });
    }

    // Check if brand exists
    const brand = await MobileBrands.findByPk(brandId);
    if (!brand) {
      return res.status(404).json({ message: "Mobile brand not found." });
    }

    // Check if model exists and belongs to the brand
    const model = await MobileModels.findOne({
      where: { id: modelId, brandId: brandId }
    });
    if (!model) {
      return res.status(404).json({ message: "Mobile model not found or does not belong to the specified brand." });
    }

    // Check if case details already exist for this product
    const existingCaseDetail = await CaseDetails.findOne({ where: { productId } });
    if (existingCaseDetail) {
      return res.status(409).json({ message: "Case details already exist for this product." });
    }

    const newCaseDetail = await CaseDetails.create({
      productId,
      brandId,
      modelId,
      color: color || null,
      material: material || null,
      caseType: caseType || null
    });

    // Fetch complete case detail with associations
    const caseDetailWithAssociations = await CaseDetails.findByPk(newCaseDetail.id, {
      include: [
        { model: Product, as: "product", include: [{ model: Category, as: "category" }] },
        { model: MobileBrands, as: "brand" },
        { model: MobileModels, as: "model" }
      ]
    });

    res.status(201).json({
      message: "Case details created successfully",
      caseDetail: caseDetailWithAssociations
    });
  } catch (error) {
    console.error("Error creating case detail:", error);
    if (error.name === 'SequelizeForeignKeyConstraintError') {
      return res.status(400).json({ message: "Invalid product, brand, or model ID." });
    }
    res.status(500).json({ message: "Failed to create case detail", error: error.message });
  }
}

async function getAllCaseDetails(req, res) {
  try {
    const { page = 1, limit = 10, brandId, modelId } = req.query;
    const offset = (page - 1) * limit;
    
    const where = {};
    if (brandId) where.brandId = brandId;
    if (modelId) where.modelId = modelId;

    const { count, rows: caseDetails } = await CaseDetails.findAndCountAll({
      where,
      limit: parseInt(limit),
      offset: offset,
      include: [
        { 
          model: Product, 
          as: "product",
          include: [
            { model: Category, as: "category" },
            { model: ProductImage, as: "images", limit: 1 }
          ]
        },
        { model: MobileBrands, as: "brand" },
        { model: MobileModels, as: "model" }
      ],
      order: [['createdAt', 'DESC']]
    });

    res.status(200).json({
      totalItems: count,
      totalPages: Math.ceil(count / limit),
      currentPage: parseInt(page),
      caseDetails
    });
  } catch (error) {
    console.error("Error fetching case details:", error);
    res.status(500).json({ message: "Failed to fetch case details", error: error.message });
  }
}

async function getCaseDetailById(req, res) {
  try {
    const { id } = req.params;
    const caseDetail = await CaseDetails.findByPk(id, {
      include: [
        { 
          model: Product, 
          as: "product",
          include: [
            { model: Category, as: "category" },
            { model: ProductImage, as: "images" }
          ]
        },
        { model: MobileBrands, as: "brand" },
        { model: MobileModels, as: "model" }
      ]
    });
    if (!caseDetail) {
      return res.status(404).json({ message: "Case detail not found" });
    }
    res.status(200).json(caseDetail);
  } catch (error) {
    console.error(`Error fetching case detail with ID ${req.params.id}:`, error);
    res.status(500).json({ message: "Failed to fetch case detail", error: error.message });
  }
}

async function updateCaseDetail(req, res) {
  try {
    const { id } = req.params;
    const { productId, brandId, modelId, color, material, caseType } = req.body;

    // Check if case detail exists
    const caseDetail = await CaseDetails.findByPk(id);
    if (!caseDetail) {
      return res.status(404).json({ message: "Case detail not found" });
    }

    // Validate brand and model if provided
    if (brandId) {
      const brand = await MobileBrands.findByPk(brandId);
      if (!brand) {
        return res.status(404).json({ message: "Mobile brand not found." });
      }
    }

    if (modelId) {
      const model = await MobileModels.findOne({
        where: { id: modelId, brandId: brandId || caseDetail.brandId }
      });
      if (!model) {
        return res.status(404).json({ message: "Mobile model not found or does not belong to the specified brand." });
      }
    }

    // Prepare update data (only update provided fields)
    const updateData = {};
    if (brandId !== undefined) updateData.brandId = brandId;
    if (modelId !== undefined) updateData.modelId = modelId;
    if (color !== undefined) updateData.color = color;
    if (material !== undefined) updateData.material = material;
    if (caseType !== undefined) updateData.caseType = caseType;

    await CaseDetails.update(updateData, {
      where: { id: id },
    });

    // Fetch updated case detail with associations
    const updatedCaseDetail = await CaseDetails.findByPk(id, {
      include: [
        { model: Product, as: "product", include: [{ model: Category, as: "category" }] },
        { model: MobileBrands, as: "brand" },
        { model: MobileModels, as: "model" }
      ]
    });

    return res.status(200).json({
      message: "Case detail updated successfully",
      caseDetail: updatedCaseDetail
    });
  } catch (error) {
    console.error(`Error updating case detail with ID ${req.params.id}:`, error);
    if (error.name === 'SequelizeForeignKeyConstraintError') {
      return res.status(400).json({ message: "Invalid product, brand, or model ID." });
    }
    res.status(500).json({ message: "Failed to update case detail", error: error.message });
  }
}

async function deleteCaseDetail(req, res) {
  try {
    const { id } = req.params;
    
    // Check if case detail exists before deletion
    const caseDetail = await CaseDetails.findByPk(id);
    if (!caseDetail) {
      return res.status(404).json({ message: "Case detail not found" });
    }

    await CaseDetails.destroy({
      where: { id: id },
    });

    return res.status(200).json({ 
      message: "Case detail deleted successfully",
      deletedId: id
    });
  } catch (error) {
    console.error(`Error deleting case detail with ID ${req.params.id}:`, error);
    res.status(500).json({ message: "Failed to delete case detail", error: error.message });
  }
}

module.exports = {
  createCaseDetail,
  getAllCaseDetails,
  getCaseDetailById,
  updateCaseDetail,
  deleteCaseDetail,
};
