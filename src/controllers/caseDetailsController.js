const { CaseDetails, Product, MobileBrands, MobileModels } = require("../models");

async function createCaseDetail(req, res) {
  try {
    const { productId, brandId, modelId, color, material, caseType } = req.body;
    
    if (!productId || !brandId || !modelId) {
      return res.status(400).json({ message: "Product ID, Brand ID, and Model ID are required." });
    }

    const newCaseDetail = await CaseDetails.create({
      productId,
      brandId,
      modelId,
      color,
      material,
      caseType
    });
    res.status(201).json(newCaseDetail);
  } catch (error) {
    console.error("Error creating case detail:", error);
    res.status(500).json({ message: "Failed to create case detail", error: error.message });
  }
}

async function getAllCaseDetails(req, res) {
  try {
    const caseDetails = await CaseDetails.findAll({
      include: [
        { model: Product, as: "product" },
        { model: MobileBrands, as: "brand" },
        { model: MobileModels, as: "model" }
      ]
    });
    res.status(200).json(caseDetails);
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
        { model: Product, as: "product" },
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
    const updateData = req.body;

    const [updatedRows] = await CaseDetails.update(updateData, {
      where: { id: id },
    });

    if (updatedRows > 0) {
      const updatedCaseDetail = await CaseDetails.findByPk(id);
      return res.status(200).json(updatedCaseDetail);
    } else {
      return res.status(404).json({ message: "Case detail not found" });
    }
  } catch (error) {
    console.error(`Error updating case detail with ID ${req.params.id}:`, error);
    res.status(500).json({ message: "Failed to update case detail", error: error.message });
  }
}

async function deleteCaseDetail(req, res) {
  try {
    const { id } = req.params;
    const deletedRows = await CaseDetails.destroy({
      where: { id: id },
    });
    if (deletedRows > 0) {
      return res.status(204).send();
    } else {
      return res.status(404).json({ message: "Case detail not found" });
    }
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
