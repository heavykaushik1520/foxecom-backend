// src/controllers/productController.js
const upload = require("../middleware/upload"); 
const { Product, ProductImage, Category } = require("../models"); // Import from index.js
const { Sequelize } = require("sequelize");

async function createProduct(req, res) {
    try {
        upload(req, res, async (err) => {
            if (err) {
                console.error("Multer Error:", err);
                return res.status(400).json({ message: "File upload error", error: err.message || err });
            }
            try {
                const { categoryId, caption, name, price, description, description1, weight, netQuantity, extraDescrption } = req.body;
                const files = req.files;
                
                // Enhanced validation
                if (!categoryId) {
                    return res.status(400).json({ message: "Category ID is required." });
                }
                if (!name || typeof name !== "string" || !name.trim()) {
                    return res.status(400).json({ message: "Product name is required and must be a non-empty string." });
                }
                if (!caption || typeof caption !== "string" || !caption.trim()) {
                    return res.status(400).json({ message: "Product caption is required and must be a non-empty string." });
                }
                if (!price || isNaN(price) || parseFloat(price) < 0) {
                    return res.status(400).json({ message: "Valid price is required and must be a non-negative number." });
                }
                
                // Check if category exists
                const category = await Category.findByPk(categoryId);
                if (!category) {
                    return res.status(400).json({ message: "Invalid category ID. Category does not exist." });
                }
                
                // Check if product with same name already exists in this category
                const existingProduct = await Product.findOne({ 
                    where: { 
                        name: name.trim(),
                        categoryId: categoryId 
                    } 
                });
                if (existingProduct) {
                    return res.status(409).json({ message: "Product with this name already exists in this category." });
                }
                
                if (!files || files.length < 2 || files.length > 5) {
                    return res.status(400).json({ message: "Product must have between 2 and 5 images." });
                }
                
                const productData = {
                    name: name.trim(),
                    caption: caption.trim(),
                    categoryId: parseInt(categoryId),
                    price: parseFloat(price),
                    description: description || null,
                    description1: description1 || null,
                    weight: weight ? parseFloat(weight) : null,
                    netQuantity: netQuantity ? parseInt(netQuantity) : null,
                    extraDescrption: extraDescrption || null
                };
                
                const newProduct = await Product.create(productData);
                
                if (files && files.length > 0) {
                    const imageRecords = files.map((file) => ({
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
                console.error("Error creating product:", error);
                if (error.name === 'SequelizeUniqueConstraintError') {
                    return res.status(409).json({ message: "Product with this name already exists in this category." });
                }
                if (error.name === 'SequelizeForeignKeyConstraintError') {
                    return res.status(400).json({ message: "Invalid category ID. Category does not exist." });
                }
                res.status(500).json({ message: "Failed to create product", error: error.message });
            }
        });
    } catch (error) {
        console.error("Unexpected error in createProduct:", error);
        res.status(500).json({ message: "Unexpected error in createProduct", error: error.message });
    }
}

async function getProductById(req, res) {
    try {
        const { id } = req.params;
        const product = await Product.findByPk(id, {
            include: [
                { model: ProductImage, as: "images" },
                { model: Category, as: "category" },
            ],
        });
        if (!product) {
            return res.status(404).json({ message: "Product not found" });
        }
        res.status(200).json(product);
    } catch (error) {
        console.error(`Error fetching product with ID ${req.params.id}:`, error);
        res.status(500).json({ message: "Failed to fetch product", error: error.message });
    }
}

// Update an existing product by ID (ADMIN ONLY)


async function updateProduct(req, res) {
    try {
        upload(req, res, async (err) => {
            if (err) {
                console.error("Multer Error:", err);
                return res.status(400).json({ message: "File upload error", error: err.message || err });
            }
            const { id } = req.params;
            const { imagesToDelete, categoryId, caption,  ...productData } = req.body;
            const files = req.files;
            try {
                if (productData.price && productData.price < 0) {
                    return res.status(400).json({ message: "Price cannot be negative." });
                }
                const updatePayload = { ...productData };
                if (categoryId) updatePayload.categoryId = categoryId;
                if (typeof caption === 'string') updatePayload.caption = caption;
                const [updatedRows] = await Product.update(updatePayload, {
                    where: { id: id },
                });
                if (updatedRows === 0) {
                    return res.status(404).json({ message: "Product not found" });
                }
                // Enforce images between 2 and 5 after applying deletions/additions
                if (files && files.length > 0) {
                    const imageRecords = files.map((file) => ({
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
                if (finalImageCount < 2 || finalImageCount > 5) {
                    return res.status(400).json({ message: "Product must have between 2 and 5 images." });
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
        });
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
        
        // Check if product is in any active orders (optional business logic)
        // You can add this check if needed
        
        const deletedRows = await Product.destroy({
            where: { id: id },
        });
        
        if (deletedRows > 0) {
            return res.status(200).json({ 
                message: "Product deleted successfully",
                deletedProduct: {
                    id: product.id,
                    name: product.name,
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
            where: Sequelize.literal(
                `LOWER(products.name) LIKE '%${name.toLowerCase()}%'`
            ),
            include: [
                { model: ProductImage, as: "images" },
                { model: Category, as: "category" },
            ],
        });
        if (products.length === 0) {
            return res.status(404).json({ message: `No products found matching "${name}"` });
        }
        res.status(200).json(products);
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
        let order = [['createdAt', 'DESC']];
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
        res.status(200).json({
            totalItems: count,
            totalPages: Math.ceil(count / limit),
            currentPage: parseInt(page),
            products: products,
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
  filterProducts: async function(req, res) { return getAllProducts(req, res); },
};
