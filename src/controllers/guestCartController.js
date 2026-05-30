// src/controllers/guestCartController.js
const {
  Cart,
  CartItem,
  Product,
  ProductImage,
  Category,
  ProductAvailableModels,
} = require("../models");
const { addCategorySpecificDetailsToProducts } = require("../utils/categoryDetailsHelper");

function toValidGuestCartId(value) {
    const parsed = parseInt(value, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function generateGuestCartId() {
    return Math.floor(100000 + Math.random() * 900000);
}
// Get or Create Guest Cart
async function getGuestCart(req, res) {
    const { guestCartId } = req.params;
    const isPostRequest = req.method === 'POST';

    try {
        let cart;
        if (guestCartId) {
            const parsedGuestCartId = toValidGuestCartId(guestCartId);
            if (!parsedGuestCartId) {
                return res.status(400).json({ message: "Invalid guestCartId. It must be a positive number." });
            }

            cart = await fetchGuestCartWithProducts(parsedGuestCartId);
            if (!cart) {
                return res.status(404).json({ message: "Guest cart not found." });
            }
        } else if (isPostRequest) {
            // Accept only numeric guestCartId from client. If invalid/missing, generate a safe one.
            const requestedGuestId = toValidGuestCartId(req.body?.guestCartId);
            const newGuestId = requestedGuestId || generateGuestCartId();

            // If this ID already exists (e.g. repeated init call), return existing cart instead of 500.
            const existing = await fetchGuestCartWithProducts(newGuestId);
            if (existing) {
                return res.status(200).json({ guestCartId: existing.guestCartId, cart: existing });
            }

            cart = await Cart.create({ guestCartId: newGuestId });
            return res.status(201).json({ guestCartId: cart.guestCartId, cart: { ...cart.toJSON(), products: [] } });
        } else {
            return res.status(200).json({ message: "No guestCartId provided. Create a new cart or provide an ID.", products: [] });
        }

        res.status(200).json(cart);
    } catch (error) {
        console.error("Error handling guest cart:", error);

        if (error.name === "SequelizeUniqueConstraintError") {
            const recoveredGuestId = toValidGuestCartId(req.body?.guestCartId);
            if (recoveredGuestId) {
                const existing = await fetchGuestCartWithProducts(recoveredGuestId);
                if (existing) {
                    return res.status(200).json({ guestCartId: existing.guestCartId, cart: existing });
                }
            }
        }

        res.status(500).json({ message: "Failed to process guest cart.", error: error.message });
    }
}

// Update Guest Cart (Add/Update product quantity)
// Add to Guest Cart (Increment)
async function addToGuestCart(req, res) {
    try {
        const { guestCartId } = req.params;
        const { productId, quantity, selectedModelId } = req.body;

        // Improved validation with specific error messages
        if (!guestCartId) {
            return res.status(400).json({ 
                message: "Invalid request data. Guest Cart ID is required in the URL path.", 
                received: { guestCartId: req.params.guestCartId }
            });
        }

        if (!productId) {
            return res.status(400).json({ 
                message: "Invalid request data. Product ID is required in the request body.", 
                received: { productId: req.body.productId }
            });
        }

        const qtyToAdd = quantity && Number.isInteger(quantity) && quantity > 0 ? quantity : 1;
        
        // Convert productId to integer if it's a string
        const parsedProductId = parseInt(productId);
        if (isNaN(parsedProductId)) {
            return res.status(400).json({ message: "Invalid Product ID. Must be a valid number." });
        }

        let cart = await Cart.findOne({ where: { guestCartId: guestCartId } });
        if (!cart) {
             // Optionally auto-create if not found, but usually guestCartId comes from frontend state
            return res.status(404).json({ message: "Guest cart not found. Please create one first." });
        }

        const product = await Product.findByPk(parsedProductId, {
            include: [{ model: ProductAvailableModels, as: "availableModels" }],
        });
        if (!product) {
            return res.status(404).json({ message: "Product not found." });
        }

        const isMultiModel = product.availableModels?.length > 0;
        if (isMultiModel) {
            if (!selectedModelId) {
                return res.status(400).json({
                    message: "Please select a phone model for this product.",
                });
            }
            const validModel = product.availableModels.find(
                (m) => m.modelId === parseInt(selectedModelId, 10)
            );
            if (!validModel) {
                return res.status(400).json({
                    message: "Selected phone model is not available for this product.",
                });
            }
        }

        const cartItemWhere = isMultiModel
            ? {
                cartId: cart.id,
                productId: parsedProductId,
                selectedModelId: parseInt(selectedModelId, 10),
            }
            : { cartId: cart.id, productId: parsedProductId, selectedModelId: null };

        let cartItem = await CartItem.findOne({ where: cartItemWhere });

        if (cartItem) {
            cartItem.quantity += qtyToAdd;
            await cartItem.save();
        } else {
            await CartItem.create({
                cartId: cart.id,
                productId: parsedProductId,
                quantity: qtyToAdd,
                selectedModelId: isMultiModel ? parseInt(selectedModelId, 10) : null,
            });
        }

        const updatedCart = await fetchGuestCartWithProducts(guestCartId);
        res.status(200).json({ message: "Product added to guest cart.", cart: updatedCart });

    } catch (error) {
        console.error("Error adding to guest cart:", error);
        res.status(500).json({ message: "Failed to add to guest cart.", error: error.message });
    }
}

// Update Guest Cart Item (Set Quantity)
async function updateGuestCartItem(req, res) {
    try {
        const { guestCartId } = req.params;
        const { productId, quantity, selectedModelId } = req.body;

        if (!guestCartId || !productId) {
            return res.status(400).json({ message: "Invalid request data." });
        }
        
        // Convert productId to integer if it's a string
        const parsedProductId = parseInt(productId);
        if (isNaN(parsedProductId)) {
            return res.status(400).json({ message: "Invalid Product ID. Must be a valid number." });
        }

        if (!quantity || typeof quantity !== "number" || !Number.isInteger(quantity) || quantity < 1) {
             return res.status(400).json({ message: "Quantity must be a positive integer (>= 1)." });
        }

        let cart = await Cart.findOne({ where: { guestCartId: guestCartId } });
        if (!cart) {
            return res.status(404).json({ message: "Guest cart not found." });
        }

        const product = await Product.findByPk(parsedProductId, {
            include: [{ model: ProductAvailableModels, as: "availableModels" }],
        });
        if (!product) {
            return res.status(404).json({ message: "Product not found." });
        }

        const isMultiModel = product.availableModels?.length > 0;
        if (isMultiModel) {
            if (selectedModelId == null || selectedModelId === "") {
                return res.status(400).json({
                    message: "selectedModelId is required for this product.",
                });
            }
        }

        const cartItemWhere = isMultiModel
            ? {
                cartId: cart.id,
                productId: parsedProductId,
                selectedModelId: parseInt(selectedModelId, 10),
            }
            : { cartId: cart.id, productId: parsedProductId, selectedModelId: null };

        let cartItem = await CartItem.findOne({ where: cartItemWhere });

        if (cartItem) {
            cartItem.quantity = quantity;
            await cartItem.save();
        } else {
            return res.status(404).json({ message: "Product not found in cart." });
        }

        const updatedCart = await fetchGuestCartWithProducts(guestCartId);
        res.status(200).json({ message: "Guest cart updated successfully.", cart: updatedCart });

    } catch (error) {
        console.error("Error updating guest cart:", error);
        res.status(500).json({ message: "Failed to update guest cart.", error: error.message });
    }
}

async function fetchGuestCartWithProducts(guestCartId) {
    const cart = await Cart.findOne({
        where: { guestCartId: guestCartId },
        include: [
            {
                model: Product,
                as: "products",
                through: {
                    model: CartItem,
                    as: "cartItem",
                    attributes: ["quantity", "productId", "selectedModelId"],
                },
                include: [
                    {
                        model: ProductImage,
                        as: "images",
                        attributes: ["imageUrl"],
                        limit: 1
                    },
                    {
                        model: Category,
                        as: "category"
                    }
                ]
            },
        ],
    });
    
    // Add category-specific details to cart products
    if (cart && cart.products) {
        cart.products = await addCategorySpecificDetailsToProducts(cart.products);
    }
    
    return cart;
}

async function deleteGuestCartItem(req, res) {
    try {
        const { guestCartId, productId } = req.params;
        const selectedModelIdRaw = req.query.selectedModelId;

        if (!guestCartId || !productId) {
            return res.status(400).json({ message: "Invalid request data." });
        }

        const cart = await Cart.findOne({ where: { guestCartId: guestCartId } });
        if (!cart) {
            return res.status(404).json({ message: "Guest cart not found." });
        }

        const parsedProductId = parseInt(productId, 10);
        const product = await Product.findByPk(parsedProductId, {
            include: [{ model: ProductAvailableModels, as: "availableModels" }],
        });
        if (!product) {
            return res.status(404).json({ message: "Product not found." });
        }

        const isMultiModel = product.availableModels?.length > 0;
        if (isMultiModel) {
            if (selectedModelIdRaw == null || selectedModelIdRaw === "") {
                return res.status(400).json({
                    message: "Query parameter selectedModelId is required for this product.",
                });
            }
        }

        const destroyWhere = isMultiModel
            ? {
                cartId: cart.id,
                productId: parsedProductId,
                selectedModelId: parseInt(selectedModelIdRaw, 10),
            }
            : { cartId: cart.id, productId: parsedProductId, selectedModelId: null };

        const deletedRows = await CartItem.destroy({
            where: destroyWhere,
        });

        if (deletedRows > 0) {
            return res.status(204).send();
        } else {
            return res.status(404).json({ message: "Product not found in cart." });
        }
    } catch (error) {
        console.error("Error deleting item from guest cart:", error);
        res.status(500).json({ message: "Failed to delete item from guest cart.", error: error.message });
    }
}

async function mergeCartsOnLogin(req, res) {
    try {
        const userId = req.user.userId;
        const { guestCartId } = req.body;

        if (!guestCartId) {
            return res.status(400).json({ message: "Guest cart ID is required for merging." });
        }

        let userCart = await Cart.findOne({ where: { userId: userId } });
        if (!userCart) {
            userCart = await Cart.create({ userId: userId });
        }

        const guestCart = await Cart.findOne({ where: { guestCartId: guestCartId } });

        if (!guestCart) {
            return res.status(200).json({ message: "No guest cart found to merge.", cart: userCart });
        }

        const guestCartItems = await CartItem.findAll({ where: { cartId: guestCart.id } });
        for (const guestItem of guestCartItems) {
            const [existingUserCartItem, created] = await CartItem.findOrCreate({
                where: {
                    cartId: userCart.id,
                    productId: guestItem.productId,
                    selectedModelId: guestItem.selectedModelId ?? null,
                },
                defaults: {
                    quantity: guestItem.quantity,
                },
            });

            if (!created) {
                // Keep merge idempotent-safe: if the same guest cart is merged twice
                // (due to retry/race), do not double-add quantities.
                // Preserve whichever quantity is higher.
                existingUserCartItem.quantity = Math.max(
                    Number(existingUserCartItem.quantity) || 0,
                    Number(guestItem.quantity) || 0
                );
                await existingUserCartItem.save();
            }
        }

        await CartItem.destroy({ where: { cartId: guestCart.id } });
        await guestCart.destroy();

        const updatedUserCart = await Cart.findOne({
            where: { userId: userId },
            include: [
                {
                    model: Product,
                    as: "products",
                    through: {
                        model: CartItem,
                        as: "cartItem",
                        attributes: ["quantity", "productId", "selectedModelId"],
                    },
                    include: [
                        {
                            model: ProductImage,
                            as: "images", // Corrected alias: "images"
                            attributes: ["imageUrl"],
                            limit: 1
                        }
                    ]
                },
            ],
        });

        res.status(200).json({ message: "Carts merged successfully.", cart: updatedUserCart });

    } catch (error) {
        console.error("Error merging carts:", error);
        res.status(500).json({ message: "Failed to merge carts.", error: error.message });
    }
}

module.exports = {
    getGuestCart,
    addToGuestCart,
    updateGuestCartItem,
    deleteGuestCartItem,
    mergeCartsOnLogin
};
