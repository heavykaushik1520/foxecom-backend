const bcrypt = require("bcrypt");
const { Op } = require("sequelize");

const Admin = require('../models/admin');


async function createAdmin(req, res) {
  try {
    const { password, ...adminData } = req.body;
    
    // Enhanced validation
    if (!adminData.email) {
      return res.status(400).json({ success: false, message: 'Email is required.' });
    }
    if (!/^([a-zA-Z0-9_\.-]+)@([a-zA-Z0-9\.-]+)\.([a-zA-Z]{2,6})$/.test(adminData.email)) {
      return res.status(400).json({ success: false, message: 'Invalid email format.' });
    }
    if (!password) {
      return res.status(400).json({ success: false, message: 'Password is required.' });
    }
    if (password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters long.' });
    }
    if (adminData.phone_number && !/^\d{10}$/.test(adminData.phone_number)) {
      return res.status(400).json({ success: false, message: 'Phone number must be exactly 10 digits.' });
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    try {
      const newAdmin = await Admin.create({
        ...adminData,
        password: hashedPassword,
      });
      
      // Return admin without password
      const adminResponse = await Admin.findByPk(newAdmin.id, {
        attributes: { exclude: ['password'] }
      });
      
      res.status(201).json({ 
        success: true,
        message: 'Admin created successfully',
        admin: adminResponse 
      });
    } catch (error) {
      if (error.name === 'SequelizeUniqueConstraintError') {
        return res.status(409).json({ success: false, message: 'Email or phone number already exists.', error: error.message });
      }
      if (error.name === 'SequelizeValidationError') {
        return res.status(400).json({ success: false, message: 'Validation error', errors: error.errors.map(e => e.message) });
      }
      throw error;
    }
  } catch (error) {
    console.error('Error creating admin:', error);
    res.status(500).json({ success: false, message: 'Failed to create admin', error: error.message });
  }
}

// Get all admins
async function getAllAdmins(req, res) {
  try {
    const { page = 1, limit = 10, search } = req.query;
    const offset = (page - 1) * limit;
    
    const where = {};
    if (search) {
      where[Op.or] = [
        { email: { [Op.like]: `%${search}%` } },
        { phone_number: { [Op.like]: `%${search}%` } }
      ];
    }

    const { count, rows: admins } = await Admin.findAndCountAll({
      where,
      limit: parseInt(limit),
      offset: offset,
      order: [['createdAt', 'DESC']],
      attributes: { exclude: ['password'] } // Exclude password from response
    });

    res.status(200).json({
      success: true,
      pagination: {
        totalItems: count,
        totalPages: Math.ceil(count / limit),
        currentPage: parseInt(page),
        limit: parseInt(limit)
      },
      admins
    });
  } catch (error) {
    console.error('Error fetching all admins:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch admins', error: error.message });
  }
}

// Get a single admin by ID
async function getAdminById(req, res) {
  try {
    const { id } = req.params;
    const admin = await Admin.findByPk(id, {
      attributes: { exclude: ['password'] } // Exclude password from response
    });
    if (!admin) {
      return res.status(404).json({ success: false, message: 'Admin not found' });
    }
    res.status(200).json({ success: true, admin });
  } catch (error) {
    console.error(`Error fetching admin with ID ${req.params.id}:`, error);
    res.status(500).json({ success: false, message: 'Failed to fetch admin', error: error.message });
  }
}

// Update an existing admin by ID
async function updateAdmin(req, res) {
  try {
    const { id } = req.params;
    const { password, ...updateData } = req.body;
    
    // Check if admin exists
    const existingAdmin = await Admin.findByPk(id);
    if (!existingAdmin) {
      return res.status(404).json({ success: false, message: 'Admin not found' });
    }

    // Validate phone number if provided
    if (updateData.phone_number && !/^\d{10}$/.test(updateData.phone_number)) {
      return res.status(400).json({ success: false, message: 'Phone number must be exactly 10 digits.' });
    }
    
    // Validate email if provided
    if (updateData.email && !/^([a-zA-Z0-9_\.-]+)@([a-zA-Z0-9\.-]+)\.([a-zA-Z]{2,6})$/.test(updateData.email)) {
      return res.status(400).json({ success: false, message: 'Invalid email format.' });
    }

    // Handle password update separately
    if (password) {
      if (password.length < 6) {
        return res.status(400).json({ success: false, message: 'Password must be at least 6 characters long.' });
      }
      updateData.password = await bcrypt.hash(password, 10);
    }

    try {
      await existingAdmin.update(updateData);
      const updatedAdmin = await Admin.findByPk(id, {
        attributes: { exclude: ['password'] }
      });
      return res.status(200).json({ 
        success: true, 
        message: 'Admin updated successfully',
        admin: updatedAdmin 
      });
    } catch (error) {
      if (error.name === 'SequelizeUniqueConstraintError') {
        return res.status(409).json({ success: false, message: 'Email or phone number already exists.', error: error.message });
      }
      if (error.name === 'SequelizeValidationError') {
        return res.status(400).json({ success: false, message: 'Validation error', errors: error.errors.map(e => e.message) });
      }
      throw error;
    }
  } catch (error) {
    console.error(`Error updating admin with ID ${req.params.id}:`, error);
    res.status(500).json({ success: false, message: 'Failed to update admin', error: error.message });
  }
}

// Delete an admin by ID
async function deleteAdmin(req, res) {
  try {
    const { id } = req.params;
    
    // Check if admin exists
    const admin = await Admin.findByPk(id);
    if (!admin) {
      return res.status(404).json({ success: false, message: 'Admin not found' });
    }
    
    // Prevent self-deletion (optional safety check)
    // You can add logic here to check if admin is trying to delete themselves
    
    await admin.destroy();
    
    return res.status(200).json({ 
      success: true,
      message: 'Admin deleted successfully',
      deletedAdmin: {
        id: admin.id,
        email: admin.email
      }
    });
  } catch (error) {
    console.error(`Error deleting admin with ID ${req.params.id}:`, error);
    res.status(500).json({ success: false, message: 'Failed to delete admin', error: error.message });
  }
}

module.exports = {
  createAdmin,
  getAllAdmins,
  getAdminById,
  updateAdmin,
  deleteAdmin,
};