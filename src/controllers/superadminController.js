// src/controllers/superadminController.js
const bcrypt = require("bcrypt");
const Admin = require("../models/admin");

/**
 * POST /api/superadmin/admins - Create a new superadmin (superadmin only)
 */
async function createSuperAdmin(req, res) {
  try {
    const { name, email, password } = req.body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ success: false, message: "Name is required." });
    }
    if (!email || typeof email !== "string" || !email.trim()) {
      return res.status(400).json({ success: false, message: "Email is required." });
    }
    if (!/^([a-zA-Z0-9_.-]+)@([a-zA-Z0-9.-]+)\.([a-zA-Z]{2,6})$/.test(email)) {
      return res.status(400).json({ success: false, message: "Invalid email format." });
    }
    if (!password || password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password is required and must be at least 6 characters long.",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newAdmin = await Admin.create({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      password: hashedPassword,
      role: "superadmin",
    });

    const adminResponse = await Admin.findByPk(newAdmin.id, {
      attributes: { exclude: ["password"] },
    });

    return res.status(201).json({
      success: true,
      message: "Super Admin created successfully",
      admin: adminResponse,
    });
  } catch (error) {
    if (error.name === "SequelizeUniqueConstraintError") {
      return res.status(409).json({
        success: false,
        message: "An account with this email already exists.",
      });
    }
    if (error.name === "SequelizeValidationError") {
      return res.status(400).json({
        success: false,
        message: "Validation error",
        errors: error.errors.map((e) => e.message),
      });
    }
    console.error("Create superadmin error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to create Super Admin",
      error: error.message,
    });
  }
}

module.exports = { createSuperAdmin };
