// src/controllers/productController.js
// const upload = require("../middleware/upload"); // Removed as middleware is now route-level
const { Op } = require("sequelize");

const { Product, ProductImage, Category, CaseDetails, MobileBrands, MobileModels } = require("../models"); // Import from index.js
const { Sequelize } = require("sequelize");
const { addCategorySpecificDetails, addCategorySpecificDetailsToProducts } = require("../utils/categoryDetailsHelper");

async function createProduct(req, res) {
    try {
        // Files are already handled by middleware
        const {
            categoryId,
            title,
            price,
            discountPrice,
            stock,
            description,
            sku
        } = req.body;

        // req.files is now an object: { thumbnailImage: [...], images: [...] }
        const thumbnailFile = req.files?.['thumbnailImage']?.[0];
        const galleryFiles = req.files?.['images'];

        // Enhanced validation
        if (!categoryId) {
            return res.status(400).json({ message: "Category ID is required." });
        }
        if (!title || typeof title !== "string" || !title.trim()) {
            return res.status(400).json({ message: "Product title is required." });
        }

        if (!price || isNaN(price) || parseFloat(price) < 0) {
            return res.status(400).json({ message: "Valid price is required and must be a non-negative number." });
        }

        // Thumbnail is required
        if (!thumbnailFile) {
            return res.status(400).json({ message: "Thumbnail image is required." });
        }

        // Check if category exists
        const category = await Category.findByPk(categoryId);
        if (!category) {
            return res.status(400).json({ message: "Invalid category ID. Category does not exist." });
        }

        // Check if product with same name already exists in this category
        const existingProduct = await Product.findOne({
            where: {
                title: title.trim(),
                categoryId: categoryId
            }
        });
        if (existingProduct) {
            return res.status(409).json({ message: "Product with this name already exists in this category." });
        }

        if (!galleryFiles || galleryFiles.length < 2 || galleryFiles.length > 11) {
            return res.status(400).json({ message: "Product must have between 2 and 10 gallery images." });
        }

        const productData = {
            title: title.trim(),
            categoryId: parseInt(categoryId),
            price: parseFloat(price),
            discountPrice: discountPrice ? parseFloat(discountPrice) : null,
            stock: stock ? parseInt(stock) : null,
            sku: sku || null,
            description: description || null,
            thumbnailImage: `/uploads/images/${thumbnailFile.filename}`
        };


        const newProduct = await Product.create(productData);

        if (galleryFiles && galleryFiles.length > 0) {
            const imageRecords = galleryFiles.map((file) => ({
                imageUrl: `/uploads/images/${file.filename}`,
                productId: newProduct.id,
            }));
            await ProductImage.bulkCreate(imageRecords);
        }

        const productWithImages = await Product.findByPk(newProduct.id, {
            include: [
                { model: ProductImage, as: "images" },
                { model: Category, as: "category" },
            ],
        });

        res.status(201).json({
            message: "Product created successfully",
            product: productWithImages
        });

    } catch (error) {
        console.error("Unexpected error in createProduct:", error);
        if (error.name === 'SequelizeUniqueConstraintError') {
            return res.status(409).json({ message: "Product with this name already exists in this category." });
        }
        if (error.name === 'SequelizeForeignKeyConstraintError') {
            return res.status(400).json({ message: "Invalid category ID. Category does not exist." });
        }
        res.status(500).json({ message: "Failed to create product", error: error.message });
    }
}

async function getProductById(req, res) {
    try {
        const { id } = req.params;
        
        // First fetch product with basic associations
        const product = await Product.findByPk(id, {
            include: [
                { model: ProductImage, as: "images" },
                { model: Category, as: "category" },
            ],
        });
        
        if (!product) {
            return res.status(404).json({ message: "Product not found" });
        }
        
        // Add category-specific details (e.g., CaseDetails for mobile cases)
        const productWithDetails = await addCategorySpecificDetails(product);
        
        res.status(200).json(productWithDetails);
    } catch (error) {
        console.error(`Error fetching product with ID ${req.params.id}:`, error);
        res.status(500).json({ message: "Failed to fetch product", error: error.message });
    }
}

// Update an existing product by ID (ADMIN ONLY)
async function updateProduct(req, res) {
    try {
        const { id } = req.params;

        const product = await Product.findByPk(id);
        if (!product) {
            return res.status(404).json({ message: "Product not found" });
        }
        const { imagesToDelete, categoryId, caption, ...productData } = req.body;

        const thumbnailFile = req.files?.['thumbnailImage']?.[0];
        const galleryFiles = req.files?.['images'];




        try {
            if (productData.price && productData.price < 0) {
                return res.status(400).json({ message: "Price cannot be negative." });
            }

            const updatePayload = { ...productData };
            if (categoryId) updatePayload.categoryId = categoryId;
            if (typeof caption === 'string') updatePayload.caption = caption;

            // Update thumbnail if provided
            if (thumbnailFile) {
                updatePayload.thumbnailImage = `/uploads/images/${thumbnailFile.filename}`;
            }

            const [updatedRows] = await Product.update(updatePayload, {
                where: { id: id },
            });

            const productExists = await Product.findByPk(id);
            if (!productExists) {
                return res.status(404).json({ message: "Product not found" });
            }

            // Enforce images between 2 and 5 after applying deletions/additions
            if (galleryFiles && galleryFiles.length > 0) {
                const imageRecords = galleryFiles.map((file) => ({
                    imageUrl: `/uploads/images/${file.filename}`,
                    productId: id,
                }));
                await ProductImage.bulkCreate(imageRecords);
            }
            if (Array.isArray(imagesToDelete) && imagesToDelete.length > 0) {
                await ProductImage.destroy({
                    where: {
                        id: imagesToDelete,
                        productId: id
                    },
                });
            }
            // Count final images and validate
            const finalImageCount = await ProductImage.count({ where: { productId: id } });
            if (finalImageCount < 2 || finalImageCount > 11) {
                return res.status(400).json({ message: "Product must have between 2 and 10 gallery images." });
            }
            const updatedProduct = await Product.findByPk(id, {
                include: [
                    { model: ProductImage, as: "images" },
                    { model: Category, as: "category" },
                ],
            });
            return res.status(200).json(updatedProduct);
        } catch (error) {
            console.error(`Error updating product with ID ${id}:`, error);
            res.status(500).json({ message: "Failed to update product", error: error.message });
        }
    } catch (error) {
        console.error("Unexpected error in updateProduct:", error);
        res.status(500).json({ message: "Unexpected error in updateProduct", error: error.message });
    }
}

// Delete a product by ID (ADMIN ONLY)
async function deleteProduct(req, res) {
    try {
        const { id } = req.params;

        // Check if product exists
        const product = await Product.findByPk(id, {
            include: [
                { model: ProductImage, as: "images" },
                { model: Category, as: "category" },
            ],
        });

        if (!product) {
            return res.status(404).json({ message: "Product not found" });
        }

        const deletedRows = await Product.destroy({
            where: { id: id },
        });

        if (deletedRows > 0) {
            return res.status(200).json({
                message: "Product deleted successfully",
                deletedProduct: {
                    id: product.id,
                    title: product.title,
                    category: product.category ? product.category.name : null
                }
            });
        } else {
            return res.status(404).json({ message: "Product not found" });
        }
    } catch (error) {
        console.error(`Error deleting product with ID ${req.params.id}:`, error);
        res.status(500).json({ message: "Failed to delete product", error: error.message });
    }
}

async function searchProductsByName(req, res) {
    try {
        const { name } = req.query;
        if (!name) {
            return res.status(400).json({ message: "Please provide a search term." });
        }
        const products = await Product.findAll({
            where: {
                title: {
                    [Op.like]: `%${name}%`
                }
            },
            include: [
                { model: ProductImage, as: "images" },
                { model: Category, as: "category" },
            ],
        });
        if (products.length === 0) {
            return res.status(404).json({ message: `No products found matching "${name}"` });
        }
        
        // Include category-specific details
        const productsWithDetails = await addCategorySpecificDetailsToProducts(products);
        
        res.status(200).json(productsWithDetails);
    } catch (error) {
        console.error("Error searching products by name:", error);
        res.status(500).json({ message: "Failed to search products", error: error.message });
    }
}

//pagination
async function getAllProducts(req, res) {
    try {
        const { page = 1, limit = 6, categoryId, priceOrder } = req.query;
        const offset = (page - 1) * limit;
        const where = {};
        if (categoryId) {
            where.categoryId = categoryId;
        }
        let order = [['createdAt', 'ASC']];
        if (priceOrder && ['asc', 'desc'].includes(String(priceOrder).toLowerCase())) {
            order = [['price', String(priceOrder).toUpperCase()]];
        }
        const { count, rows: products } = await Product.findAndCountAll({
            limit: parseInt(limit),
            offset: offset,
            where,
            order,
            include: [
                { model: ProductImage, as: "images" },
                { model: Category, as: "category" },
            ],
        });
        
        // Add category-specific details to all products
        const productsWithDetails = await addCategorySpecificDetailsToProducts(products);
        
        res.status(200).json({
            totalItems: count,
            totalPages: Math.ceil(count / limit),
            currentPage: parseInt(page),
            products: productsWithDetails,
        });
    } catch (error) {
        console.error("Error fetching all products with pagination:", error);
        res.status(500).json({ message: "Failed to fetch products with pagination", error: error.message });
    }
}

module.exports = {
    createProduct,
    getAllProducts,
    getProductById,
    updateProduct,
    deleteProduct,
    searchProductsByName,
    // filter uses same handler as getAllProducts; kept separate for explicit route
    filterProducts: async function (req, res) { return getAllProducts(req, res); },
};
