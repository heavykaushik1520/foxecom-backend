const fetch = require("node-fetch");
const AbortController = global.AbortController || require("abort-controller");

const DEFAULT_RETRIES = 3;
const RETRY_DELAY_MS = 2000;
const DEFAULT_TIMEOUT_MS = 30000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function safeParseBody(rawText) {
  if (!rawText) return null;
  try {const fetch = require("node-fetch");
const AbortController = global.AbortController || require("abort-controller");

const DEFAULT_RETRIES = 3;
const RETRY_DELAY_MS = 2000;
const DEFAULT_TIMEOUT_MS = 30000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function safeParseBody(rawText) {
  if (!rawText) return null;
  try {
    return JSON.parse(rawText);
  } catch {
    return rawText;
  }
}

function extractErrorMessage(status, data) {
  let msg = `HTTP ${status}`;

  if (data != null) {
    if (typeof data === "object") {
      msg =
        data.message ||
        data.error ||
        data.rmks ||
        data.remarks ||
        data.detail ||
        msg;
    } else if (typeof data === "string" && data.trim()) {
      msg = data.trim().slice(0, 500);
    }
  }

  return String(msg);
}

async function delhiveryRequest(url, options = {}, retries = DEFAULT_RETRIES) {
  const method = (options.method || "GET").toUpperCase();
  const headers = { ...(options.headers || {}) };
  const timeoutMs = Number(options.timeoutMs || DEFAULT_TIMEOUT_MS);

  let lastError = "Request failed";

  for (let attempt = 1; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        method,
        headers,
        body: options.body,
        signal: controller.signal,
      });

      clearTimeout(timer);

      const rawText = await res.text();
      const data = safeParseBody(rawText);

      if (res.ok) {
        return { ok: true, status: res.status, data };
      }

      const error = extractErrorMessage(res.status, data);

      // Retry on 5xx and 429
      if ((res.status >= 500 || res.status === 429) && attempt < retries) {
        await sleep(RETRY_DELAY_MS * attempt); // small backoff
        continue;
      }

      return { ok: false, status: res.status, data, error };
    } catch (err) {
      clearTimeout(timer);

      lastError =
        err.name === "AbortError"
          ? `Request timeout after ${timeoutMs}ms`
          : err.message || "Network error";

      if (attempt < retries) {
        await sleep(RETRY_DELAY_MS * attempt);
        continue;
      }

      return { ok: false, status: 0, error: lastError };
    }
  }

  return { ok: false, status: 0, error: lastError };
}

module.exports = { delhiveryRequest, DEFAULT_RETRIES };
    return JSON.parse(rawText);
  } catch {
    return rawText;
  }
}

function extractErrorMessage(status, data) {
  let msg = `HTTP ${status}`;

  if (data != null) {
    if (typeof data === "object") {
      msg =
        data.message ||
        data.error ||
        data.rmks ||
        data.remarks ||
        data.detail ||
        msg;
    } else if (typeof data === "string" && data.trim()) {
      msg = data.trim().slice(0, 500);
    }
  }

  return String(msg);
}

async function delhiveryRequest(url, options = {}, retries = DEFAULT_RETRIES) {
  const method = (options.method || "GET").toUpperCase();
  const headers = { ...(options.headers || {}) };
  const timeoutMs = Number(options.timeoutMs || DEFAULT_TIMEOUT_MS);

  let lastError = "Request failed";

  for (let attempt = 1; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        method,
        headers,
        body: options.body,
        signal: controller.signal,
      });

      clearTimeout(timer);

      const rawText = await res.text();
      const data = safeParseBody(rawText);

      if (res.ok) {
        return { ok: true, status: res.status, data };
      }

      const error = extractErrorMessage(res.status, data);

      // Retry on 5xx and 429
      if ((res.status >= 500 || res.status === 429) && attempt < retries) {
        await sleep(RETRY_DELAY_MS * attempt); // small backoff
        continue;
      }

      return { ok: false, status: res.status, data, error };
    } catch (err) {
      clearTimeout(timer);

      lastError =
        err.name === "AbortError"
          ? `Request timeout after ${timeoutMs}ms`
          : err.message || "Network error";

      if (attempt < retries) {
        await sleep(RETRY_DELAY_MS * attempt);
        continue;
      }

      return { ok: false, status: 0, error: lastError };
    }
  }

  return { ok: false, status: 0, error: lastError };
}

module.exports = { delhiveryRequest, DEFAULT_RETRIES };