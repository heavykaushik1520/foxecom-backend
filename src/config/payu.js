// config/payu.js - PayU India payment gateway config (official SDK)
require("dotenv").config();

// Priority: PAYU_ENV > PAYU_TEST_KEY presence > default to PROD if only PAYU_KEY is set
const hasTestKey = !!process.env.PAYU_TEST_KEY;
const hasProdKey = !!process.env.PAYU_KEY;
const PAYU_KEY = process.env.PAYU_TEST_KEY || process.env.PAYU_KEY;
const PAYU_SALT = process.env.PAYU_TEST_SALT || process.env.PAYU_SALT;


let isTestMode = false;
if (process.env.PAYU_ENV === "TEST") {
  isTestMode = true;
} else if (process.env.PAYU_ENV === "LIVE" || process.env.PAYU_ENV === "PROD") {
  isTestMode = false;
} else if (hasTestKey) {
  
  isTestMode = true;
} else if (hasProdKey && !hasTestKey) {
  // Only PAYU_KEY is set (no PAYU_TEST_KEY), use production
  isTestMode = false;
} else {
  // Neither set - default to PROD for safety
  isTestMode = false;
}

const PAYU_ENVIRONMENT = isTestMode ? "TEST" : "PROD";
const PAYU_BASE_URL = isTestMode ? "https://test.payu.in" : "https://secure.payu.in";

// Log environment on module load (for debugging)
console.log(`[PayU Config] Environment: ${PAYU_ENVIRONMENT}, Base URL: ${PAYU_BASE_URL}, Key: ${PAYU_KEY ? PAYU_KEY.substring(0, 6) + '...' : 'NOT SET'}`);

let payuClient = null;

function getPayuClient() {
  if (!PAYU_KEY || !PAYU_SALT) {
    throw new Error("PayU key and salt must be set in environment.");
  }
  if (!payuClient) {
    const PayU = require("payu-websdk");
    payuClient = new PayU(
      { key: PAYU_KEY, salt: PAYU_SALT },
      PAYU_ENVIRONMENT
    );
  }
  return payuClient;
}

module.exports = {
  key: PAYU_KEY,
  salt: PAYU_SALT,
  paymentUrl: `${PAYU_BASE_URL}/_payment`,
  isTestMode,
  environment: PAYU_ENVIRONMENT,
  getPayuClient,
};
