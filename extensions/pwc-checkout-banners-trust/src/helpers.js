/** @param {unknown} v */
export function asBool(v) {
  if (v === true || v === "true") return true;
  return false;
}

/**
 * Checkbox / switch values from persisted JSON (`true`, `"false"`, missing field, etc.).
 * @param {unknown} v
 * @param {boolean} whenUnset when `v` is undefined/null or unrecognized string
 */
export function merchandisingFlag(v, whenUnset) {
  if (v === undefined || v === null) return whenUnset;
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") {
    const t = v.trim().toLowerCase();
    if (["false", "0", "off", "no", ""].includes(t)) return false;
    if (["true", "1", "on", "yes"].includes(t)) return true;
    return whenUnset;
  }
  return whenUnset;
}

/** @param {unknown} v */
export function asInt(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

export function settingsRoot(shopify) {
  return shopify.settings?.current ?? shopify.settings?.value ?? {};
}

export function shopDomainFromApi(shopify) {
  const s = shopify.shop?.value ?? shopify.shop?.current ?? shopify.shop;
  if (!s) return "";
  const domain =
    s.myshopifyDomain ||
    (s.storefrontUrl ? String(s.storefrontUrl).replace(/^https?:\/\//, "").replace(/\/$/, "") : "");
  return domain || "";
}

/**
 * @param {string} mode
 * @param {{minutes: number, custom: string, promo: string}} parts
 */
export function bannerBodyText(mode, parts) {
  const m = String(mode || "editable_until").toLowerCase().trim();
  if (m === "none") return "";
  if (m === "custom") return parts.custom || "";
  if (m === "promo") return parts.promo || "";
  /* editable_until */
  const n = parts.minutes ?? 30;
  return `You can edit this order for ${n} minutes after placing it.`;
}

/** Strip BOM / zero‑width chars (common when pasting Shopify Files URLs). */
export function sanitizedHttpsUrl(raw) {
  const t = String(raw ?? "")
    .trim()
    .replace(/[\u200B-\u200D\uFEFF]/g, "");
  // Require at least one non-space after scheme so pasted blanks don't qualify
  if (!/^https:\/\/\S+/i.test(t)) return "";
  return t;
}

export function isHttpUrl(s) {
  return sanitizedHttpsUrl(s) !== "";
}

/** `s-box` maxBlockSize value: cap trust badge strip height (0 or invalid = unlimited). */
export function trustBadgeMaxBlockSize(px) {
  const n = Number(px);
  if (!Number.isFinite(n) || n <= 0) return 'none';
  return `${Math.min(600, Math.max(48, Math.trunc(n)))}px`;
}

/** Cross-axis alignment for stacked trust copy (Polaris checkout `stack` alignItems). */
export function trustSecureTextAlign(raw) {
  const s = String(raw || 'start').toLowerCase().trim();
  if (s === 'center') return 'center';
  if (s === 'end') return 'end';
  return 'start';
}
