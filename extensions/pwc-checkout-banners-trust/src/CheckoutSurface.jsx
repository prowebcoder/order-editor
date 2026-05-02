import '@shopify/ui-extensions/preact';
import {render} from 'preact';
import {useEffect, useState} from 'preact/hooks';
import {asBool, bannerBodyText, isHttpUrl, settingsRoot, shopDomainFromApi} from './helpers.js';
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
  const showBanner = asBool(co.showBanner);
  const mode = String(co.bannerMode || 'editable_until').toLowerCase().trim();
  const editMins =
    Number(co.editWindowOverrideMinutes) > 0 ? Number(co.editWindowOverrideMinutes) : Number(data.editWindowMinutes) || 30;

  const customText = String(co.bannerCustomText || '');
  const promoText = String(co.bannerPromoText || '');
  const bannerImageUrl = String(co.bannerImageUrl || '').trim();

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

  const hasBanner = showBanner && mode !== 'none' && (body.length > 0 || isHttpUrl(bannerImageUrl));
  const hasTrust =
    showTrust &&
    (payLabels ||
      secureText ||
      returnText ||
      partnerText ||
      isHttpUrl(trustImageUrl));

  if (!hasBanner && !hasTrust) {
    return (
      <s-stack gap="none">
        <s-text />
      </s-stack>
    );
  }

  return (
    <s-stack gap="base">
      {hasBanner ? (
        <s-stack gap="small">
          {isHttpUrl(bannerImageUrl) ? (
            <s-box border="base" borderRadius="base" overflow="hidden" maxInlineSize="100%">
              <s-image src={bannerImageUrl} alt="" />
            </s-box>
          ) : null}
          {mode === 'promo' || mode === 'editable_until' ? (
            <s-banner tone="info">
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
