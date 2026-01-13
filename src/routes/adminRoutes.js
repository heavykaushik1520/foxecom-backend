
const express = require('express');
const router = express.Router();
const {
  createAdmin,
  getAllAdmins,
  getAdminById,
  updateAdmin,
  deleteAdmin,
} = require('../controllers/adminController');

router.post('/admins', createAdmin);        // Create a new admin
router.get('/admins', getAllAdmins);         // Get all admins
router.get('/admins/:id', getAdminById);     // Get a specific admin by ID
router.put('/admins/:id', updateAdmin);      // Update an admin by ID
router.delete('/admins/:id', deleteAdmin);   // Delete an admin by ID

module.exports = router;