/** Checkout / thank-you banner + trust row config (served to `pwc-checkout-banners-trust` via API). */

export const DEFAULT_MERCHANDISING = {
  checkout: {
    showBanner: true,
    bannerMode: "editable_until",
    bannerCustomText: "",
    bannerPromoText: "",
    bannerImageUrl: "",
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
    editWindowOverrideMinutes: 0,
  },
  trust: {
    showRow: false,
    showPaymentLabels: true,
    secureCheckoutText: "Secure checkout — SSL encrypted",
    returnPolicyText: "",
    partnerDisclaimerText: "",
    rowImageUrl: "",
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
  const bool = (v) => v === true || v === "true";
  const str = (v) => String(v ?? "").trim();

  return {
    checkout: {
      showBanner: bool(m.checkout.showBanner),
      bannerMode: str(m.checkout.bannerMode || "editable_until").toLowerCase() || "editable_until",
      bannerCustomText: str(m.checkout.bannerCustomText),
      bannerPromoText: str(m.checkout.bannerPromoText),
      bannerImageUrl: str(m.checkout.bannerImageUrl),
      editWindowOverrideMinutes: Math.min(240, Math.max(0, num(m.checkout.editWindowOverrideMinutes, 0))),
    },
    thankyou: {
      showExclusiveHeader: bool(m.thankyou.showExclusiveHeader),
      exclusiveHeadline: str(m.thankyou.exclusiveHeadline),
      exclusiveSubtext: str(m.thankyou.exclusiveSubtext),
      showBanner: bool(m.thankyou.showBanner),
      bannerMode: str(m.thankyou.bannerMode || "editable_until").toLowerCase() || "editable_until",
      bannerCustomText: str(m.thankyou.bannerCustomText),
      bannerPromoText: str(m.thankyou.bannerPromoText),
      bannerImageUrl: str(m.thankyou.bannerImageUrl),
      editWindowOverrideMinutes: Math.min(240, Math.max(0, num(m.thankyou.editWindowOverrideMinutes, 0))),
    },
    trust: {
      showRow: bool(m.trust.showRow),
      showPaymentLabels: bool(m.trust.showPaymentLabels),
      secureCheckoutText: str(m.trust.secureCheckoutText),
      returnPolicyText: str(m.trust.returnPolicyText),
      partnerDisclaimerText: str(m.trust.partnerDisclaimerText),
      rowImageUrl: str(m.trust.rowImageUrl),
    },
  };
}
