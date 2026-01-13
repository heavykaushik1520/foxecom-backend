// src/routes/userRoutes.js

const express = require('express');
const router = express.Router();
const { isAdmin } = require('../middleware/authMiddleware');
const { isUser } = require('../middleware/userAuthMiddleware');
const {
  getAllUsers,
  getUserByMe,
  updateUserMe,
  deleteUserMe,
  getUserById,
  updateUser,
  deleteUser
} = require('../controllers/userController');

// Admin-only route (Read All Users)
router.get('/users', isAdmin, getAllUsers);
router.get('/users/:id', isAdmin, getUserById);
router.put('/users/:id', isAdmin, updateUser);
router.delete('/users/:id', isAdmin, deleteUser);

// User-specific routes (require user authentication)
router.get('/me', isUser, getUserByMe);
router.put('/me', isUser, updateUserMe);
router.delete('/me', isUser, deleteUserMe);

module.exports = router;