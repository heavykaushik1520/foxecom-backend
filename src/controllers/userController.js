// src/controllers/userController.js

const { User , Cart } = require("../models");

async function getAllUsers(req, res) {
  try {
    const users = await User.findAll({
      attributes: { exclude: ["password"] }, // Exclude password for security
    });
    res.status(200).json(users);
  } catch (error) {
    console.error("Error fetching all users:", error);
    res
      .status(500)
      .json({ message: "Failed to fetch users.", error: error.message });
  }
}

async function getUserByMe(req, res) {
  try {
    const user = await User.findByPk(req.user.userId, {
      attributes: { exclude: ["password"] },
      include: [
        {
          model: Cart,
          as: 'cart', // Use the alias you defined in the User model
        },
      ],
    });
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }
    res.status(200).json(user);
  } catch (error) {
    console.error("Error fetching user:", error);
    res
      .status(500)
      .json({ message: "Failed to fetch user.", error: error.message });
  }
}

async function updateUserMe(req, res) {
  try {
    const [updatedRows] = await User.update(req.body, {
      where: { id: req.user.userId },
    });

    if (updatedRows > 0) {
      const updatedUser = await User.findByPk(req.user.userId, {
        attributes: { exclude: ["password"] },
      });
      return res.status(200).json(updatedUser);
    } else {
      return res.status(404).json({ message: "User not found." });
    }
  } catch (error) {
    console.error("Error updating user:", error);
    res
      .status(500)
      .json({ message: "Failed to update user.", error: error.message });
  }
}

async function deleteUserMe(req, res) {
  try {
    const deletedRows = await User.destroy({
      where: { id: req.user.userId },
    });

    if (deletedRows > 0) {
      return res.status(204).send(); // 204 No Content
    } else {
      return res.status(404).json({ message: "User not found." });
    }
  } catch (error) {
    console.error("Error deleting user:", error);
    res
      .status(500)
      .json({ message: "Failed to delete user.", error: error.message });
  }
}

async function getUserById(req, res) {
  try {
    const { id } = req.params;
    const user = await User.findByPk(id, {
      attributes: { exclude: ["password"] },
      include: [
        {
          model: Cart,
          as: 'cart', 
        },
      ],
    });
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found." });
    }
    res.status(200).json({ success: true, user });
  } catch (error) {
    console.error(`Error fetching user with ID ${req.params.id}:`, error);
    res.status(500).json({ success: false, message: "Failed to fetch user.", error: error.message });
  }
}

async function updateUser(req, res) {
  try {
    const { id } = req.params;
    const { password, role, ...updateData } = req.body; 

    // Check if user exists
    const user = await User.findByPk(id);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found." });
    }

    // Validate role if provided
    if (role !== undefined) {
      const validRoles = ['user', 'admin'];
      if (!validRoles.includes(role)) {
        return res.status(400).json({ 
          success: false, 
          message: `Invalid role. Must be one of: ${validRoles.join(', ')}` 
        });
      }
      updateData.role = role;
    }

    // Handle password update separately (if needed in future)
    if (password) {
      // Password updates should go through proper password reset flow
      // For now, we'll skip password updates here for security
      return res.status(400).json({ 
        success: false, 
        message: "Password cannot be updated through this endpoint. Use password reset flow." 
      });
    }

    await user.update(updateData);
    const updatedUser = await User.findByPk(id, {
      attributes: { exclude: ["password"] },
      include: [
        {
          model: Cart,
          as: 'cart',
        },
      ],
    });

    return res.status(200).json({ 
      success: true,
      message: "User updated successfully",
      user: updatedUser 
    });
  } catch (error) {
    console.error(`Error updating user with ID ${req.params.id}:`, error);
    res.status(500).json({ success: false, message: "Failed to update user.", error: error.message });
  }
}

async function deleteUser(req, res) {
  try {
    const { id } = req.params;
    
    // Check if user exists
    const user = await User.findByPk(id);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found." });
    }

    // Store user info before deletion
    const userInfo = {
      id: user.id,
      email: user.email
    };

    await user.destroy();

    return res.status(200).json({ 
      success: true,
      message: "User deleted successfully",
      deletedUser: userInfo
    });
  } catch (error) {
    console.error(`Error deleting user with ID ${req.params.id}:`, error);
    res.status(500).json({ success: false, message: "Failed to delete user.", error: error.message });
  }
}

module.exports = {
  getAllUsers,
  getUserByMe,
  updateUserMe,
  deleteUserMe,
  getUserById,
  updateUser,
  deleteUser
};
