const { DealOfTheWeek, Product, DealOfTheWeekProduct, ProductImage, Category } = require("../models");
const { Op } = require("sequelize");

/**
 * Public: Get active Deal of the Week with products
 * Returns null if no active deal exists
 */
async function getActiveDealOfTheWeek(req, res) {
  try {
    const now = new Date();
    const deal = await DealOfTheWeek.findOne({
      where: {
        isActive: true,
        [Op.and]: [
          {
            [Op.or]: [
              { startDate: null },
              { startDate: { [Op.lte]: now } },
            ],
          },
          {
            [Op.or]: [
              { endDate: null },
              { endDate: { [Op.gte]: now } },
            ],
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
          order: [[DealOfTheWeekProduct, "sortOrder", "ASC"]],
        },
      ],
      order: [["createdAt", "DESC"]],
    });

    if (!deal) {
      return res.status(200).json({
        success: true,
        deal: null,
        message: "No active Deal of the Week",
      });
    }

    // Format products with proper structure
    const formattedProducts = deal.products.map((product) => ({
      id: product.id,
      title: product.title,
      price: parseFloat(product.price),
      discountPrice: product.discountPrice ? parseFloat(product.discountPrice) : null,
      stock: product.stock,
      thumbnailImage: product.thumbnailImage,
      images: product.images.map((img) => img.imageUrl),
      category: product.category,
      sortOrder: product.DealOfTheWeekProduct?.sortOrder || 0,
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
        createdAt: deal.createdAt,
        updatedAt: deal.updatedAt,
        products: formattedProducts,
      },
    });
  } catch (error) {
    console.error("Error fetching active Deal of the Week:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch Deal of the Week",
      error: error.message,
    });
  }
}

/**
 * Admin: Get all deals (active and inactive)
 */
async function getAllDealsOfTheWeek(req, res) {
  try {
    const { page = 1, limit = 10, includeInactive = false } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const where = {};
    if (includeInactive !== "true") {
      where.isActive = true;
    }

    const { count, rows: deals } = await DealOfTheWeek.findAndCountAll({
      where,
      include: [
        {
          model: Product,
          as: "products",
          through: {
            attributes: ["sortOrder"],
          },
          attributes: ["id", "title", "price", "discountPrice", "thumbnailImage"],
          order: [[DealOfTheWeekProduct, "sortOrder", "ASC"]],
        },
      ],
      order: [["createdAt", "DESC"]],
      limit: parseInt(limit),
      offset: offset,
    });

    res.status(200).json({
      success: true,
      pagination: {
        totalItems: count,
        totalPages: Math.ceil(count / parseInt(limit)),
        currentPage: parseInt(page),
        limit: parseInt(limit),
      },
      deals: deals.map((deal) => ({
        id: deal.id,
        title: deal.title,
        description: deal.description,
        isActive: deal.isActive,
        startDate: deal.startDate,
        endDate: deal.endDate,
        productCount: deal.products?.length || 0,
        products: deal.products?.map((p) => ({
          id: p.id,
          title: p.title,
          price: parseFloat(p.price),
          discountPrice: p.discountPrice ? parseFloat(p.discountPrice) : null,
          thumbnailImage: p.thumbnailImage,
          sortOrder: p.DealOfTheWeekProduct?.sortOrder || 0,
        })) || [],
        createdAt: deal.createdAt,
        updatedAt: deal.updatedAt,
      })),
    });
  } catch (error) {
    console.error("Error fetching all Deals of the Week:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch Deals of the Week",
      error: error.message,
    });
  }
}

/**
 * Admin: Get deal by ID with full product details
 */
async function getDealOfTheWeekById(req, res) {
  try {
    const { id } = req.params;
    const deal = await DealOfTheWeek.findByPk(id, {
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
          order: [[DealOfTheWeekProduct, "sortOrder", "ASC"]],
        },
      ],
    });

    if (!deal) {
      return res.status(404).json({
        success: false,
        message: "Deal of the Week not found",
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
      sortOrder: product.DealOfTheWeekProduct?.sortOrder || 0,
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
    console.error("Error fetching Deal of the Week by ID:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch Deal of the Week",
      error: error.message,
    });
  }
}

/**
 * Admin: Create a new Deal of the Week
 * Body: { title, description, startDate, endDate, productIds: [1, 2, 3] }
 */
async function createDealOfTheWeek(req, res) {
  try {
    const { title, description, startDate, endDate, productIds } = req.body;

    // Validate productIds
    if (!Array.isArray(productIds) || productIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "At least one product is required",
      });
    }

    // Verify all products exist
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

    // Create the deal
    const deal = await DealOfTheWeek.create({
      title: title || "Deal of the Week",
      description: description || null,
      isActive: true,
      startDate: startDate || null,
      endDate: endDate || null,
    });

    // Add products with sort order
    const dealProducts = productIds.map((productId, index) => ({
      dealOfTheWeekId: deal.id,
      productId: productId,
      sortOrder: index,
    }));

    await DealOfTheWeekProduct.bulkCreate(dealProducts);

    // Fetch the created deal with products
    const createdDeal = await DealOfTheWeek.findByPk(deal.id, {
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
          order: [[DealOfTheWeekProduct, "sortOrder", "ASC"]],
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
      sortOrder: product.DealOfTheWeekProduct?.sortOrder || 0,
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
    console.error("Error creating Deal of the Week:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create Deal of the Week",
      error: error.message,
    });
  }
}

/**
 * Admin: Update Deal of the Week
 * Body: { title, description, isActive, startDate, endDate, productIds: [1, 2, 3] }
 */
async function updateDealOfTheWeek(req, res) {
  try {
    const { id } = req.params;
    const { title, description, isActive, startDate, endDate, productIds } = req.body;

    const deal = await DealOfTheWeek.findByPk(id);
    if (!deal) {
      return res.status(404).json({
        success: false,
        message: "Deal of the Week not found",
      });
    }

    // Update deal fields
    if (title !== undefined) deal.title = title;
    if (description !== undefined) deal.description = description;
    if (isActive !== undefined) deal.isActive = isActive;
    if (startDate !== undefined) deal.startDate = startDate;
    if (endDate !== undefined) deal.endDate = endDate;

    await deal.save();

    // Update products if provided
    if (Array.isArray(productIds)) {
      if (productIds.length === 0) {
        return res.status(400).json({
          success: false,
          message: "At least one product is required",
        });
      }

      // Verify all products exist
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

      // Remove existing associations
      await DealOfTheWeekProduct.destroy({
        where: {
          dealOfTheWeekId: deal.id,
        },
      });

      // Create new associations with sort order
      const dealProducts = productIds.map((productId, index) => ({
        dealOfTheWeekId: deal.id,
        productId: productId,
        sortOrder: index,
      }));

      await DealOfTheWeekProduct.bulkCreate(dealProducts);
    }

    // Fetch updated deal with products
    const updatedDeal = await DealOfTheWeek.findByPk(deal.id, {
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
          order: [[DealOfTheWeekProduct, "sortOrder", "ASC"]],
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
      sortOrder: product.DealOfTheWeekProduct?.sortOrder || 0,
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
    console.error("Error updating Deal of the Week:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update Deal of the Week",
      error: error.message,
    });
  }
}

/**
 * Admin: Delete Deal of the Week
 */
async function deleteDealOfTheWeek(req, res) {
  try {
    const { id } = req.params;
    const deal = await DealOfTheWeek.findByPk(id);

    if (!deal) {
      return res.status(404).json({
        success: false,
        message: "Deal of the Week not found",
      });
    }

    // Cascade delete will handle DealOfTheWeekProduct records
    await deal.destroy();

    res.status(200).json({
      success: true,
      message: "Deal of the Week deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting Deal of the Week:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete Deal of the Week",
      error: error.message,
    });
  }
}

module.exports = {
  getActiveDealOfTheWeek,
  getAllDealsOfTheWeek,
  getDealOfTheWeekById,
  createDealOfTheWeek,
  updateDealOfTheWeek,
  deleteDealOfTheWeek,
};
