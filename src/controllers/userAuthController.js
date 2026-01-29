// src/controllers/userAuthController.js

const { User, Cart } = require("../models");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const { Op } = require("sequelize");


async function signupUser(req, res) {
  try {
    const { email, password } = req.body;

    // Robust Validation
   
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ message: "Valid email is required." });
    }
    if (!password || password.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters long." });
    }

    const newUser = await User.create({ email, password });
    await Cart.create({ userId: newUser.id });
    
    // Return user without password
    const userWithoutPassword = {
      id: newUser.id,
      email: newUser.email,
      role: newUser.role,
      createdAt: newUser.createdAt
    };
    
    res.status(201).json(userWithoutPassword);
  } catch (error) {
    console.error("Error signing up user:", error);
    if (error.name === "SequelizeUniqueConstraintError") {
      return res
        .status(400)
        .json({ message: "Email already exists." });
    }
    res
      .status(500)
      .json({ message: "Failed to create user.", error: error.message });
  }
}

async function signinUser(req, res) {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required." });
  }

  try {
    const user = await User.findOne({ where: { email } });

    if (!user) {
      return res.status(401).json({ message: "Invalid credentials." });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return res.status(401).json({ message: "Invalid credentials." });
    }

    const token = jwt.sign(
      { userId: user.id, role: user.role },
      process.env.JWT_SECRET ,
      { expiresIn: "24h" }
    );

    res.status(200).json({ message: "Sign in successful!", token });
  } catch (error) {
    console.error("Error signing in user:", error);
    res
      .status(500)
      .json({ message: "Failed to sign in.", error: error.message });
  }
}

async function signoutUser(req, res) {
  res.status(200).json({ message: "Sign out successful!" });
}

async function getCurrentUser(req, res) {
  try {
    const user = await User.findByPk(req.user.userId, {
      attributes: ["id", "email", "role"],
    });

    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    return res.status(200).json(user);
  } catch (error) {
    console.error("Error fetching current user:", error);
    res.status(500).json({ message: "Failed to fetch user." });
  }
}

// POST /refresh-token
function refreshToken(req, res) {
  try {
    const payload = {
      userId: req.user.userId,
      role: req.user.role,
    };

    const newToken = jwt.sign(
      payload,
      process.env.JWT_SECRET ,
      {
        expiresIn: "10m", // match your session timeout policy
      }
    );

    return res.status(200).json({ token: newToken });
  } catch (error) {
    console.error("Error refreshing token:", error);
    return res.status(500).json({ message: "Failed to refresh token." });
  }
}

async function forgotPassword(req, res) {
  const { email } = req.body;

  try {
    const user = await User.findOne({ where: { email } });

    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    const token = crypto.randomBytes(32).toString("hex");
    const expires = new Date(Date.now() + 3600000); // 1 hour from now

    user.reset_token = token;
    user.reset_token_expires = expires;
    await user.save();

    const frontendUrl = (process.env.FRONTEND_URL || "http://localhost:5173").replace(/\/$/, "");
    const resetLink = `${frontendUrl}/reset-password?token=${token}`;

    const smtpPort = parseInt(process.env.FORGOT_PASSWORD_SMTP_PORT, 10) || 587;
    const transporter = nodemailer.createTransport({
      host: process.env.FORGOT_PASSWORD_SMTP_HOST,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: {
        user: process.env.FORGOT_PASSWORD_SMTP_USER,
        pass: process.env.FORGOT_PASSWORD_SMTP_PASS,
      },
      tls: { rejectUnauthorized: false },
    });

    await transporter.sendMail({
      from: `"FoxEcom Support" <${process.env.FORGOT_PASSWORD_SMTP_USER}>`,
      to: email,
      subject: "Password Reset Request",
      html: `<p>Click <a href="${resetLink}">here</a> to reset your password. This link will expire in 1 hour.</p>`,
    });

    res.json({ message: "Reset link sent to your email." });
  } catch (error) {
    console.error("Error in forgotPassword:", error);
    res.status(500).json({ message: "Something went wrong." });
  }
}

async function resetPassword(req, res) {
  if (!req.body || !req.body.token || !req.body.newPassword) {
    return res
      .status(400)
      .json({ message: "Token and new password are required." });
  }
  const { token, newPassword } = req.body;

  try {
    const user = await User.findOne({
      where: {
        reset_token: token,
        reset_token_expires: { [Op.gt]: new Date() },
      },
    });

    if (!user) {
      return res.status(400).json({ message: "Invalid or expired token." });
    }

    user.password = newPassword; // Hook will hash it
    user.reset_token = null;
    user.reset_token_expires = null;

    await user.save();

    res.json({ message: "Password reset successfully." });
  } catch (error) {
    console.error("Error in resetPassword:", error);
    res.status(500).json({ message: "Failed to reset password." });
  }
}

module.exports = {
  signupUser,
  signinUser,
  signoutUser,
  getCurrentUser,
  refreshToken,
  forgotPassword,
  resetPassword,
};
