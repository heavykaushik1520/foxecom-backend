const bcrypt = require("bcrypt");

const Admin = require('../models/admin');


async function createAdmin(req, res) {
  try {
    const { password, ...adminData } = req.body;
    if (!adminData.email) {
      return res.status(400).json({ message: 'Email is required.' });
    }
    if (!password) {
      return res.status(400).json({ message: 'Password is required.' });
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    try {
      const newAdmin = await Admin.create({
        ...adminData,
        password: hashedPassword,
      });
      res.status(201).json(newAdmin);
    } catch (error) {
      if (error.name === 'SequelizeUniqueConstraintError') {
        return res.status(409).json({ message: 'Email or phone number already exists.', error: error.message });
      }
      if (error.name === 'SequelizeValidationError') {
        return res.status(400).json({ message: 'Validation error', error: error.errors.map(e => e.message) });
      }
      throw error;
    }
  } catch (error) {
    console.error('Error creating admin:', error);
    res.status(500).json({ message: 'Failed to create admin', error: error.message });
  }
}

// Get all admins
async function getAllAdmins(req, res) {
  try {
    const admins = await Admin.findAll();
    res.status(200).json(admins);
  } catch (error) {
    console.error('Error fetching all admins:', error);
    res.status(500).json({ message: 'Failed to fetch admins', error: error.message });
  }
}

// Get a single admin by ID
async function getAdminById(req, res) {
  try {
    const { id } = req.params;
    const admin = await Admin.findByPk(id);
    if (!admin) {
      return res.status(404).json({ message: 'Admin not found' });
    }
    res.status(200).json(admin);
  } catch (error) {
    console.error(`Error fetching admin with ID ${req.params.id}:`, error);
    res.status(500).json({ message: 'Failed to fetch admin', error: error.message });
  }
}

// Update an existing admin by ID
async function updateAdmin(req, res) {
  try {
    const { id } = req.params;
    const updateData = { ...req.body };
    if (updateData.phone_number && !/^\d{10}$/.test(updateData.phone_number)) {
      return res.status(400).json({ message: 'Phone number must be exactly 10 digits.' });
    }
    if (updateData.email && !/^([a-zA-Z0-9_\.-]+)@([a-zA-Z0-9\.-]+)\.([a-zA-Z]{2,6})$/.test(updateData.email)) {
      return res.status(400).json({ message: 'Invalid email format.' });
    }
    try {
      const [updatedRows] = await Admin.update(updateData, {
        where: { id: id },
      });
      if (updatedRows > 0) {
        const updatedAdmin = await Admin.findByPk(id);
        return res.status(200).json(updatedAdmin);
      } else {
        return res.status(404).json({ message: 'Admin not found' });
      }
    } catch (error) {
      if (error.name === 'SequelizeUniqueConstraintError') {
        return res.status(409).json({ message: 'Email or phone number already exists.', error: error.message });
      }
      if (error.name === 'SequelizeValidationError') {
        return res.status(400).json({ message: 'Validation error', error: error.errors.map(e => e.message) });
      }
      throw error;
    }
  } catch (error) {
    console.error(`Error updating admin with ID ${req.params.id}:`, error);
    res.status(500).json({ message: 'Failed to update admin', error: error.message });
  }
}

// Delete an admin by ID
async function deleteAdmin(req, res) {
  try {
    const { id } = req.params;
    const deletedRows = await Admin.destroy({
      where: { id: id },
    });
    if (deletedRows > 0) {
      return res.status(204).send();
    } else {
      return res.status(404).json({ message: 'Admin not found' });
    }
  } catch (error) {
    console.error(`Error deleting admin with ID ${req.params.id}:`, error);
    res.status(500).json({ message: 'Failed to delete admin', error: error.message });
  }
}

module.exports = {
  createAdmin,
  getAllAdmins,
  getAdminById,
  updateAdmin,
  deleteAdmin,
};