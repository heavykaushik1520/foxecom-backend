const { BuyOneGetOne, Product, BuyOneGetOneProduct, ProductImage, Category } = require("../models");
const { Op } = require("sequelize");

async function getActiveBuyOneGetOne(req, res) {
  try {
    const now = new Date();
    const bogo = await BuyOneGetOne.findOne({
      where: {
        isActive: true,
        [Op.and]: [
          {
            [Op.or]: [{ startDate: null }, { startDate: { [Op.lte]: now } }],
          },
          {
            [Op.or]: [{ endDate: null }, { endDate: { [Op.gte]: now } }],
          },
        ],
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
              model: ProductImage,
              as: "images",
              limit: 1,
              attributes: ["imageUrl"],
            },
            {
              model: Category,
              as: "category",
              attributes: ["id", "name"],
            },
          ],
          order: [[BuyOneGetOneProduct, "sortOrder", "ASC"]],
        },
      ],
      order: [["createdAt", "DESC"]],
    });

    if (!bogo) {
      return res.status(200).json({
        success: true,
        deal: null,
        message: "No active Buy One Get One section",
      });
    }

    const formattedProducts = bogo.products.map((product) => ({
      id: product.id,
      title: product.title,
      price: parseFloat(product.price),
      discountPrice: product.discountPrice ? parseFloat(product.discountPrice) : null,
      stock: product.stock,
      thumbnailImage: product.thumbnailImage,
      images: product.images.map((img) => img.imageUrl),
      category: product.category,
      sortOrder: product.BuyOneGetOneProduct?.sortOrder || 0,
    }));

    res.status(200).json({
      success: true,
      deal: {
        id: bogo.id,
        title: bogo.title,
        description: bogo.description,
        isActive: bogo.isActive,
        startDate: bogo.startDate,
        endDate: bogo.endDate,
        createdAt: bogo.createdAt,
        updatedAt: bogo.updatedAt,
        products: formattedProducts,
      },
    });
  } catch (error) {
    console.error("Error fetching active Buy One Get One:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch Buy One Get One section",
      error: error.message,
    });
  }
}

async function getAllBuyOneGetOne(req, res) {
  try {
    const { page = 1, limit = 10, includeInactive = false } = req.query;
    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    const where = {};
    if (includeInactive !== "true") {
      where.isActive = true;
    }

    const { count, rows } = await BuyOneGetOne.findAndCountAll({
      where,
      include: [
        {
          model: Product,
          as: "products",
          through: {
            attributes: ["sortOrder"],
          },
          attributes: ["id", "title", "price", "discountPrice", "thumbnailImage"],
          order: [[BuyOneGetOneProduct, "sortOrder", "ASC"]],
        },
      ],
      order: [["createdAt", "DESC"]],
      limit: parseInt(limit, 10),
      offset,
    });

    res.status(200).json({
      success: true,
      pagination: {
        totalItems: count,
        totalPages: Math.ceil(count / parseInt(limit, 10)),
        currentPage: parseInt(page, 10),
        limit: parseInt(limit, 10),
      },
      deals: rows.map((deal) => ({
        id: deal.id,
        title: deal.title,
        description: deal.description,
        isActive: deal.isActive,
        startDate: deal.startDate,
        endDate: deal.endDate,
        productCount: deal.products?.length || 0,
        products:
          deal.products?.map((p) => ({
            id: p.id,
            title: p.title,
            price: parseFloat(p.price),
            discountPrice: p.discountPrice ? parseFloat(p.discountPrice) : null,
            thumbnailImage: p.thumbnailImage,
            sortOrder: p.BuyOneGetOneProduct?.sortOrder || 0,
          })) || [],
        createdAt: deal.createdAt,
        updatedAt: deal.updatedAt,
      })),
    });
  } catch (error) {
    console.error("Error fetching Buy One Get One list:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch Buy One Get One list",
      error: error.message,
    });
  }
}

async function getBuyOneGetOneById(req, res) {
  try {
    const { id } = req.params;
    const deal = await BuyOneGetOne.findByPk(id, {
      include: [
        {
          model: Product,
          as: "products",
          through: {
            attributes: ["sortOrder"],
          },
          include: [
            {
              model: ProductImage,
              as: "images",
              limit: 1,
              attributes: ["imageUrl"],
            },
            {
              model: Category,
              as: "category",
              attributes: ["id", "name"],
            },
          ],
          order: [[BuyOneGetOneProduct, "sortOrder", "ASC"]],
        },
      ],
    });

    if (!deal) {
      return res.status(404).json({
        success: false,
        message: "Buy One Get One section not found",
      });
    }

    const formattedProducts = deal.products.map((product) => ({
      id: product.id,
      title: product.title,
      price: parseFloat(product.price),
      discountPrice: product.discountPrice ? parseFloat(product.discountPrice) : null,
      stock: product.stock,
      thumbnailImage: product.thumbnailImage,
      images: product.images.map((img) => img.imageUrl),
      category: product.category,
      sortOrder: product.BuyOneGetOneProduct?.sortOrder || 0,
    }));

    res.status(200).json({
      success: true,
      deal: {
        id: deal.id,
        title: deal.title,
        description: deal.description,
        isActive: deal.isActive,
        startDate: deal.startDate,
        endDate: deal.endDate,
        products: formattedProducts,
        createdAt: deal.createdAt,
        updatedAt: deal.updatedAt,
      },
    });
  } catch (error) {
    console.error("Error fetching Buy One Get One by ID:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch Buy One Get One section",
      error: error.message,
    });
  }
}

async function createBuyOneGetOne(req, res) {
  try {
    const { title, description, startDate, endDate, productIds } = req.body;

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

    const deal = await BuyOneGetOne.create({
      title: title || "Buy One Get One",
      description: description || null,
      isActive: true,
      startDate: startDate || null,
      endDate: endDate || null,
    });

    const linkRows = productIds.map((productId, index) => ({
      buyOneGetOneId: deal.id,
      productId,
      sortOrder: index,
    }));

    await BuyOneGetOneProduct.bulkCreate(linkRows);

    const createdDeal = await BuyOneGetOne.findByPk(deal.id, {
      include: [
        {
          model: Product,
          as: "products",
          through: {
            attributes: ["sortOrder"],
          },
          include: [
            {
              model: ProductImage,
              as: "images",
              limit: 1,
              attributes: ["imageUrl"],
            },
            {
              model: Category,
              as: "category",
              attributes: ["id", "name"],
            },
          ],
          order: [[BuyOneGetOneProduct, "sortOrder", "ASC"]],
        },
      ],
    });

    const formattedProducts = createdDeal.products.map((product) => ({
      id: product.id,
      title: product.title,
      price: parseFloat(product.price),
      discountPrice: product.discountPrice ? parseFloat(product.discountPrice) : null,
      stock: product.stock,
      thumbnailImage: product.thumbnailImage,
      images: product.images.map((img) => img.imageUrl),
      category: product.category,
      sortOrder: product.BuyOneGetOneProduct?.sortOrder || 0,
    }));

    res.status(201).json({
      success: true,
      deal: {
        id: createdDeal.id,
        title: createdDeal.title,
        description: createdDeal.description,
        isActive: createdDeal.isActive,
        startDate: createdDeal.startDate,
        endDate: createdDeal.endDate,
        products: formattedProducts,
        createdAt: createdDeal.createdAt,
        updatedAt: createdDeal.updatedAt,
      },
    });
  } catch (error) {
    console.error("Error creating Buy One Get One:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create Buy One Get One section",
      error: error.message,
    });
  }
}

async function updateBuyOneGetOne(req, res) {
  try {
    const { id } = req.params;
    const { title, description, isActive, startDate, endDate, productIds } = req.body;

    const deal = await BuyOneGetOne.findByPk(id);
    if (!deal) {
      return res.status(404).json({
        success: false,
        message: "Buy One Get One section not found",
      });
    }

    if (title !== undefined) deal.title = title;
    if (description !== undefined) deal.description = description;
    if (isActive !== undefined) deal.isActive = isActive;
    if (startDate !== undefined) deal.startDate = startDate;
    if (endDate !== undefined) deal.endDate = endDate;

    await deal.save();

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

      await BuyOneGetOneProduct.destroy({
        where: {
          buyOneGetOneId: deal.id,
        },
      });

      const linkRows = productIds.map((productId, index) => ({
        buyOneGetOneId: deal.id,
        productId,
        sortOrder: index,
      }));

      await BuyOneGetOneProduct.bulkCreate(linkRows);
    }

    const updatedDeal = await BuyOneGetOne.findByPk(deal.id, {
      include: [
        {
          model: Product,
          as: "products",
          through: {
            attributes: ["sortOrder"],
          },
          include: [
            {
              model: ProductImage,
              as: "images",
              limit: 1,
              attributes: ["imageUrl"],
            },
            {
              model: Category,
              as: "category",
              attributes: ["id", "name"],
            },
          ],
          order: [[BuyOneGetOneProduct, "sortOrder", "ASC"]],
        },
      ],
    });

    const formattedProducts = updatedDeal.products.map((product) => ({
      id: product.id,
      title: product.title,
      price: parseFloat(product.price),
      discountPrice: product.discountPrice ? parseFloat(product.discountPrice) : null,
      stock: product.stock,
      thumbnailImage: product.thumbnailImage,
      images: product.images.map((img) => img.imageUrl),
      category: product.category,
      sortOrder: product.BuyOneGetOneProduct?.sortOrder || 0,
    }));

    res.status(200).json({
      success: true,
      deal: {
        id: updatedDeal.id,
        title: updatedDeal.title,
        description: updatedDeal.description,
        isActive: updatedDeal.isActive,
        startDate: updatedDeal.startDate,
        endDate: updatedDeal.endDate,
        products: formattedProducts,
        createdAt: updatedDeal.createdAt,
        updatedAt: updatedDeal.updatedAt,
      },
    });
  } catch (error) {
    console.error("Error updating Buy One Get One:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update Buy One Get One section",
      error: error.message,
    });
  }
}

async function deleteBuyOneGetOne(req, res) {
  try {
    const { id } = req.params;
    const deal = await BuyOneGetOne.findByPk(id);

    if (!deal) {
      return res.status(404).json({
        success: false,
        message: "Buy One Get One section not found",
      });
    }

    await deal.destroy();

    res.status(200).json({
      success: true,
      message: "Buy One Get One section deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting Buy One Get One:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete Buy One Get One section",
      error: error.message,
    });
  }
}

module.exports = {
  getActiveBuyOneGetOne,
  getAllBuyOneGetOne,
  getBuyOneGetOneById,
  createBuyOneGetOne,
  updateBuyOneGetOne,
  deleteBuyOneGetOne,
};

