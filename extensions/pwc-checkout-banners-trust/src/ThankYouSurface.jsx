import '@shopify/ui-extensions/preact';
import {render} from 'preact';
import {useEffect, useState} from 'preact/hooks';
import {asBool, bannerBodyText, isHttpUrl, settingsRoot, shopDomainFromApi} from './helpers.js';
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

  const showExclusive = asBool(ty.showExclusiveHeader);
  const exclusiveHeadline = String(ty.exclusiveHeadline || '').trim();
  const exclusiveSub = String(ty.exclusiveSubtext || '').trim();

  const showBanner = asBool(ty.showBanner);
  const mode = String(ty.bannerMode || 'editable_until').toLowerCase().trim();
  const editMins =
    Number(ty.editWindowOverrideMinutes) > 0 ? Number(ty.editWindowOverrideMinutes) : Number(data.editWindowMinutes) || 30;

  const customText = String(ty.bannerCustomText || '');
  const promoText = String(ty.bannerPromoText || '');
  const bannerImageUrl = String(ty.bannerImageUrl || '').trim();

  const body =
    mode === 'custom'
      ? customText
      : bannerBodyText(mode, {minutes: editMins, custom: customText, promo: promoText});

  const showTrust = asBool(trust.showRow);
  const payLabels = asBool(trust.showPaymentLabels);
  const secureText = String(trust.secureCheckoutText || '').trim();
  const returnText = String(trust.returnPolicyText || '').trim();
  const partnerText = String(trust.partnerDisclaimerText || '').trim();
  const trustImageUrl = String(trust.rowImageUrl || '').trim();

  const hasExclusive = showExclusive && (exclusiveHeadline.length > 0 || exclusiveSub.length > 0);
  const hasBanner = showBanner && mode !== 'none' && (body.length > 0 || isHttpUrl(bannerImageUrl));
  const hasTrust =
    showTrust &&
    (payLabels ||
      secureText ||
      returnText ||
      partnerText ||
      isHttpUrl(trustImageUrl));

  if (!hasExclusive && !hasBanner && !hasTrust) {
    return (
      <s-stack gap="none">
        <s-text />
      </s-stack>
    );
  }

  return (
    <s-stack gap="large">
      {hasExclusive ? (
        <s-stack gap="small-100">
          {exclusiveHeadline ? <s-heading>{exclusiveHeadline}</s-heading> : null}
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
        <s-stack gap="small">
          {isHttpUrl(bannerImageUrl) ? (
            <s-box border="base" borderRadius="base" overflow="hidden" maxInlineSize="100%">
              <s-image src={bannerImageUrl} alt="" />
            </s-box>
          ) : null}
          {mode === 'promo' || mode === 'editable_until' ? (
            <s-banner tone="success">
              <s-text>{body}</s-text>
            </s-banner>
          ) : (
            <s-stack gap="extra-tight">
              {body.split(/\r?\n/).map((line, i) =>
                line.trim() ? (
                  <s-text key={i}>{line}</s-text>
                ) : null,
              )}
            </s-stack>
          )}
        </s-stack>
      ) : null}

      {hasTrust ? (
        <s-box border="base" borderRadius="base" padding="base" background="subdued">
          <s-stack gap="small">
            {isHttpUrl(trustImageUrl) ? (
              <s-box maxInlineSize="100%" overflow="hidden" borderRadius="small">
                <s-image src={trustImageUrl} alt="" />
              </s-box>
            ) : null}
            {payLabels ? (
              <s-text tone="subdued">Visa · Mastercard · American Express · PayPal</s-text>
            ) : null}
            {secureText ? <s-text>{secureText}</s-text> : null}
            {returnText ? <s-text tone="subdued">{returnText}</s-text> : null}
            {partnerText ? <s-text tone="subdued">{partnerText}</s-text> : null}
          </s-stack>
        </s-box>
      ) : null}
    </s-stack>
  );
}
