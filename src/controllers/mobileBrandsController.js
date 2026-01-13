const { MobileBrands, MobileModels, CaseDetails } = require("../models");

async function createMobileBrand(req, res) {
  try {
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ message: "Brand name is required." });
    }
    const newBrand = await MobileBrands.create({ name });
    res.status(201).json(newBrand);
  } catch (error) {
    console.error("Error creating mobile brand:", error);
    res.status(500).json({ message: "Failed to create mobile brand", error: error.message });
  }
}

async function getAllMobileBrands(req, res) {
  try {
    const brands = await MobileBrands.findAll({
      include: [
        { model: MobileModels, as: "mobileModels" },
        { model: CaseDetails }
      ]
    });
    res.status(200).json(brands);
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
    
    if (!name) {
      return res.status(400).json({ message: "Brand name is required" });
    }

    const [updatedRows] = await MobileBrands.update(
      { name },
      { where: { id: id } }
    );

    if (updatedRows > 0) {
      const updatedBrand = await MobileBrands.findByPk(id);
      return res.status(200).json(updatedBrand);
    } else {
      return res.status(404).json({ message: "Mobile brand not found" });
    }
  } catch (error) {
    console.error(`Error updating mobile brand with ID ${req.params.id}:`, error);
    res.status(500).json({ message: "Failed to update mobile brand", error: error.message });
  }
}

async function deleteMobileBrand(req, res) {
  try {
    const { id } = req.params;
    const deletedRows = await MobileBrands.destroy({
      where: { id: id },
    });
    if (deletedRows > 0) {
      return res.status(204).send();
    } else {
      return res.status(404).json({ message: "Mobile brand not found" });
    }
  } catch (error) {
    console.error(`Error deleting mobile brand with ID ${req.params.id}:`, error);
    res.status(500).json({ message: "Failed to delete mobile brand", error: error.message });
  }
}

module.exports = {
  createMobileBrand,
  getAllMobileBrands,
  getMobileBrandById,
  updateMobileBrand,
  deleteMobileBrand,
};
