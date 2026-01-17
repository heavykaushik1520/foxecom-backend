// src/controllers/checkoutController.js

const { Cart, CartItem, Product, ProductImage, Order, OrderItem, Category } = require("../models");
const { addCategorySpecificDetailsToProducts } = require("../utils/categoryDetailsHelper");


// Get checkout summary (cart validation + total calculation)
async function getCheckoutSummary(req, res) {
  try {
    const userId = req.user.userId;

    // Get user's cart with products
    const cart = await Cart.findOne({
      where: { userId },
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

    if (!cart || !cart.products || cart.products.length === 0) {
      return res.status(400).json({
        message: "Cart is empty. Add products to proceed with checkout.",
        canProceed: false,
        cartItems: 0,
        totalAmount: 0
      });
    }

    // Validate products and calculate totals
    const unavailableProducts = [];
    let totalAmount = 0;
    let totalItems = 0;

    for (const product of cart.products) {
      if (!product) {
        unavailableProducts.push({
          id: product.cartItem?.productId,
          name: "Product not found"
        });
      } else {
        const quantity = product.cartItem.quantity;
        const price = parseFloat(product.price);
        totalAmount += price * quantity;
        totalItems += quantity;
      }
    }

    if (unavailableProducts.length > 0) {
      return res.status(400).json({
        message: "Some products in your cart are no longer available.",
        canProceed: false,
        unavailableProducts,
        cartItems: cart.products.length
      });
    }

    // Calculate shipping (you can add shipping logic here)
    const shippingCost = totalAmount > 1000 ? 0 : 50; // Free shipping above ₹1000
    const finalTotal = totalAmount + shippingCost;

    res.status(200).json({
      message: "Checkout summary generated successfully.",
      canProceed: true,
      summary: {
        cartItems: cart.products.length,
        totalItems,
        subtotal: totalAmount.toFixed(2),
        shipping: shippingCost.toFixed(2),
        totalAmount: finalTotal.toFixed(2),
        products: cart.products.map(product => ({
          id: product.id,
          title: product.title,
          price: product.price,
          quantity: product.cartItem.quantity,
          image: product.images?.[0]?.imageUrl || product.thumbnailImage || null,
          total: (parseFloat(product.price) * product.cartItem.quantity).toFixed(2)
        }))
      }
    });

  } catch (error) {
    console.error("Error getting checkout summary:", error);
    res.status(500).json({
      message: "Failed to get checkout summary.",
      error: error.message
    });
  }
}

// Validate shipping address
async function validateShippingAddress(req, res) {
  try {
    const {
      firstName,
      lastName,
      mobileNumber,
      emailAddress,
      fullAddress,
      townOrCity,
      country,
      state,
      pinCode,
    } = req.body;

    // Comprehensive validation
    const validationErrors = [];

    if (!firstName || typeof firstName !== "string" || !firstName.trim()) {
      validationErrors.push("First Name is required and must be a non-empty string.");
    }
    if (!lastName || typeof lastName !== "string" || !lastName.trim()) {
      validationErrors.push("Last Name is required and must be a non-empty string.");
    }
    if (!mobileNumber || !/^\d{10}$/.test(String(mobileNumber))) {
      validationErrors.push("Mobile Number is required and must be exactly 10 digits.");
    }
    if (!emailAddress || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailAddress)) {
      validationErrors.push("Valid Email Address is required.");
    }
    if (!fullAddress || typeof fullAddress !== "string" || !fullAddress.trim()) {
      validationErrors.push("Full Address is required and must be a non-empty string.");
    }
    if (!townOrCity || typeof townOrCity !== "string" || !townOrCity.trim()) {
      validationErrors.push("Town or City is required and must be a non-empty string.");
    }
    if (!country || typeof country !== "string" || !country.trim()) {
      validationErrors.push("Country is required and must be a non-empty string.");
    }
    if (!state || typeof state !== "string" || !state.trim()) {
      validationErrors.push("State is required and must be a non-empty string.");
    }
    if (!pinCode || !/^\d{6}$/.test(String(pinCode))) {
      validationErrors.push("Pin Code is required and must be exactly 6 digits.");
    }

    if (validationErrors.length > 0) {
      return res.status(400).json({
        message: "Address validation failed.",
        errors: validationErrors,
        isValid: false
      });
    }

    // Additional validation for Indian addresses
    if (country.toLowerCase() === 'india') {
      const commonUtils = require("./commonUtils");
      const validatePinCode = commonUtils.isValidIndianPincode(pinCode);
      if (!validatePinCode) {
        return res.status(400).json({
          message: "Invalid Indian pin code format.",
          isValid: false
        });
      }

      const isRealPinCode = commonUtils.isRealPincode(pinCode);
      if (!isRealPinCode) {
        return res.status(400).json({
          message: "Pin code does not exist in India.",
          isValid: false
        });
      }
    }

    res.status(200).json({
      message: "Shipping address is valid.",
      isValid: true,
      address: {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        mobileNumber: parseInt(mobileNumber),
        emailAddress: emailAddress.trim(),
        fullAddress: fullAddress.trim(),
        townOrCity: townOrCity.trim(),
        country: country.trim(),
        state: state.trim(),
        pinCode: parseInt(pinCode)
      }
    });

  } catch (error) {
    console.error("Error validating shipping address:", error);
    res.status(500).json({
      message: "Failed to validate shipping address.",
      error: error.message
    });
  }
}

// Get available payment methods
async function getPaymentMethods(req, res) {
  try {
    // You can make this dynamic based on order amount, user location, etc.
    const paymentMethods = [
      {
        id: "razorpay",
        name: "Credit/Debit Card",
        description: "Pay with Visa, Mastercard, RuPay",
        icon: "credit-card",
        enabled: true
      },
      {
        id: "razorpay_upi",
        name: "UPI",
        description: "Pay with UPI apps like GPay, PhonePe, Paytm",
        icon: "upi",
        enabled: true
      },
      {
        id: "razorpay_wallet",
        name: "Digital Wallet",
        description: "Pay with Paytm, Mobikwik, Freecharge",
        icon: "wallet",
        enabled: true
      },
      {
        id: "razorpay_netbanking",
        name: "Net Banking",
        description: "Pay with your bank account",
        icon: "bank",
        enabled: true
      }
    ];

    res.status(200).json({
      message: "Payment methods retrieved successfully.",
      paymentMethods
    });

  } catch (error) {
    console.error("Error getting payment methods:", error);
    res.status(500).json({
      message: "Failed to get payment methods.",
      error: error.message
    });
  }
}

module.exports = {
  getCheckoutSummary,
  validateShippingAddress,
  getPaymentMethods
};
