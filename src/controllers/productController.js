// src/controllers/productController.js
// const upload = require("../middleware/upload"); // Removed as middleware is now route-level
const { Op, Sequelize } = require("sequelize");

const { Product, ProductImage, Category, CaseDetails, MobileBrands, MobileModels } = require("../models"); // Import from index.js
const { sequelize } = require("../config/db");
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
            // Remove duplicate filenames to prevent duplicate image URLs
            const uniqueFiles = [];
            const seenFilenames = new Set();
            
            for (const file of galleryFiles) {
                if (!seenFilenames.has(file.filename)) {
                    seenFilenames.add(file.filename);
                    uniqueFiles.push(file);
                }
            }

            const imageRecords = uniqueFiles.map((file) => ({
                imageUrl: `/uploads/images/${file.filename}`,
                productId: newProduct.id,
            }));
            
            // Check for existing image URLs before inserting (extra safety)
            const imageUrls = imageRecords.map(record => record.imageUrl);
            const existingImages = await ProductImage.findAll({
                where: {
                    productId: newProduct.id,
                    imageUrl: imageUrls
                }
            });
            
            const existingUrls = new Set(existingImages.map(img => img.imageUrl));
            const newImageRecords = imageRecords.filter(record => !existingUrls.has(record.imageUrl));
            
            if (newImageRecords.length > 0) {
                try {
                    await ProductImage.bulkCreate(newImageRecords, {
                        ignoreDuplicates: true // Ignore duplicates if unique constraint exists
                    });
                } catch (error) {
                    // If unique constraint error, log but don't fail
                    if (error.name === 'SequelizeUniqueConstraintError') {
                        console.warn('Duplicate image URLs detected and skipped:', error.message);
                    } else {
                        throw error;
                    }
                }
            }
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
                // Remove duplicate filenames to prevent duplicate image URLs
                const uniqueFiles = [];
                const seenFilenames = new Set();
                
                for (const file of galleryFiles) {
                    if (!seenFilenames.has(file.filename)) {
                        seenFilenames.add(file.filename);
                        uniqueFiles.push(file);
                    }
                }

                const imageRecords = uniqueFiles.map((file) => ({
                    imageUrl: `/uploads/images/${file.filename}`,
                    productId: id,
                }));
                
                // Check for existing image URLs before inserting (prevent duplicates)
                const imageUrls = imageRecords.map(record => record.imageUrl);
                const existingImages = await ProductImage.findAll({
                    where: {
                        productId: id,
                        imageUrl: imageUrls
                    }
                });
                
                const existingUrls = new Set(existingImages.map(img => img.imageUrl));
                const newImageRecords = imageRecords.filter(record => !existingUrls.has(record.imageUrl));
                
            if (newImageRecords.length > 0) {
                try {
                    await ProductImage.bulkCreate(newImageRecords, {
                        ignoreDuplicates: true // Ignore duplicates if unique constraint exists
                    });
                } catch (error) {
                    // If unique constraint error, log but don't fail
                    if (error.name === 'SequelizeUniqueConstraintError') {
                        console.warn('Duplicate image URLs detected and skipped:', error.message);
                    } else {
                        throw error;
                    }
                }
            }
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

// Enhanced filtering and sorting function
async function filterAndSortProducts(req, res) {
    try {
        const {
            // Pagination
            page = 1,
            limit = 12,
            
            // Filtering
            categoryId,
            brandId,
            brandName,
            modelId,
            modelName,
            minPrice,
            maxPrice,
            inStock,
            color,
            material,
            caseType,
            search,
            
            // Sorting
            sortBy,
            sortOrder = 'DESC'
        } = req.query;

        // Default sortBy if not provided
        if (!sortBy) {
            sortBy = 'createdAt';
        }

        // Validate pagination
        const pageNum = Math.max(1, parseInt(page) || 1);
        const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 12));
        const offset = (pageNum - 1) * limitNum;

        // Build where clause for Product
        const productWhere = {};
        
        if (categoryId) {
            const categoryIdNum = parseInt(categoryId);
            if (isNaN(categoryIdNum)) {
                return res.status(400).json({ 
                    message: "Invalid categoryId. Must be a number.",
                    error: "INVALID_CATEGORY_ID"
                });
            }
            productWhere.categoryId = categoryIdNum;
        }

        // Price range filtering
        if (minPrice || maxPrice) {
            productWhere.price = {};
            if (minPrice) {
                const min = parseFloat(minPrice);
                if (isNaN(min) || min < 0) {
                    return res.status(400).json({ 
                        message: "Invalid minPrice. Must be a non-negative number.",
                        error: "INVALID_MIN_PRICE"
                    });
                }
                productWhere.price[Op.gte] = min;
            }
            if (maxPrice) {
                const max = parseFloat(maxPrice);
                if (isNaN(max) || max < 0) {
                    return res.status(400).json({ 
                        message: "Invalid maxPrice. Must be a non-negative number.",
                        error: "INVALID_MAX_PRICE"
                    });
                }
                productWhere.price[Op.lte] = max;
            }
            if (minPrice && maxPrice && parseFloat(minPrice) > parseFloat(maxPrice)) {
                return res.status(400).json({ 
                    message: "minPrice cannot be greater than maxPrice.",
                    error: "INVALID_PRICE_RANGE"
                });
            }
        }

        // Stock filtering
        if (inStock !== undefined) {
            if (inStock === 'true' || inStock === true || inStock === '1') {
                productWhere.stock = { [Op.gt]: 0 };
            } else if (inStock === 'false' || inStock === false || inStock === '0') {
                productWhere.stock = { [Op.lte]: 0 };
            } else {
                return res.status(400).json({ 
                    message: "Invalid inStock value. Must be 'true' or 'false'.",
                    error: "INVALID_STOCK_FILTER"
                });
            }
        }

        // Search by title
        if (search && search.trim()) {
            productWhere.title = {
                [Op.like]: `%${search.trim()}%`
            };
        }

        // Build include clause with nested filtering for CaseDetails
        const includeClause = [
            { 
                model: ProductImage, 
                as: "images",
                required: false
            },
            { 
                model: Category, 
                as: "category",
                required: false
            }
        ];

        // Build CaseDetails where clause for brand/model filtering
        const caseDetailsWhere = {};
        let hasCaseDetailsFilter = false;

        if (brandId) {
            const brandIdNum = parseInt(brandId);
            if (isNaN(brandIdNum)) {
                return res.status(400).json({ 
                    message: "Invalid brandId. Must be a number.",
                    error: "INVALID_BRAND_ID"
                });
            }
            caseDetailsWhere.brandId = brandIdNum;
            hasCaseDetailsFilter = true;
        }

        if (brandName && brandName.trim()) {
            // We'll filter by brand name through the include
            // Store brandName for later use in include
            hasCaseDetailsFilter = true;
        }

        if (modelId) {
            const modelIdNum = parseInt(modelId);
            if (isNaN(modelIdNum)) {
                return res.status(400).json({ 
                    message: "Invalid modelId. Must be a number.",
                    error: "INVALID_MODEL_ID"
                });
            }
            caseDetailsWhere.modelId = modelIdNum;
            hasCaseDetailsFilter = true;
        }

        if (modelName && modelName.trim()) {
            // We'll filter by model name through the include
            // Store modelName for later use in include
            hasCaseDetailsFilter = true;
        }

        if (color && color.trim()) {
            caseDetailsWhere.color = {
                [Op.like]: `%${color.trim()}%`
            };
            hasCaseDetailsFilter = true;
        }

        if (material && material.trim()) {
            caseDetailsWhere.material = {
                [Op.like]: `%${material.trim()}%`
            };
            hasCaseDetailsFilter = true;
        }

        if (caseType && caseType.trim()) {
            caseDetailsWhere.caseType = {
                [Op.like]: `%${caseType.trim()}%`
            };
            hasCaseDetailsFilter = true;
        }

        // Add CaseDetails include if there are filters
        // Note: Product model uses "details" as alias
        if (hasCaseDetailsFilter) {
            // For brand/model name filtering, we need to include the related models
            const caseDetailsInclude = {
                model: CaseDetails,
                as: "details", // Using the alias from Product model
                required: true, // INNER JOIN - only products with matching case details
                where: caseDetailsWhere,
                include: []
            };

            // Build brand include with name filtering if needed
            const brandInclude = {
                model: MobileBrands,
                as: "brand",
                required: !!(brandName || brandId)
            };
            if (brandName && brandName.trim()) {
                brandInclude.where = {
                    name: {
                        [Op.like]: `%${brandName.trim()}%`
                    }
                };
            }
            caseDetailsInclude.include.push(brandInclude);

            // Build model include with name filtering if needed
            const modelInclude = {
                model: MobileModels,
                as: "model",
                required: !!(modelName || modelId)
            };
            if (modelName && modelName.trim()) {
                modelInclude.where = {
                    name: {
                        [Op.like]: `%${modelName.trim()}%`
                    }
                };
            }
            caseDetailsInclude.include.push(modelInclude);

            includeClause.push(caseDetailsInclude);
        } else {
            // Include caseDetails but not required (LEFT JOIN)
            includeClause.push({
                model: CaseDetails,
                as: "details", // Using the alias from Product model
                required: false,
                include: [
                    {
                        model: MobileBrands,
                        as: "brand",
                        required: false
                    },
                    {
                        model: MobileModels,
                        as: "model",
                        required: false
                    }
                ]
            });
        }

        // Validate and build order clause
        // Map of sortBy values (case-insensitive) to actual database fields
        const sortFieldMap = {
            'price': 'price',
            'discountprice': 'discountPrice',
            'title': 'title',
            'createdat': 'createdAt',
            'updatedat': 'updatedAt',
            'stock': 'stock',
            'discount': 'discount' // Special case for calculated field
        };

        // Normalize sortBy to lowercase for case-insensitive lookup
        const normalizedSortBy = sortBy ? String(sortBy).trim().toLowerCase() : 'createdat';
        const mappedField = sortFieldMap[normalizedSortBy];
        
        if (!mappedField) {
            return res.status(400).json({ 
                message: `Invalid sortBy. Valid options: price, discountPrice, title, createdAt, updatedAt, stock, discount`,
                error: "INVALID_SORT_FIELD",
                validOptions: ['price', 'discountPrice', 'title', 'createdAt', 'updatedAt', 'stock', 'discount']
            });
        }

        // Build the actual sort field
        let sortField;
        if (mappedField === 'discount') {
            // Special handling for discount percentage calculation
            sortField = [Sequelize.literal('(price - COALESCE(discountPrice, price)) / price * 100')];
        } else {
            sortField = mappedField;
        }

        const orderDirection = ['ASC', 'DESC'].includes(String(sortOrder).toUpperCase()) 
            ? String(sortOrder).toUpperCase() 
            : 'DESC';

        // Build order clause
        let order;
        if (Array.isArray(sortField)) {
            // For calculated fields like discount
            order = [[sortField[0], orderDirection]];
        } else {
            order = [[sortField, orderDirection]];
        }

        // Execute query
        const { count, rows: products } = await Product.findAndCountAll({
            limit: limitNum,
            offset: offset,
            where: productWhere,
            include: includeClause,
            order: order,
            distinct: true, // Important for counting with joins
            subQuery: false // Better performance with complex joins
        });

        // Add category-specific details
        const productsWithDetails = await addCategorySpecificDetailsToProducts(products);

        // Calculate pagination metadata
        const totalPages = Math.ceil(count / limitNum);

        res.status(200).json({
            success: true,
            data: {
                products: productsWithDetails,
                pagination: {
                    totalItems: count,
                    totalPages: totalPages,
                    currentPage: pageNum,
                    itemsPerPage: limitNum,
                    hasNextPage: pageNum < totalPages,
                    hasPreviousPage: pageNum > 1
                },
                filters: {
                    categoryId: categoryId || null,
                    brandId: brandId || null,
                    brandName: brandName || null,
                    modelId: modelId || null,
                    modelName: modelName || null,
                    minPrice: minPrice || null,
                    maxPrice: maxPrice || null,
                    inStock: inStock || null,
                    color: color || null,
                    material: material || null,
                    caseType: caseType || null,
                    search: search || null
                },
                sorting: {
                    sortBy: sortBy,
                    sortOrder: orderDirection
                }
            }
        });

    } catch (error) {
        console.error("Error in filterAndSortProducts:", error);
        
        // Handle specific Sequelize errors
        if (error.name === 'SequelizeDatabaseError') {
            return res.status(400).json({ 
                message: "Invalid query parameters.",
                error: "DATABASE_ERROR",
                details: error.message
            });
        }

        if (error.name === 'SequelizeValidationError') {
            return res.status(400).json({ 
                message: "Validation error in query parameters.",
                error: "VALIDATION_ERROR",
                details: error.errors.map(e => e.message)
            });
        }

        res.status(500).json({ 
            message: "Failed to fetch filtered products",
            error: "INTERNAL_SERVER_ERROR",
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
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

// Get available filter options (for frontend dropdowns)
async function getFilterOptions(req, res) {
    try {
        const { categoryId } = req.query;

        const productWhere = {};
        if (categoryId) {
            const categoryIdNum = parseInt(categoryId);
            if (isNaN(categoryIdNum)) {
                return res.status(400).json({ 
                    message: "Invalid categoryId. Must be a number.",
                    error: "INVALID_CATEGORY_ID"
                });
            }
            productWhere.categoryId = categoryIdNum;
        }

        // Get all products with case details for this category
        const products = await Product.findAll({
            where: productWhere,
            include: [
                {
                    model: CaseDetails,
                    as: "details", // Using the alias from Product model
                    required: false,
                    include: [
                        {
                            model: MobileBrands,
                            as: "brand",
                            required: false
                        },
                        {
                            model: MobileModels,
                            as: "model",
                            required: false
                        }
                    ]
                }
            ]
        });

        // Extract unique values
        const brands = new Set();
        const models = new Set();
        const colors = new Set();
        const materials = new Set();
        const caseTypes = new Set();
        let minPrice = Infinity;
        let maxPrice = 0;

        products.forEach(product => {
            // Price range
            const price = parseFloat(product.price) || 0;
            if (price > 0) {
                minPrice = Math.min(minPrice, price);
                maxPrice = Math.max(maxPrice, price);
            }

            // Case details - using "details" alias
            if (product.details) {
                if (product.details.brand && product.details.brand.name) {
                    brands.add(product.details.brand.name);
                }
                if (product.details.model && product.details.model.name) {
                    models.add(product.details.model.name);
                }
                if (product.details.color) {
                    colors.add(product.details.color);
                }
                if (product.details.material) {
                    materials.add(product.details.material);
                }
                if (product.details.caseType) {
                    caseTypes.add(product.details.caseType);
                }
            }
        });

        res.status(200).json({
            success: true,
            data: {
                brands: Array.from(brands).sort(),
                models: Array.from(models).sort(),
                colors: Array.from(colors).sort(),
                materials: Array.from(materials).sort(),
                caseTypes: Array.from(caseTypes).sort(),
                priceRange: {
                    min: minPrice === Infinity ? 0 : minPrice,
                    max: maxPrice
                }
            }
        });

    } catch (error) {
        console.error("Error fetching filter options:", error);
        res.status(500).json({ 
            message: "Failed to fetch filter options",
            error: "INTERNAL_SERVER_ERROR",
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
}

// Admin: Get all products with advanced filters and pagination
async function getAllProductsForAdmin(req, res) {
    try {
        const { 
            page = 1, 
            limit = 20, 
            categoryId, 
            search,
            minPrice,
            maxPrice,
            inStock,
            sortBy = 'createdAt',
            sortOrder = 'DESC'
        } = req.query;
        
        const offset = (page - 1) * limit;
        const where = {};
        
        // Category filter
        if (categoryId) {
            where.categoryId = parseInt(categoryId);
        }
        
        // Search filter (by title or SKU)
        if (search) {
            where[Op.or] = [
                { title: { [Op.like]: `%${search}%` } },
                { sku: { [Op.like]: `%${search}%` } }
            ];
        }
        
        // Price range filter
        if (minPrice || maxPrice) {
            where.price = {};
            if (minPrice) {
                where.price[Op.gte] = parseFloat(minPrice);
            }
            if (maxPrice) {
                where.price[Op.lte] = parseFloat(maxPrice);
            }
        }
        
        // Stock filter
        if (inStock !== undefined) {
            if (inStock === 'true' || inStock === true) {
                where.stock = { [Op.gt]: 0 };
            } else {
                where[Op.or] = [
                    { stock: { [Op.lte]: 0 } },
                    { stock: null }
                ];
            }
        }
        
        // Sort options
        const validSortFields = ['title', 'price', 'discountPrice', 'stock', 'createdAt', 'updatedAt'];
        const sortField = validSortFields.includes(sortBy) ? sortBy : 'createdAt';
        const orderDirection = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
        
        const { count, rows: products } = await Product.findAndCountAll({
            where,
            limit: parseInt(limit),
            offset: offset,
            order: [[sortField, orderDirection]],
            include: [
                { model: ProductImage, as: "images", limit: 1 },
                { model: Category, as: "category" },
                { 
                    model: CaseDetails, 
                    as: "details",
                    include: [
                        { model: MobileBrands, as: "brand" },
                        { model: MobileModels, as: "model" }
                    ],
                    required: false
                }
            ],
        });
        
        // Add category-specific details
        const productsWithDetails = await addCategorySpecificDetailsToProducts(products);
        
        res.status(200).json({
            success: true,
            pagination: {
                totalItems: count,
                totalPages: Math.ceil(count / limit),
                currentPage: parseInt(page),
                limit: parseInt(limit)
            },
            products: productsWithDetails
        });
    } catch (error) {
        console.error("Error fetching products for admin:", error);
        res.status(500).json({ 
            success: false,
            message: "Failed to fetch products", 
            error: error.message 
        });
    }
}

module.exports = {
    createProduct,
    getAllProducts,
    getProductById,
    updateProduct,
    deleteProduct,
    searchProductsByName,
    filterAndSortProducts,
    getFilterOptions,
    getAllProductsForAdmin,
    // Legacy filter route - redirects to new function
    filterProducts: filterAndSortProducts,
};
