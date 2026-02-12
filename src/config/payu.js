// config/payu.js - PayU India payment gateway config
require("dotenv").config();

const PAYU_KEY = process.env.PAYU_TEST_KEY || process.env.PAYU_KEY;
const PAYU_SALT = process.env.PAYU_TEST_SALT || process.env.PAYU_SALT;
const PAYU_BASE_URL = process.env.PAYU_TEST_KEY ? "https://test.payu.in" : "https://secure.payu.in";

module.exports = {
  key: PAYU_KEY,
  salt: PAYU_SALT,
  paymentUrl: `${PAYU_BASE_URL}/_payment`,
  isTestMode: !!process.env.PAYU_TEST_KEY,
};
