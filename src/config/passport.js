const { Strategy: GoogleStrategy } = require('passport-google-oauth20');
const { User, Cart } = require('../models');

module.exports = function configurePassport(passport) {
  const {
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GOOGLE_CALLBACK_URL,
  } = process.env;

  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_CALLBACK_URL) {
    console.warn(
      '[OAuth] Google OAuth environment variables are missing. ' +
      'Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_CALLBACK_URL to enable Google login.'
    );
    return;
  }

  passport.use(
    new GoogleStrategy(
      {
        clientID: GOOGLE_CLIENT_ID,
        clientSecret: GOOGLE_CLIENT_SECRET,
        callbackURL: GOOGLE_CALLBACK_URL,
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          const email =
            (profile.emails && profile.emails[0] && profile.emails[0].value) ||
            null;

          if (!email) {
            return done(null, false, {
              message: 'Google account does not have a public email.',
            });
          }

          let user = await User.findOne({ where: { email } });

          if (!user) {
            // Create a new user with a strong random password so schema stays compatible
            const randomPassword =
              'google_' +
              profile.id +
              '_' +
              Math.random().toString(36).slice(2) +
              Date.now().toString(36);

            user = await User.create({
              email,
              password: randomPassword,
            });

            // Ensure the user has a cart, consistent with email/password signup
            await Cart.create({ userId: user.id });
          }

          return done(null, user);
        } catch (err) {
          console.error('Error during Google OAuth verification:', err);
          return done(err, null);
        }
      }
    )
  );

  passport.serializeUser((user, done) => {
    done(null, user.id);
  });

  passport.deserializeUser(async (id, done) => {
    try {
      const user = await User.findByPk(id, {
        attributes: ['id', 'email', 'role'],
      });
      done(null, user);
    } catch (err) {
      done(err, null);
    }
  });
};

