// src/controllers/cartController.js

const { Cart, CartItem, Product, ProductImage, Category } = require("../models");
const { addCategorySpecificDetailsToProducts } = require("../utils/categoryDetailsHelper");

// Helper function to fetch cart with products
async function getCartWithProducts(userId) {
  const cart = await Cart.findOne({
    where: { userId: userId },
    include: [
      {
        model: Product,
        as: "products",
        through: {
          model: CartItem,
          as: "cartItem",
          attributes: ["quantity", "productId"],
        },
        include: [ 
          {
            model: ProductImage,
            as: "images",
            attributes: ["imageUrl"],
            limit: 1, 
          },
          {
            model: Category,
            as: "category"
          }
        ],
      },
    ],
  });
  
  // Add category-specific details to cart products
  if (cart && cart.products) {
    cart.products = await addCategorySpecificDetailsToProducts(cart.products);
  }
  
  return cart;
}

// Get the cart for the logged-in user
async function getMyCart(req, res) {
  try {
    let cart = await getCartWithProducts(req.user.userId);
    
    if (!cart) {
      await Cart.create({ userId: req.user.userId });
      cart = await getCartWithProducts(req.user.userId);
    }

    res.status(200).json(cart);
  } catch (error) {
    console.error("Error fetching user cart:", error);
    res
      .status(500)
      .json({ message: "Failed to fetch cart.", error: error.message });
  }
}


// Add a product to the user's cart (Increment quantity if exists)
async function addToCart(req, res) {
  try {
    const { productId, quantity } = req.body;
    
    // Default quantity to 1 if not provided
    const qtyToAdd = quantity && Number.isInteger(quantity) && quantity > 0 ? quantity : 1;

    if (!productId) {
      return res.status(400).json({ message: "Invalid or missing productId." });
    }

    let cart = await Cart.findOne({ where: { userId: req.user.userId } });
    if (!cart) {
      cart = await Cart.create({ userId: req.user.userId });
    }

    const product = await Product.findByPk(productId);
    if (!product) {
      return res.status(404).json({ message: "Product not found." });
    }

    let cartItem = await CartItem.findOne({ where: { cartId: cart.id, productId: productId } });

    if (cartItem) {
      // Increment quantity
      cartItem.quantity += qtyToAdd;
      await cartItem.save();
      
      const updatedCart = await getCartWithProducts(req.user.userId);
      return res.status(200).json({ message: "Product quantity updated in cart.", cart: updatedCart });
    } else {
      // Create new item
      await CartItem.create({ cartId: cart.id, productId: productId, quantity: qtyToAdd });
      
      const updatedCart = await getCartWithProducts(req.user.userId);
      return res.status(201).json({ message: "Product added to cart successfully.", cart: updatedCart });
    }
  } catch (error) {
    console.error("Error adding to user cart:", error);
    res.status(500).json({ message: "Failed to add product to cart.", error: error.message });
  }
}

// Update specific product quantity in the user's cart (Set exact quantity)
async function updateCartItem(req, res) {
  try {
    const { productId, quantity } = req.body;
    
    if (!productId) {
      return res.status(400).json({ message: "Invalid or missing productId." });
    }
    
    if (!quantity || typeof quantity !== "number" || !Number.isInteger(quantity) || quantity < 1) {
      return res.status(400).json({ message: "Quantity must be a positive integer (>= 1)." });
    }

    const cart = await Cart.findOne({ where: { userId: req.user.userId } });
    if (!cart) {
      return res.status(404).json({ message: "Cart not found for this user." });
    }

    const cartItem = await CartItem.findOne({ where: { cartId: cart.id, productId: productId } });

    if (!cartItem) {
        return res.status(404).json({ message: "Product not found in cart." });
    }

    // Set exact quantity
    cartItem.quantity = quantity;
    await cartItem.save();

    const updatedCart = await getCartWithProducts(req.user.userId);
    return res.status(200).json({ message: "Cart item updated successfully.", cart: updatedCart });

  } catch (error) {
    console.error("Error updating cart item:", error);
    res.status(500).json({ message: "Failed to update cart item.", error: error.message });
  }
}

// Delete a product from the user's cart
async function deleteCartItem(req, res) {
  try {
    const { productId } = req.params;
    if (!productId) {
      return res.status(400).json({ message: "Invalid or missing productId." });
    }
    const cart = await Cart.findOne({ where: { userId: req.user.userId } });
    if (!cart) {
      return res.status(404).json({ message: "Cart not found for this user." });
    }
    const deletedRows = await CartItem.destroy({ where: { cartId: cart.id, productId: productId } });
    if (deletedRows > 0) {
      return res.status(204).send();
    } else {
      return res.status(404).json({ message: "Product not found in cart." });
    }
  } catch (error) {
    console.error("Error deleting item from cart:", error);
    res.status(500).json({ message: "Failed to delete item from cart.", error: error.message });
  }
}

async function clearMyCart(req, res) {
  try {
    const cart = await Cart.findOne({ where: { userId: req.user.userId } });
    if (!cart) {
      return res.status(404).json({ message: "Cart not found for this user." });
    }
    await CartItem.destroy({ where: { cartId: cart.id } });
    res.status(204).send();
  } catch (error) {
    console.error("Error clearing user cart:", error);
    res.status(500).json({ message: "Failed to clear cart.", error: error.message });
  }
}

// Validate cart for checkout
async function validateCartForCheckout(req, res) {
  try {
    const cart = await getCartWithProducts(req.user.userId);
    
    if (!cart || !cart.products || cart.products.length === 0) {
      return res.status(400).json({ 
        message: "Cart is empty. Add products to proceed with checkout.",
        canProceedToCheckout: false,
        cartItems: 0
      });
    }

    // Check if all products are still available
    const unavailableProducts = [];
    let totalAmount = 0;

    // Get all cartItems to check for deleted products
    const cartItems = await CartItem.findAll({ 
      where: { cartId: cart.id },
      attributes: ['productId']
    });
    const existingProductIds = cart.products
      .filter(p => p !== null)
      .map(p => p.id);
    const deletedProductIds = cartItems
      .map(item => item.productId)
      .filter(id => !existingProductIds.includes(id));
    
    deletedProductIds.forEach(productId => {
      unavailableProducts.push({ id: productId, name: "Product not found" });
    });

    // Calculate total for available products
    for (const product of cart.products) {
      if (product && product.cartItem) {
        totalAmount += parseFloat(product.price) * product.cartItem.quantity;
      }
    }

    if (unavailableProducts.length > 0) {
      return res.status(400).json({
        message: "Some products in your cart are no longer available.",
        canProceedToCheckout: false,
        unavailableProducts,
        cartItems: cart.products.length
      });
    }

    res.status(200).json({
      message: "Cart is valid for checkout.",
      canProceedToCheckout: true,
      cartItems: cart.products.length,
      totalAmount: totalAmount.toFixed(2),
      cart: cart
    });
  } catch (error) {
    console.error("Error validating cart for checkout:", error);
    res.status(500).json({ message: "Failed to validate cart for checkout.", error: error.message });
  }
}

module.exports = {
  getMyCart,
  addToCart,
  updateCartItem,
  deleteCartItem,
  clearMyCart,
  validateCartForCheckout,
};



