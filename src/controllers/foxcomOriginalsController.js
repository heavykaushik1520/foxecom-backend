const { Op } = require("sequelize");

const {
  FoxcomOriginals,
  Product,
  FoxcomOriginalsProduct,
  Category,
} = require("../models");

async function getActiveFoxcomOriginals(req, res) {
  try {
    const originals = await FoxcomOriginals.findOne({
      where: {
        isActive: true,
      },
      include: [
        {
          model: Product,
          as: "products",
          through: {
            attributes: ["sortOrder"],
          },
          include: [
            {
              model: Category,
              as: "category",
              attributes: ["id", "name"],
            },
          ],
          order: [[FoxcomOriginalsProduct, "sortOrder", "ASC"]],
        },
      ],
      order: [["createdAt", "DESC"]],
    });

    if (!originals) {
      return res.status(200).json({
        success: true,
        originals: null,
        message: "No active FOXECOM Originals section",
      });
    }

    const formattedProducts = originals.products.map((product) => ({
      id: product.id,
      title: product.title,
      thumbnailImage: product.thumbnailImage,
      category: product.category,
      sortOrder: product.FoxcomOriginalsProduct?.sortOrder || 0,
    }));

    return res.status(200).json({
      success: true,
      originals: {
        id: originals.id,
        title: originals.title,
        isActive: originals.isActive,
        createdAt: originals.createdAt,
        updatedAt: originals.updatedAt,
        products: formattedProducts,
      },
    });
  } catch (error) {
    console.error("Error fetching active FOXECOM Originals:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch FOXECOM Originals section",
      error: error.message,
    });
  }
}

async function getAllFoxcomOriginals(req, res) {
  try {
    const {
      page = 1,
      limit = 10,
      includeInactive = false,
    } = req.query;

    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    const where = {};
    if (includeInactive !== "true") {
      where.isActive = true;
    }

    const { count, rows } = await FoxcomOriginals.findAndCountAll({
      where,
      include: [
        {
          model: Product,
          as: "products",
          through: {
            attributes: ["sortOrder"],
          },
          attributes: ["id", "title", "thumbnailImage"],
          order: [[FoxcomOriginalsProduct, "sortOrder", "ASC"]],
        },
      ],
      order: [["createdAt", "DESC"]],
      limit: parseInt(limit, 10),
      offset,
    });

    return res.status(200).json({
      success: true,
      pagination: {
        totalItems: count,
        totalPages: Math.ceil(count / parseInt(limit, 10)),
        currentPage: parseInt(page, 10),
        limit: parseInt(limit, 10),
      },
      originals: rows.map((o) => ({
        id: o.id,
        title: o.title,
        isActive: o.isActive,
        productCount: o.products?.length || 0,
        products:
          o.products?.map((p) => ({
            id: p.id,
            title: p.title,
            thumbnailImage: p.thumbnailImage,
            sortOrder: p.FoxcomOriginalsProduct?.sortOrder || 0,
          })) || [],
        createdAt: o.createdAt,
        updatedAt: o.updatedAt,
      })),
    });
  } catch (error) {
    console.error("Error fetching FOXECOM Originals list:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch FOXECOM Originals list",
      error: error.message,
    });
  }
}

async function getFoxcomOriginalsById(req, res) {
  try {
    const { id } = req.params;

    const originals = await FoxcomOriginals.findByPk(id, {
      include: [
        {
          model: Product,
          as: "products",
          through: {
            attributes: ["sortOrder"],
          },
          include: [
            {
              model: Category,
              as: "category",
              attributes: ["id", "name"],
            },
          ],
          order: [[FoxcomOriginalsProduct, "sortOrder", "ASC"]],
        },
      ],
    });

    if (!originals) {
      return res.status(404).json({
        success: false,
        message: "FOXECOM Originals section not found",
      });
    }

    const formattedProducts = originals.products.map((product) => ({
      id: product.id,
      title: product.title,
      thumbnailImage: product.thumbnailImage,
      category: product.category,
      sortOrder: product.FoxcomOriginalsProduct?.sortOrder || 0,
    }));

    return res.status(200).json({
      success: true,
      originals: {
        id: originals.id,
        title: originals.title,
        isActive: originals.isActive,
        products: formattedProducts,
        createdAt: originals.createdAt,
        updatedAt: originals.updatedAt,
      },
    });
  } catch (error) {
    console.error("Error fetching FOXECOM Originals by ID:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch FOXECOM Originals section",
      error: error.message,
    });
  }
}

async function createFoxcomOriginals(req, res) {
  try {
    const { title, isActive, productIds } = req.body;

    if (!Array.isArray(productIds) || productIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "At least one product is required",
      });
    }

    const products = await Product.findAll({
      where: {
        id: {
          [Op.in]: productIds,
        },
      },
    });

    if (products.length !== productIds.length) {
      return res.status(400).json({
        success: false,
        message: "One or more products not found",
      });
    }

    const originals = await FoxcomOriginals.create({
      title: title || "FOXECOM Originals",
      isActive: isActive !== undefined ? isActive : true,
    });

    const linkRows = productIds.map((productId, index) => ({
      foxcomOriginalsId: originals.id,
      productId,
      sortOrder: index,
    }));

    await FoxcomOriginalsProduct.bulkCreate(linkRows);

    const created = await FoxcomOriginals.findByPk(originals.id, {
      include: [
        {
          model: Product,
          as: "products",
          through: { attributes: ["sortOrder"] },
          include: [
            { model: Category, as: "category", attributes: ["id", "name"] },
          ],
          order: [[FoxcomOriginalsProduct, "sortOrder", "ASC"]],
        },
      ],
    });

    return res.status(201).json({
      success: true,
      originals: {
        id: created.id,
        title: created.title,
        isActive: created.isActive,
        createdAt: created.createdAt,
        updatedAt: created.updatedAt,
        products: created.products.map((p) => ({
          id: p.id,
          title: p.title,
          thumbnailImage: p.thumbnailImage,
          category: p.category,
          sortOrder: p.FoxcomOriginalsProduct?.sortOrder || 0,
        })),
      },
    });
  } catch (error) {
    console.error("Error creating FOXECOM Originals:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to create FOXECOM Originals section",
      error: error.message,
    });
  }
}

async function updateFoxcomOriginals(req, res) {
  try {
    const { id } = req.params;
    const { title, isActive, productIds } = req.body;

    const originals = await FoxcomOriginals.findByPk(id);

    if (!originals) {
      return res.status(404).json({
        success: false,
        message: "FOXECOM Originals section not found",
      });
    }

    if (title !== undefined) originals.title = title;
    if (isActive !== undefined) originals.isActive = isActive;

    await originals.save();

    if (Array.isArray(productIds)) {
      if (productIds.length === 0) {
        return res.status(400).json({
          success: false,
          message: "At least one product is required",
        });
      }

      const products = await Product.findAll({
        where: {
          id: {
            [Op.in]: productIds,
          },
        },
      });

      if (products.length !== productIds.length) {
        return res.status(400).json({
          success: false,
          message: "One or more products not found",
        });
      }

      await FoxcomOriginalsProduct.destroy({
        where: {
          foxcomOriginalsId: originals.id,
        },
      });

      const linkRows = productIds.map((productId, index) => ({
        foxcomOriginalsId: originals.id,
        productId,
        sortOrder: index,
      }));

      await FoxcomOriginalsProduct.bulkCreate(linkRows);
    }

    const updated = await FoxcomOriginals.findByPk(originals.id, {
      include: [
        {
          model: Product,
          as: "products",
          through: { attributes: ["sortOrder"] },
          include: [
            { model: Category, as: "category", attributes: ["id", "name"] },
          ],
          order: [[FoxcomOriginalsProduct, "sortOrder", "ASC"]],
        },
      ],
    });

    return res.status(200).json({
      success: true,
      originals: {
        id: updated.id,
        title: updated.title,
        isActive: updated.isActive,
        products: updated.products.map((p) => ({
          id: p.id,
          title: p.title,
          thumbnailImage: p.thumbnailImage,
          category: p.category,
          sortOrder: p.FoxcomOriginalsProduct?.sortOrder || 0,
        })),
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt,
      },
    });
  } catch (error) {
    console.error("Error updating FOXECOM Originals:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update FOXECOM Originals section",
      error: error.message,
    });
  }
}

async function deleteFoxcomOriginals(req, res) {
  try {
    const { id } = req.params;

    const originals = await FoxcomOriginals.findByPk(id);

    if (!originals) {
      return res.status(404).json({
        success: false,
        message: "FOXECOM Originals section not found",
      });
    }

    await originals.destroy();

    return res.status(200).json({
      success: true,
      message: "FOXECOM Originals section deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting FOXECOM Originals:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete FOXECOM Originals section",
      error: error.message,
    });
  }
}

module.exports = {
  getActiveFoxcomOriginals,
  getAllFoxcomOriginals,
  getFoxcomOriginalsById,
  createFoxcomOriginals,
  updateFoxcomOriginals,
  deleteFoxcomOriginals,
};

