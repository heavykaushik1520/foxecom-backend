// src/routes/userAuthRoutes.js

const express = require("express");
const router = express.Router();
const {
  signupUser,
  signinUser,
  signoutUser,
  getCurrentUser,
  refreshToken,
  forgotPassword,
  resetPassword,
} = require("../controllers/userAuthController");
const { isUser } = require("../middleware/userAuthMiddleware");

router.post("/signup", signupUser);
router.post("/signin", signinUser);
router.post("/signout", signoutUser);

router.get("/me", isUser, isUser , getCurrentUser);
router.post("/refresh-token", isUser, refreshToken);

router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);

module.exports = router;
