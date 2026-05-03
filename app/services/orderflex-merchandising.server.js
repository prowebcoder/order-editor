/** Checkout / thank-you banner + trust row config (served to `pwc-checkout-banners-trust` via API). */

export const DEFAULT_MERCHANDISING = {
  checkout: {
    showBanner: true,
    bannerMode: "editable_until",
    bannerCustomText: "",
    bannerPromoText: "",
    bannerImageUrl: "",
    bannerImageMaxHeightPx: 0,
    editWindowOverrideMinutes: 0,
  },
  thankyou: {
    showExclusiveHeader: false,
    exclusiveHeadline: "",
    exclusiveSubtext: "",
    showBanner: true,
    bannerMode: "editable_until",
    bannerCustomText: "",
    bannerPromoText: "",
    bannerImageUrl: "",
    bannerImageMaxHeightPx: 0,
    editWindowOverrideMinutes: 0,
  },
  trust: {
    showRow: false,
    secureCheckoutText: "Secure checkout — SSL encrypted",
    secureCheckoutTextAlign: "start",
    returnPolicyText: "",
    partnerDisclaimerText: "",
    rowImageUrl: "",
    rowImageMaxHeightPx: 0,
  },
};

export function parseMerchandisingJson(raw) {
  let parsed = {};
  try {
    parsed = typeof raw === "string" ? JSON.parse(raw || "{}") : raw || {};
  } catch {
    parsed = {};
  }
  return mergeMerchandising(DEFAULT_MERCHANDISING, parsed);
}

export function mergeMerchandising(base, overlay) {
  const o = overlay && typeof overlay === "object" ? overlay : {};
  return {
    checkout: {...base.checkout, ...(o.checkout || {})},
    thankyou: {...base.thankyou, ...(o.thankyou || {})},
    trust: {...base.trust, ...(o.trust || {})},
  };
}

/** Coerce types from form / partial saves */
export function sanitizeMerchandisingInput(input) {
  const m = mergeMerchandising(DEFAULT_MERCHANDISING, input);
  const num = (v, d = 0) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.trunc(n) : d;
  };
  /** @param {unknown} v @param {boolean} whenUnset when field is absent or ambiguous string */
  const toggle = (v, whenUnset) => {
    if (v === undefined || v === null) return whenUnset;
    if (typeof v === "boolean") return v;
    if (typeof v === "number") return v !== 0;
    if (typeof v === "string") {
      const t = v.trim().toLowerCase();
      if (["false", "0", "off", "no", ""].includes(t)) return false;
      if (["true", "1", "on", "yes"].includes(t)) return true;
      return whenUnset;
    }
    return Boolean(v);
  };
  const str = (v) => String(v ?? "").trim();
  const crossAlign = (v) => {
    const x = str(v).toLowerCase();
    if (x === "center" || x === "end") return x;
    return "start";
  };

  return {
    checkout: {
      showBanner: toggle(m.checkout.showBanner, true),
      bannerMode: str(m.checkout.bannerMode || "editable_until").toLowerCase() || "editable_until",
      bannerCustomText: str(m.checkout.bannerCustomText),
      bannerPromoText: str(m.checkout.bannerPromoText),
      bannerImageUrl: str(m.checkout.bannerImageUrl),
      bannerImageMaxHeightPx: Math.min(600, Math.max(0, num(m.checkout.bannerImageMaxHeightPx, 0))),
      editWindowOverrideMinutes: Math.min(240, Math.max(0, num(m.checkout.editWindowOverrideMinutes, 0))),
    },
    thankyou: {
      showExclusiveHeader: toggle(m.thankyou.showExclusiveHeader, false),
      exclusiveHeadline: str(m.thankyou.exclusiveHeadline),
      exclusiveSubtext: str(m.thankyou.exclusiveSubtext),
      showBanner: toggle(m.thankyou.showBanner, true),
      bannerMode: str(m.thankyou.bannerMode || "editable_until").toLowerCase() || "editable_until",
      bannerCustomText: str(m.thankyou.bannerCustomText),
      bannerPromoText: str(m.thankyou.bannerPromoText),
      bannerImageUrl: str(m.thankyou.bannerImageUrl),
      bannerImageMaxHeightPx: Math.min(600, Math.max(0, num(m.thankyou.bannerImageMaxHeightPx, 0))),
      editWindowOverrideMinutes: Math.min(240, Math.max(0, num(m.thankyou.editWindowOverrideMinutes, 0))),
    },
    trust: {
      showRow: toggle(m.trust.showRow, false),
      secureCheckoutText: str(m.trust.secureCheckoutText),
      secureCheckoutTextAlign: crossAlign(m.trust.secureCheckoutTextAlign),
      returnPolicyText: str(m.trust.returnPolicyText),
      partnerDisclaimerText: str(m.trust.partnerDisclaimerText),
      rowImageUrl: str(m.trust.rowImageUrl),
      rowImageMaxHeightPx: Math.min(600, Math.max(0, num(m.trust.rowImageMaxHeightPx, 0))),
    },
  };
}
