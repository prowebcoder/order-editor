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
  render(<ThankYouChrome />, document.body);
};

function ThankYouChrome() {
  const [shopDomain, setShopDomain] = useState('');
  const portal = String(settingsRoot(shopify).portal_base_url || '').trim();

  useEffect(() => {
    setShopDomain(shopDomainFromApi(shopify));
  }, []);

  const {data, loading, error} = usePublicMerchConfig(portal, shopDomain);

  if (loading) {
    return (
      <s-stack gap="none">
        <s-text tone="neutral">Loading thank-you message…</s-text>
      </s-stack>
    );
  }

  if (error || !data?.ok) {
    return (
      <s-banner tone="warning">
        <s-text>{error || "Could not load thank-you display settings."}</s-text>
      </s-banner>
    );
  }

  const ty = data.thankyou || {};
  const trust = data.trust || {};

  const showExclusive = merchandisingFlag(ty.showExclusiveHeader, false);
  const exclusiveHeadline = String(ty.exclusiveHeadline || '').trim();
  const exclusiveSub = String(ty.exclusiveSubtext || '').trim();

  const showBanner = merchandisingFlag(ty.showBanner, true);
  const mode = String(ty.bannerMode || 'editable_until').toLowerCase().trim();
  const editMins =
    Number(ty.editWindowOverrideMinutes) > 0 ? Number(ty.editWindowOverrideMinutes) : Number(data.editWindowMinutes) || 30;

  const customText = String(ty.bannerCustomText || '');
  const promoText = String(ty.bannerPromoText || '');
  const bannerImageSrc = sanitizedHttpsUrl(ty.bannerImageUrl);
  const thankyouBannerImgMaxBlock = trustBadgeMaxBlockSize(ty.bannerImageMaxHeightPx);

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

  const hasExclusive = showExclusive && (exclusiveHeadline.length > 0 || exclusiveSub.length > 0);
  const hasBanner = showBanner && mode !== 'none' && (body.length > 0 || Boolean(bannerImageSrc));
  const hasTrust =
    showTrust && (secureText || returnText || partnerText || Boolean(trustBadgeSrc));
  const showTrustBadge = showTrust && Boolean(trustBadgeSrc);
  const hasTrustSecureCard = showTrust && Boolean(secureText);

  if (!hasExclusive && !hasBanner && !hasTrust) {
    return (
      <s-stack gap="none">
        <s-text />
      </s-stack>
    );
  }

  return (
    <s-stack gap="base" inlineSize="fill">
      {hasExclusive ? (
        <s-stack gap="small">
          {exclusiveHeadline ? (
            <s-stack direction="inline" gap="base" alignItems="center">
              <s-icon type="check-circle" size="base" tone="success" />
              <s-heading>{exclusiveHeadline}</s-heading>
            </s-stack>
          ) : null}
          {exclusiveSub ? (
            <s-stack gap="extra-tight">
              {exclusiveSub.split(/\r?\n/).map((line, i) =>
                line.trim() ? (
                  <s-text key={i} tone="subdued">
                    {line}
                  </s-text>
                ) : null,
              )}
            </s-stack>
          ) : null}
        </s-stack>
      ) : null}

      {hasBanner ? (
        <s-stack gap="base" inlineSize="fill">
          {bannerImageSrc ? (
            <s-box
              background="subdued"
              borderRadius="base"
              overflow="hidden"
              maxInlineSize="100%"
              inlineSize="fill"
              {...(thankyouBannerImgMaxBlock !== 'none' ? {maxBlockSize: thankyouBannerImgMaxBlock} : {})}
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
          <s-banner tone={mode === 'promo' || mode === 'editable_until' ? 'success' : 'info'}>
            <s-stack direction="inline" gap="base" alignItems="start">
              <s-icon
                type={mode === 'promo' || mode === 'editable_until' ? 'check-circle' : 'info'}
                size="base"
                tone={mode === 'promo' || mode === 'editable_until' ? 'success' : 'info'}
              />
              {/\r?\n/.test(body) ? (
                <s-stack gap="small">
                  {body.split(/\r?\n/).map((line, i) =>
                    line.trim() ? (
                      <s-text key={i}>{line}</s-text>
                    ) : null,
                  )}
                </s-stack>
              ) : (
                <s-text>{body}</s-text>
              )}
            </s-stack>
          </s-banner>
        </s-stack>
      ) : null}

      {hasTrust ? (
        <s-stack gap="base" inlineSize="fill">
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
