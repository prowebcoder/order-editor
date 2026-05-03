import {MerchShopifyImageField} from "./MerchShopifyImageField.jsx";

/** Checkout / thank-you banners + trust — persisted as JSON on AppSettings (API → checkout extension). */

export function CheckoutMerchandisingTab({merch, patchMerch, disabled}) {
  const co = merch.checkout || {};
  const ty = merch.thankyou || {};
  const trust = merch.trust || {};

  return (
    <s-stack direction="block" gap="large">
      <s-banner tone="info">
        <s-text variant="bodySm">
          Storefront blocks only need the App public URL (same as Order Editor checkout block). Use Upload to store Files
          to send images straight to Shopify Files, or paste a CDN URL manually. Tap Save checkout display to persist URLs.
        </s-text>
      </s-banner>

      <s-box padding="small" background="subdued" borderRadius="base">
        <s-stack direction="block" gap="small">
          <s-heading>Banner — checkout</s-heading>
          <s-switch
            label="Show banner on checkout"
            checked={!!co.showBanner}
            disabled={disabled}
            onChange={(e) => patchMerch("checkout", "showBanner", e?.currentTarget?.checked ?? e?.detail?.checked ?? false)}
          />
          <s-text-field
            label="Banner mode"
            value={String(co.bannerMode || "editable_until")}
            disabled={disabled}
            details="none | editable_until | custom | promo"
            onInput={(e) => patchMerch("checkout", "bannerMode", e?.currentTarget?.value ?? "")}
          />
          <s-text-area
            label="Custom banner text (when mode is custom)"
            value={String(co.bannerCustomText || "")}
            disabled={disabled}
            rows={3}
            onInput={(e) => patchMerch("checkout", "bannerCustomText", e?.currentTarget?.value ?? "")}
          />
          <s-text-field
            label="Promo line (when mode is promo)"
            value={String(co.bannerPromoText || "")}
            disabled={disabled}
            onInput={(e) => patchMerch("checkout", "bannerPromoText", e?.currentTarget?.value ?? "")}
          />
          <MerchShopifyImageField
            label="Checkout banner image URL"
            details="Optional — appears above checkout banner copy"
            value={co.bannerImageUrl}
            disabled={disabled}
            patchMerch={patchMerch}
            section="checkout"
            urlKey="bannerImageUrl"
          />
          <s-number-field
            label="Checkout banner image max height (px)"
            value={String(Number(co.bannerImageMaxHeightPx ?? 0) || 0)}
            min={0}
            max={600}
            disabled={disabled}
            details="0 = no limit. Caps tall hero images in the order summary (same logic as trust badge)."
            onInput={(e) =>
              patchMerch("checkout", "bannerImageMaxHeightPx", Number.parseInt(e?.currentTarget?.value || "0", 10) || 0)
            }
          />
          <s-number-field
            label="Edit-window override (minutes)"
            value={String(co.editWindowOverrideMinutes ?? 0)}
            min={0}
            max={240}
            disabled={disabled}
            details="0 = use General tab edit window. &gt;0 overrides only for this banner text."
            onInput={(e) =>
              patchMerch("checkout", "editWindowOverrideMinutes", Number.parseInt(e?.currentTarget?.value || "0", 10) || 0)
            }
          />
        </s-stack>
      </s-box>

      <s-box padding="small" background="subdued" borderRadius="base">
        <s-stack direction="block" gap="small">
          <s-heading>Banner — thank-you page</s-heading>
          <s-switch
            label="Show exclusive headline & subtext (thank-you only)"
            checked={!!ty.showExclusiveHeader}
            disabled={disabled}
            onChange={(e) =>
              patchMerch("thankyou", "showExclusiveHeader", e?.currentTarget?.checked ?? e?.detail?.checked ?? false)
            }
          />
          <s-text-field
            label="Thank-you headline"
            value={String(ty.exclusiveHeadline || "")}
            disabled={disabled}
            onInput={(e) => patchMerch("thankyou", "exclusiveHeadline", e?.currentTarget?.value ?? "")}
          />
          <s-text-area
            label="Thank-you subtext"
            value={String(ty.exclusiveSubtext || "")}
            disabled={disabled}
            rows={3}
            onInput={(e) => patchMerch("thankyou", "exclusiveSubtext", e?.currentTarget?.value ?? "")}
          />
          <s-switch
            label="Show banner on thank-you"
            checked={!!ty.showBanner}
            disabled={disabled}
            onChange={(e) => patchMerch("thankyou", "showBanner", e?.currentTarget?.checked ?? e?.detail?.checked ?? false)}
          />
          <s-text-field
            label="Thank-you banner mode"
            value={String(ty.bannerMode || "editable_until")}
            disabled={disabled}
            details="none | editable_until | custom | promo"
            onInput={(e) => patchMerch("thankyou", "bannerMode", e?.currentTarget?.value ?? "")}
          />
          <s-text-area
            label="Custom thank-you banner text"
            value={String(ty.bannerCustomText || "")}
            disabled={disabled}
            rows={3}
            onInput={(e) => patchMerch("thankyou", "bannerCustomText", e?.currentTarget?.value ?? "")}
          />
          <s-text-field
            label="Thank-you promo line"
            value={String(ty.bannerPromoText || "")}
            disabled={disabled}
            onInput={(e) => patchMerch("thankyou", "bannerPromoText", e?.currentTarget?.value ?? "")}
          />
          <MerchShopifyImageField
            label="Thank-you banner image URL"
            details="Optional"
            value={ty.bannerImageUrl}
            disabled={disabled}
            patchMerch={patchMerch}
            section="thankyou"
            urlKey="bannerImageUrl"
          />
          <s-number-field
            label="Thank-you banner image max height (px)"
            value={String(Number(ty.bannerImageMaxHeightPx ?? 0) || 0)}
            min={0}
            max={600}
            disabled={disabled}
            details="0 = no limit."
            onInput={(e) =>
              patchMerch("thankyou", "bannerImageMaxHeightPx", Number.parseInt(e?.currentTarget?.value || "0", 10) || 0)
            }
          />
          <s-number-field
            label="Thank-you edit-window override (minutes)"
            value={String(ty.editWindowOverrideMinutes ?? 0)}
            min={0}
            max={240}
            disabled={disabled}
            details="0 = use General tab edit window."
            onInput={(e) =>
              patchMerch("thankyou", "editWindowOverrideMinutes", Number.parseInt(e?.currentTarget?.value || "0", 10) || 0)
            }
          />
        </s-stack>
      </s-box>

      <s-box padding="small" background="subdued" borderRadius="base">
        <s-stack direction="block" gap="small">
          <s-heading>Trust row (checkout & thank-you)</s-heading>
          <s-switch
            label="Show trust row"
            checked={!!trust.showRow}
            disabled={disabled}
            details="Includes badge image URL, secure line, returns/partner snippets, and banners. Off = none of these publish."
            onChange={(e) => patchMerch("trust", "showRow", e?.currentTarget?.checked ?? e?.detail?.checked ?? false)}
          />
          {!!String(trust.rowImageUrl || "").trim() && !trust.showRow ? (
            <s-banner tone="warning">
              <s-text variant="bodySm">
                Trust row is off — the badge image and trust copy will not appear on checkout until you turn on Show trust
                row and save.
              </s-text>
            </s-banner>
          ) : null}
          <s-number-field
            label="Trust badge image max height (px)"
            value={String(Number(trust.rowImageMaxHeightPx ?? 0) || 0)}
            min={0}
            max={600}
            disabled={disabled}
            details="0 = no limit (full natural height). Use this to shorten tall badge strips in checkout."
            onInput={(e) =>
              patchMerch("trust", "rowImageMaxHeightPx", Number.parseInt(e?.currentTarget?.value || "0", 10) || 0)
            }
          />
          <s-text-field
            label="Secure checkout text"
            value={String(trust.secureCheckoutText || "")}
            disabled={disabled}
            onInput={(e) => patchMerch("trust", "secureCheckoutText", e?.currentTarget?.value ?? "")}
          />
          <s-text-field
            label="Secure checkout text alignment"
            value={String(trust.secureCheckoutTextAlign || "start")}
            disabled={disabled}
            details="start | center | end"
            onInput={(e) => patchMerch("trust", "secureCheckoutTextAlign", e?.currentTarget?.value ?? "start")}
          />
          <s-text-area
            label="Returns / policy snippet"
            value={String(trust.returnPolicyText || "")}
            disabled={disabled}
            rows={2}
            onInput={(e) => patchMerch("trust", "returnPolicyText", e?.currentTarget?.value ?? "")}
          />
          <s-text-area
            label="Partner / Klarna-style disclaimer"
            value={String(trust.partnerDisclaimerText || "")}
            disabled={disabled}
            rows={2}
            onInput={(e) => patchMerch("trust", "partnerDisclaimerText", e?.currentTarget?.value ?? "")}
          />
          <MerchShopifyImageField
            label="Trust row image URL"
            details="Optional badge strip image"
            value={trust.rowImageUrl}
            disabled={disabled}
            patchMerch={patchMerch}
            section="trust"
            urlKey="rowImageUrl"
          />
        </s-stack>
      </s-box>
    </s-stack>
  );
}
