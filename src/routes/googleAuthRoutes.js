const express = require('express');
const jwt = require('jsonwebtoken');
const passport = require('passport');

const router = express.Router();

// Start Google OAuth flow
router.get(
  '/auth/google',
  (req, res, next) => {
    // Optionally capture intended redirect in "state"
    const redirectAfterLogin = req.query.redirect || null;
    const state = redirectAfterLogin
      ? JSON.stringify({ redirect: redirectAfterLogin })
      : undefined;

    const authenticator = passport.authenticate('google', {
      scope: ['profile', 'email'],
      session: true,
      state,
    });
    authenticator(req, res, next);
  }
);

// Google OAuth callback – issues JWT and redirects to frontend
router.get(
  '/auth/callback',
  (req, res, next) => {
    const authenticator = passport.authenticate('google', {
      session: false, // we use JWT for app auth, session only for OAuth handshake
      failureRedirect: `${process.env.CLIENT_URL || 'http://localhost:5173'}/login?error=google_auth_failed`,
    });
    authenticator(req, res, next);
  },
  (req, res) => {
    try {
      if (!req.user) {
        return res.redirect(
          `${process.env.CLIENT_URL || 'http://localhost:5173'}/login?error=google_auth_failed`
        );
      }

      const payload = {
        userId: req.user.id,
        role: req.user.role,
      };

      const token = jwt.sign(payload, process.env.JWT_SECRET, {
        expiresIn: process.env.JWT_EXPIRES_IN || '365d',
      });

      const clientBase = (process.env.CLIENT_URL || 'http://localhost:5173').replace(/\/$/, '');

      // Always return to /login so the frontend Login page
      // can store the token, merge carts, and redirect to the
      // intended page using redirectAfterLogin.
      const redirectUrl = new URL(clientBase + '/login');
      redirectUrl.searchParams.set('token', token);
      redirectUrl.searchParams.set('provider', 'google');

      return res.redirect(redirectUrl.toString());
    } catch (err) {
      console.error('Error in Google OAuth callback handler:', err);
      const clientBase = (process.env.CLIENT_URL || 'http://localhost:5173').replace(/\/$/, '');
      return res.redirect(
        `${clientBase}/login?error=google_auth_unexpected`
      );
    }
  }
);

module.exports = router;

