// src/controllers/authController.js

const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const Admin = require("../models/admin");

async function loginAdmin(req, res) {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required." });
    }
    // Email format validation
    if (!/^([a-zA-Z0-9_\.-]+)@([a-zA-Z0-9\.-]+)\.([a-zA-Z]{2,6})$/.test(email)) {
      return res.status(400).json({ message: "Invalid email format." });
    }
    const admin = await Admin.findOne({ where: { email } });
    if (!admin) {
      return res.status(401).json({ message: "Invalid credentials" });
    }
    const isPasswordValid = await bcrypt.compare(password, admin.password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: "Invalid credentials" });
    }
    try {
      const token = jwt.sign(
        { adminId: admin.admin_id, role: admin.role },
        process.env.JWT_SECRET || "your_secret_key",
        { expiresIn: "24h" }
      );
      return res.status(200).json({ message: "Login successful", token });
    } catch (jwtError) {
      console.error("JWT signing error:", jwtError);
      return res.status(500).json({ message: "Failed to generate token", error: jwtError.message });
    }
  } catch (error) {
    console.error("Error during admin login:", error);
    if (error.name === 'SequelizeValidationError') {
      return res.status(400).json({ message: 'Validation error', error: error.errors.map(e => e.message) });
    }
    res.status(500).json({ message: "Internal server error", error: error.message });
  }
}

module.exports = {
  loginAdmin,
};
