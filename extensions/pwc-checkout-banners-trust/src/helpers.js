/** @param {unknown} v */
export function asBool(v) {
  if (v === true || v === "true") return true;
  return false;
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

export function isHttpUrl(s) {
  const t = String(s || "").trim();
  return /^https:\/\//i.test(t);
}
