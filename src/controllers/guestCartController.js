// src/controllers/guestCartController.js
const { Cart, CartItem, Product, ProductImage } = require("../models");
const { Op } = require("sequelize");
// Get or Create Guest Cart
async function getGuestCart(req, res) {
    const { guestCartId } = req.params;
    const isPostRequest = req.method === 'POST';

    try {
        let cart;
        if (guestCartId) {
            cart = await Cart.findOne({
                where: { guestCartId: guestCartId },
                include: [
                    {
                        model: Product,
                        as: "products",
                        through: {
                            model: CartItem,
                            as: "cartItem",
                            attributes: ["quantity"],
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
            if (!cart) {
                return res.status(404).json({ message: "Guest cart not found." });
            }
        } else if (isPostRequest) {
            // Generate a simple numeric ID for guest cart if not provided
            const newGuestId = req.body.guestCartId || Math.floor(100000 + Math.random() * 900000); // Simple 6 digit random
            cart = await Cart.create({ guestCartId: newGuestId });
            return res.status(201).json({ guestCartId: cart.guestCartId, cart: { ...cart.toJSON(), products: [] } });
        } else {
            return res.status(200).json({ message: "No guestCartId provided. Create a new cart or provide an ID.", products: [] });
        }

        res.status(200).json(cart);
    } catch (error) {
        console.error("Error handling guest cart:", error);
        res.status(500).json({ message: "Failed to process guest cart.", error: error.message });
    }
}

// Update Guest Cart (Add/Update product quantity)
// Add to Guest Cart (Increment)
async function addToGuestCart(req, res) {
    try {
        const { guestCartId } = req.params;
        const { productId, quantity } = req.body;

        const qtyToAdd = quantity && Number.isInteger(quantity) && quantity > 0 ? quantity : 1;

        if (!guestCartId || !productId || typeof productId !== "string") {
            return res.status(400).json({ message: "Invalid request data. Guest Cart ID and Product ID are required." });
        }

        let cart = await Cart.findOne({ where: { guestCartId: guestCartId } });
        if (!cart) {
             // Optionally auto-create if not found, but usually guestCartId comes from frontend state
            return res.status(404).json({ message: "Guest cart not found. Please create one first." });
        }

        const product = await Product.findByPk(productId);
        if (!product) {
            return res.status(404).json({ message: "Product not found." });
        }

        let cartItem = await CartItem.findOne({ where: { cartId: cart.id, productId: productId } });

        if (cartItem) {
            cartItem.quantity += qtyToAdd;
            await cartItem.save();
        } else {
            await CartItem.create({ cartId: cart.id, productId: productId, quantity: qtyToAdd });
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
        const { productId, quantity } = req.body;

        if (!guestCartId || !productId || typeof productId !== "string") {
            return res.status(400).json({ message: "Invalid request data." });
        }

        if (!quantity || typeof quantity !== "number" || !Number.isInteger(quantity) || quantity < 1) {
             return res.status(400).json({ message: "Quantity must be a positive integer (>= 1)." });
        }

        let cart = await Cart.findOne({ where: { guestCartId: guestCartId } });
        if (!cart) {
            return res.status(404).json({ message: "Guest cart not found." });
        }

        let cartItem = await CartItem.findOne({ where: { cartId: cart.id, productId: productId } });

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
    return await Cart.findOne({
        where: { guestCartId: guestCartId },
        include: [
            {
                model: Product,
                as: "products",
                through: {
                    model: CartItem,
                    as: "cartItem",
                    attributes: ["quantity"],
                },
                include: [
                    {
                        model: ProductImage,
                        as: "images",
                        attributes: ["imageUrl"],
                        limit: 1
                    }
                ]
            },
        ],
    });
}

async function deleteGuestCartItem(req, res) {
    try {
        const { guestCartId, productId } = req.params;

        if (!guestCartId || !productId) {
            return res.status(400).json({ message: "Invalid request data." });
        }
        
        // Find the guest cart
        const cart = await Cart.findOne({ where: { guestCartId: guestCartId } });
        if (!cart) {
            return res.status(404).json({ message: "Guest cart not found." });
        }

        // Destroy the cart item
        const deletedRows = await CartItem.destroy({
            where: { cartId: cart.id, productId: productId },
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
                    productId: guestItem.productId
                },
                defaults: {
                    quantity: guestItem.quantity
                }
            });

            if (!created) {
                // If item already existed, update its quantity
                existingUserCartItem.quantity += guestItem.quantity;
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
                        attributes: ["quantity"],
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
