import '@shopify/ui-extensions/preact';
import {render} from 'preact';
import {useEffect, useState} from 'preact/hooks';
import {
  bannerBodyText,
  merchandisingFlag,
  sanitizedHttpsUrl,
  settingsRoot,
  shopDomainFromApi,
  trustBadgeMaxBlockSize,
  trustSecureTextAlign,
} from './helpers.js';
import {usePublicMerchConfig} from './usePublicMerchConfig.js';

export default async () => {
  render(<CheckoutChrome />, document.body);
};

function CheckoutChrome() {
  const [shopDomain, setShopDomain] = useState('');
  const portal = String(settingsRoot(shopify).portal_base_url || '').trim();

  useEffect(() => {
    setShopDomain(shopDomainFromApi(shopify));
  }, []);

  const {data, loading, error} = usePublicMerchConfig(portal, shopDomain);

  if (loading) {
    return (
      <s-stack gap="none">
        <s-text tone="neutral">Loading checkout message…</s-text>
      </s-stack>
    );
  }

  if (error || !data?.ok) {
    return (
      <s-banner tone="warning">
        <s-text>{error || "Could not load checkout display settings. Check App public URL and app Settings."}</s-text>
      </s-banner>
    );
  }

  const co = data.checkout || {};
  const trust = data.trust || {};
  const showBanner = merchandisingFlag(co.showBanner, true);
  const mode = String(co.bannerMode || 'editable_until').toLowerCase().trim();
  const editMins =
    Number(co.editWindowOverrideMinutes) > 0 ? Number(co.editWindowOverrideMinutes) : Number(data.editWindowMinutes) || 30;

  const customText = String(co.bannerCustomText || '');
  const promoText = String(co.bannerPromoText || '');
  const bannerImageSrc = sanitizedHttpsUrl(co.bannerImageUrl);
  const checkoutBannerImgMaxBlock = trustBadgeMaxBlockSize(co.bannerImageMaxHeightPx);

  const body =
    mode === 'custom'
      ? customText
      : bannerBodyText(mode, {minutes: editMins, custom: customText, promo: promoText});

  const showTrust = merchandisingFlag(trust.showRow, false);
  const secureText = String(trust.secureCheckoutText || '').trim();
  const returnText = String(trust.returnPolicyText || '').trim();
  const partnerText = String(trust.partnerDisclaimerText || '').trim();
  const trustBadgeSrc = sanitizedHttpsUrl(trust.rowImageUrl);
  const trustImgMaxBlock = trustBadgeMaxBlockSize(trust.rowImageMaxHeightPx);
  const secureAlign = trustSecureTextAlign(trust.secureCheckoutTextAlign);

  const hasBanner = showBanner && mode !== 'none' && (body.length > 0 || Boolean(bannerImageSrc));
  const hasTrust =
    showTrust && (secureText || returnText || partnerText || Boolean(trustBadgeSrc));
  const showTrustBadge = showTrust && Boolean(trustBadgeSrc);
  const hasTrustSecureCard = showTrust && Boolean(secureText);

  if (!hasBanner && !hasTrust) {
    return (
      <s-stack gap="none">
        <s-text />
      </s-stack>
    );
  }

  return (
    <s-stack gap="small" inlineSize="fill">
      {hasBanner ? (
        <s-stack gap="small" inlineSize="fill">
          {bannerImageSrc ? (
            <s-box
              background="subdued"
              borderRadius="base"
              overflow="hidden"
              maxInlineSize="100%"
              inlineSize="fill"
              {...(checkoutBannerImgMaxBlock !== 'none' ? {maxBlockSize: checkoutBannerImgMaxBlock} : {})}
            >
              <s-stack gap="none" alignItems="center" inlineSize="fill">
                <s-image
                  src={bannerImageSrc}
                  alt=""
                  loading="eager"
                  inlineSize="auto"
                  objectFit="contain"
                />
              </s-stack>
            </s-box>
          ) : null}
          <s-banner tone="info">
            {/\r?\n/.test(body) ? (
              <s-stack gap="extra-tight">
                {body.split(/\r?\n/).map((line, i) =>
                  line.trim() ? (
                    <s-text key={i}>{line}</s-text>
                  ) : null,
                )}
              </s-stack>
            ) : (
              <s-text>{body}</s-text>
            )}
          </s-banner>
        </s-stack>
      ) : null}

      {hasTrust ? (
        <s-stack gap="small" inlineSize="fill">
          {showTrustBadge ? (
            <s-box
              background="subdued"
              borderRadius="base"
              paddingBlock="none small"
              paddingInline="small"
              overflow="hidden"
              maxInlineSize="100%"
              inlineSize="fill"
              {...(trustImgMaxBlock !== 'none' ? {maxBlockSize: trustImgMaxBlock} : {})}
            >
              <s-stack gap="none" alignItems="center" inlineSize="fill">
                <s-image
                  src={trustBadgeSrc}
                  alt="Trusted checkout badges"
                  accessibilityRole="presentation"
                  loading="eager"
                  inlineSize="auto"
                  objectFit="contain"
                />
              </s-stack>
            </s-box>
          ) : null}
          {hasTrustSecureCard ? (
            <s-box
              border="base"
              borderRadius="base"
              paddingBlock="none small"
              paddingInline="small"
              background="subdued"
            >
              <s-stack gap="small" justifyContent="start" alignItems="stretch" inlineSize="fill">
                <s-stack gap="none" alignItems={secureAlign} inlineSize="fill">
                  <s-box inlineSize="auto" maxInlineSize="100%">
                    <s-text>{secureText}</s-text>
                  </s-box>
                </s-stack>
              </s-stack>
            </s-box>
          ) : null}
          {returnText ? (
            <s-banner tone="info">
              <s-stack gap="extra-tight">
                {returnText.split(/\r?\n/).map((line, i) =>
                  line.trim() ? (
                    <s-text key={`r-${i}`} type="small" tone="subdued">
                      {line}
                    </s-text>
                  ) : null,
                )}
              </s-stack>
            </s-banner>
          ) : null}
          {partnerText ? (
            <s-banner tone="info">
              <s-stack gap="extra-tight">
                {partnerText.split(/\r?\n/).map((line, i) =>
                  line.trim() ? (
                    <s-text key={`p-${i}`} type="small" tone="subdued">
                      {line}
                    </s-text>
                  ) : null,
                )}
              </s-stack>
            </s-banner>
          ) : null}
        </s-stack>
      ) : null}
    </s-stack>
  );
}
