// src/routes/cartRoutes.js

const express = require('express');
const router = express.Router();
const { isUser } = require('../middleware/userAuthMiddleware');
const {
  getMyCart,
  addToCart,
  updateCartItem,
  deleteCartItem,
  clearMyCart,
  validateCartForCheckout,
} = require('../controllers/cartController');

const { 
  getGuestCart, 
  addToGuestCart, 
  updateGuestCartItem,
  mergeCartsOnLogin,
  deleteGuestCartItem,
} = require('../controllers/guestCartController');

// Routes for the logged-in user's cart
router.get('/cart', isUser, getMyCart);        
router.post('/cart/add', isUser, addToCart);       // Add item (increment)
router.put('/cart/update', isUser, updateCartItem); // Update item (set quantity)
router.delete('/cart/:productId', isUser, deleteCartItem); 
router.delete('/cart', isUser, clearMyCart);
router.get('/cart/validate-checkout', isUser, validateCartForCheckout);    

router.get('/guest-cart', getGuestCart);
router.post('/guest-cart', getGuestCart); // Creates a new guest cart
router.get('/guest-cart/:guestCartId', getGuestCart); 
router.post('/guest-cart/:guestCartId/add', addToGuestCart); // Add item (increment)
router.put('/guest-cart/:guestCartId/update', updateGuestCartItem); // Update item (set quantity)
router.delete('/guest-cart/:guestCartId/item/:productId', deleteGuestCartItem);

router.post('/merge-carts', isUser, mergeCartsOnLogin);

module.exports = router;