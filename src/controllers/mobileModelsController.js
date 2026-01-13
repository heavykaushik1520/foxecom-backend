const { MobileModels, MobileBrands, CaseDetails } = require("../models");

async function createMobileModel(req, res) {
  try {
    const { name, brandId } = req.body;
    
    if (!name) {
      return res.status(400).json({ message: "Model name is required." });
    }
    if (!brandId) {
      return res.status(400).json({ message: "Brand ID is required." });
    }

    const newModel = await MobileModels.create({ name, brandId });
    res.status(201).json(newModel);
  } catch (error) {
    console.error("Error creating mobile model:", error);
    res.status(500).json({ message: "Failed to create mobile model", error: error.message });
  }
}

async function getAllMobileModels(req, res) {
  try {
    const models = await MobileModels.findAll({
      include: [
        { model: MobileBrands, as: "mobileBrands" },
        { model: CaseDetails }
      ]
    });
    res.status(200).json(models);
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

    const [updatedRows] = await MobileModels.update(
      { name, brandId },
      { where: { id: id } }
    );

    if (updatedRows > 0) {
      const updatedModel = await MobileModels.findByPk(id);
      return res.status(200).json(updatedModel);
    } else {
      return res.status(404).json({ message: "Mobile model not found" });
    }
  } catch (error) {
    console.error(`Error updating mobile model with ID ${req.params.id}:`, error);
    res.status(500).json({ message: "Failed to update mobile model", error: error.message });
  }
}

async function deleteMobileModel(req, res) {
  try {
    const { id } = req.params;
    const deletedRows = await MobileModels.destroy({
      where: { id: id },
    });
    if (deletedRows > 0) {
      return res.status(204).send();
    } else {
      return res.status(404).json({ message: "Mobile model not found" });
    }
  } catch (error) {
    console.error(`Error deleting mobile model with ID ${req.params.id}:`, error);
    res.status(500).json({ message: "Failed to delete mobile model", error: error.message });
  }
}

module.exports = {
  createMobileModel,
  getAllMobileModels,
  getMobileModelById,
  updateMobileModel,
  deleteMobileModel,
};
