/**
 * Delivery estimate helpers: dispatch cutoff, date range, formatting.
 * Timezone-aware for India (Asia/Kolkata).
 */

const DEFAULT_TIMEZONE = "Asia/Kolkata";
const DEFAULT_CUTOFF_HOUR = 14; // 2:00 PM IST — same-day dispatch before this time
const RANGE_BUFFER_DAYS = 1;

const MONTH_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function getDispatchConfig() {
  const cutoffHour = Number(process.env.DISPATCH_CUTOFF_HOUR);
  const timezone = (process.env.DISPATCH_TIMEZONE || DEFAULT_TIMEZONE).trim();
  const rangeBufferDays = Number(process.env.DELIVERY_RANGE_BUFFER_DAYS);

  return {
    cutoffHour:
      Number.isFinite(cutoffHour) && cutoffHour >= 0 && cutoffHour <= 23
        ? cutoffHour
        : DEFAULT_CUTOFF_HOUR,
    timezone: timezone || DEFAULT_TIMEZONE,
    rangeBufferDays:
      Number.isFinite(rangeBufferDays) && rangeBufferDays >= 0
        ? Math.min(rangeBufferDays, 3)
        : RANGE_BUFFER_DAYS,
  };
}

function getZonedParts(date = new Date(), timeZone = DEFAULT_TIMEZONE) {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    weekday: "short",
  });

  const parts = formatter.formatToParts(date);
  const map = {};
  for (const part of parts) {
    if (part.type !== "literal") map[part.type] = part.value;
  }

  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    weekday: map.weekday,
  };
}

function toDateOnlyString(year, month, day) {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseDateOnly(dateStr) {
  const [y, m, d] = String(dateStr).split("-").map(Number);
  return { year: y, month: m, day: d };
}

function addCalendarDays(dateStr, days) {
  const { year, month, day } = parseDateOnly(dateStr);
  const dt = new Date(Date.UTC(year, month - 1, day));
  dt.setUTCDate(dt.getUTCDate() + days);
  return toDateOnlyString(
    dt.getUTCFullYear(),
    dt.getUTCMonth() + 1,
    dt.getUTCDate(),
  );
}

function isSundayDateStr(dateStr) {
  const { year, month, day } = parseDateOnly(dateStr);
  const dt = new Date(Date.UTC(year, month - 1, day));
  return dt.getUTCDay() === 0;
}

/**
 * Next dispatch/pickup date in IST.
 * - Before cutoff on a non-Sunday weekday → today
 * - After cutoff, Sunday, or Saturday evening rules → next valid dispatch day
 * We skip Sunday for warehouse dispatch (no pickups).
 */
function computeExpectedPickupDate(now = new Date()) {
  const { cutoffHour, timezone } = getDispatchConfig();
  const parts = getZonedParts(now, timezone);
  let pickupStr = toDateOnlyString(parts.year, parts.month, parts.day);

  const beforeCutoff = parts.hour < cutoffHour;

  if (isSundayDateStr(pickupStr) || !beforeCutoff) {
    do {
      pickupStr = addCalendarDays(pickupStr, 1);
    } while (isSundayDateStr(pickupStr));
  }

  return pickupStr;
}

function formatShortDate(dateStr) {
  const { year, month, day } = parseDateOnly(dateStr);
  return `${day} ${MONTH_SHORT[month - 1]}`;
}

function formatShortDateWithYear(dateStr) {
  const { year, month, day } = parseDateOnly(dateStr);
  return `${day} ${MONTH_SHORT[month - 1]} ${year}`;
}

/**
 * Format delivery range: "12–14 Jul" or "30 Jul – 2 Aug"
 */
function formatDeliveryRangeLabel(fromStr, toStr) {
  if (!fromStr || !toStr) return null;

  const from = parseDateOnly(fromStr);
  const to = parseDateOnly(toStr);

  if (from.year === to.year && from.month === to.month) {
    return `${from.day}–${to.day} ${MONTH_SHORT[from.month - 1]}`;
  }

  if (from.year === to.year) {
    return `${formatShortDate(fromStr)} – ${formatShortDate(toStr)}`;
  }

  return `${formatShortDateWithYear(fromStr)} – ${formatShortDateWithYear(toStr)}`;
}

function buildDeliveryRange(tatDays, pickupDateStr) {
  const days = Math.max(1, Math.round(Number(tatDays) || 5));
  const { rangeBufferDays } = getDispatchConfig();
  const fromStr = addCalendarDays(pickupDateStr, days);
  const toStr = addCalendarDays(pickupDateStr, days + rangeBufferDays);

  return {
    tatDays: days,
    expectedPickupDate: pickupDateStr,
    estimatedDeliveryFrom: fromStr,
    estimatedDeliveryTo: toStr,
    deliveryEstimateLabel: formatDeliveryRangeLabel(fromStr, toStr),
  };
}

function getFallbackTatRange() {
  const min = Number(process.env.DELIVERY_ESTIMATE_FALLBACK_MIN) || 5;
  const max = Number(process.env.DELIVERY_ESTIMATE_FALLBACK_MAX) || 7;
  return {
    min: Math.max(1, Math.min(min, max)),
    max: Math.max(min, max),
  };
}

function buildFallbackEstimate(pickupDateStr) {
  const { min, max } = getFallbackTatRange();
  const fromStr = addCalendarDays(pickupDateStr, min);
  const toStr = addCalendarDays(pickupDateStr, max);

  return {
    success: true,
    serviceable: true,
    prepaid: true,
    cod: false,
    tatDays: min,
    expectedPickupDate: pickupDateStr,
    estimatedDeliveryFrom: fromStr,
    estimatedDeliveryTo: toStr,
    deliveryEstimateLabel: formatDeliveryRangeLabel(fromStr, toStr),
    source: "fallback",
    dispatchCutoffHour: getDispatchConfig().cutoffHour,
    dispatchTimezone: getDispatchConfig().timezone,
  };
}

module.exports = {
  getDispatchConfig,
  computeExpectedPickupDate,
  buildDeliveryRange,
  buildFallbackEstimate,
  formatDeliveryRangeLabel,
  addCalendarDays,
};
