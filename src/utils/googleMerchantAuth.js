const { JWT } = require("google-auth-library");

const CONTENT_SCOPE = "https://www.googleapis.com/auth/content";

/**
 * Merchant API auth uses env vars only (no JSON file):
 * - GOOGLE_CLIENT_EMAIL: service account email
 * - GOOGLE_PRIVATE_KEY_B64: PEM private key, base64-encoded (UTF-8)
 *
 * @returns {Promise<string>}
 */
async function getGoogleMerchantAccessToken() {
  const email = process.env.GOOGLE_CLIENT_EMAIL;
  const privateKeyB64 = process.env.GOOGLE_PRIVATE_KEY_B64;

  if (!email || typeof email !== "string" || !email.trim()) {
    throw new Error(
      "GOOGLE_CLIENT_EMAIL is missing or empty. Set it for Merchant API authentication."
    );
  }

  if (!privateKeyB64 || typeof privateKeyB64 !== "string" || !privateKeyB64.trim()) {
    throw new Error(
      "GOOGLE_PRIVATE_KEY_B64 is missing or empty. Set it for Merchant API authentication."
    );
  }

  let privateKey;
  try {
    privateKey = Buffer.from(privateKeyB64.trim(), "base64").toString("utf8");
  } catch {
    throw new Error(
      "GOOGLE_PRIVATE_KEY_B64 is not valid base64 or could not be decoded."
    );
  }

  if (!privateKey || !privateKey.includes("BEGIN")) {
    throw new Error(
      "Decoded GOOGLE_PRIVATE_KEY_B64 does not look like a PEM private key (expected BEGIN … block)."
    );
  }

  privateKey = privateKey.replace(/\\n/g, "\n");

  const client = new JWT({
    email: email.trim(),
    key: privateKey,
    scopes: [CONTENT_SCOPE],
  });

  const tokenResponse = await client.getAccessToken();
  const accessToken =
    tokenResponse && typeof tokenResponse === "object" && "token" in tokenResponse
      ? tokenResponse.token
      : typeof tokenResponse === "string"
        ? tokenResponse
        : null;

  if (!accessToken) {
    throw new Error("Google auth succeeded but no access token was returned.");
  }

  return accessToken;
}

module.exports = {
  getGoogleMerchantAccessToken,
};
