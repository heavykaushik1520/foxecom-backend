const fetch = require("node-fetch");

let cachedToken = null;

async function getShiprocketToken() {
  // Use cached token if available
  if (cachedToken) return cachedToken;

  try {
    const email = process.env.SHIPROCKET_EMAIL;
    const password = process.env.SHIPROCKET_PASSWORD;

    if (!email || !password) {
      throw new Error(
        "Shiprocket email or password not set in environment variables"
      );
    }

    const response = await fetch(
      "https://apiv2.shiprocket.in/v1/external/auth/login",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
        timeout: 10000, // optional: timeout in milliseconds
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Shiprocket login failed: ${errorText}`);
      throw new Error(`Shiprocket auth failed: ${response.statusText}`);
    }

    const data = await response.json();

    if (data.token) {
      cachedToken = data.token;

      // Expire the token after ~23 hours (Shiprocket token expires in 24 hours)
      setTimeout(() => {
        cachedToken = null;
      }, 23 * 60 * 60 * 1000);

      return cachedToken;
    } else {
      throw new Error(
        `Shiprocket login response invalid: ${JSON.stringify(data)}`
      );
    }
  } catch (err) {
    console.error("Error getting Shiprocket token:", err.message);
    throw new Error(`Shiprocket auth error: ${err.message}`);
  }
}

module.exports = { getShiprocketToken };
