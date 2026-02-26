/**
 * Delhivery API request helper with retries and graceful failure.
 * Keeps all Delhivery calls inside backend.
 */
const fetch = require('node-fetch');

const DEFAULT_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

/**
 * @param {string} url - Full URL
 * @param {object} options - fetch options (method, headers, body)
 * @param {number} retries - Number of retries on 5xx or network error
 * @returns {Promise<{ ok: boolean, status: number, data?: any, error?: string }>}
 */
async function delhiveryRequest(url, options = {}, retries = DEFAULT_RETRIES) {
  const method = (options.method || 'GET').toUpperCase();
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  let lastError;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        method,
        headers,
        body: options.body,
        timeout: 30000,
      });

      let data;
      const contentType = res.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        try {
          data = await res.json();
        } catch {
          data = null;
        }
      } else {
        data = await res.text();
      }

      if (res.ok) {
        return { ok: true, status: res.status, data };
      }

      lastError = data && (data.message || data.error) ? String(data.message || data.error) : `HTTP ${res.status}`;

      if (res.status >= 500 && attempt < retries) {
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
        continue;
      }

      return { ok: false, status: res.status, data, error: lastError };
    } catch (err) {
      lastError = err.message || 'Network error';
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
        continue;
      }
      return { ok: false, status: 0, error: lastError };
    }
  }

  return { ok: false, status: 0, error: lastError || 'Request failed' };
}

module.exports = { delhiveryRequest, DEFAULT_RETRIES };
