/** Match `pwc-checkout-editor` Checkout.jsx normalization */
export function appOriginFromPortalSetting(raw) {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return "";
  return trimmed.replace(/\/order-edit\/?$/i, "").replace(/\/$/, "");
}
