import {useEffect, useMemo, useState} from "react";
import {useLoaderData} from "react-router";
import {boundary} from "@shopify/shopify-app-react-router/server";
import {authenticate} from "../shopify.server";
import {getSettings} from "../services/orderflex-settings.server";

async function fetchActiveSubscriptions(admin) {
  const res = await admin.graphql(
    `#graphql
      query ActiveSubscriptionsDashboard {
        currentAppInstallation {
          activeSubscriptions {
            status
          }
        }
      }`,
  );
  const json = await res.json();
  if (json.errors?.length) {
    throw new Error(json.errors.map((e) => e.message).join("; "));
  }
  return json.data?.currentAppInstallation?.activeSubscriptions ?? [];
}

export const loader = async ({request}) => {
  const {admin, session} = await authenticate.admin(request);
  const shop = session.shop;
  const settings = await getSettings(shop);

  let hasActiveBilling = false;
  try {
    const subs = await fetchActiveSubscriptions(admin);
    hasActiveBilling = subs.some((s) => String(s?.status || "").toUpperCase() === "ACTIVE");
  } catch {
    hasActiveBilling = false;
  }

  return {
    shop,
    hasActiveBilling,
    settings: {
      editWindowMinutes: settings.editWindowMinutes,
      allowAddressEdit: settings.allowAddressEdit,
      allowProductEdit: settings.allowProductEdit,
      enableUpsells: settings.enableUpsells,
      allowDiscountCodes: settings.allowDiscountCodes,
      upsellProductCount: settings.upsellProductIds.length,
      upsellCollectionCount: settings.upsellCollectionIds.length,
      checkoutOfferHeading: settings.checkoutOfferHeading,
    },
  };
};

export default function Index() {
  const {shop, settings, hasActiveBilling} = useLoaderData();

  const storageKey = useMemo(() => `pwc_order_editor:index_ui:${shop}`, [shop]);

  const [visible, setVisible] = useState({
    banner: true,
    setupGuide: true,
    calloutCard: true,
  });

  const [expanded, setExpanded] = useState({
    setupGuide: true,
    step1: false,
    step2: false,
    step3: false,
  });

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed?.visible) setVisible((v) => ({...v, ...parsed.visible}));
      if (parsed?.expanded) setExpanded((e) => ({...e, ...parsed.expanded}));
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify({visible, expanded}));
    } catch {
      // ignore
    }
  }, [expanded, storageKey, visible]);

  const step1Done =
    typeof settings.editWindowMinutes === "number" &&
    settings.editWindowMinutes > 0 &&
    (settings.allowAddressEdit || settings.allowProductEdit || settings.allowDiscountCodes);
  const step2Done =
    settings.upsellProductCount + settings.upsellCollectionCount > 0 &&
    Boolean(settings.checkoutOfferHeading?.trim()) &&
    settings.enableUpsells;
  const step3Effective = Boolean(hasActiveBilling);
  const progressDisplay = Number(step1Done) + Number(step2Done) + Number(step3Effective);

  return (
    <s-page heading="PWC : Order Editor">
      <s-button slot="primary-action" variant="primary" href="/app/orderflex">
        Open settings
      </s-button>
      <s-button slot="secondary-actions" variant="secondary" href="/app/pricing">
        View pricing
      </s-button>
      <s-button slot="secondary-actions" variant="tertiary" href="https://shopify.dev/docs/apps" target="_blank">
        Shopify app docs
      </s-button>

      {visible.banner ? (
        <s-banner dismissible onDismiss={() => setVisible((v) => ({...v, banner: false}))} tone="info">
          Choose a pricing tier by monthly order volume on{" "}
          <s-link href="/app/pricing">Pricing</s-link>; optional address validation is usage-billed at the
          published per-lookup rates. Customizing Shopify <strong>Checkout</strong> during checkout requires{" "}
          <strong>Shopify Plus</strong>.
        </s-banner>
      ) : null}

      {visible.setupGuide ? (
        <s-section>
          <s-grid gap="small">
            <s-grid gap="small-200">
              <s-grid gridTemplateColumns="1fr auto auto" gap="small-300" alignItems="center">
                <s-heading>Setup Guide</s-heading>
                <s-button
                  accessibilityLabel="Dismiss guide"
                  onClick={() => setVisible((v) => ({...v, setupGuide: false}))}
                  variant="tertiary"
                  tone="neutral"
                  icon="x"
                />
                <s-button
                  accessibilityLabel="Toggle setup guide"
                  onClick={() =>
                    setExpanded((e) => ({
                      ...e,
                      setupGuide: !e.setupGuide,
                    }))
                  }
                  variant="tertiary"
                  tone="neutral"
                  icon={expanded.setupGuide ? "chevron-up" : "chevron-down"}
                />
              </s-grid>
              <s-paragraph>
                Get post-purchase order editing configured end-to-end: rules, checkout offers, then billing.
              </s-paragraph>
              <s-paragraph color="subdued">{Math.min(progressDisplay, 3)} out of 3 steps completed</s-paragraph>
            </s-grid>

            <s-box
              borderRadius="base"
              border="base"
              background="base"
              display={expanded.setupGuide ? "auto" : "none"}
            >
              <s-box>
                <s-grid gridTemplateColumns="1fr auto" gap="base" padding="small">
                  <s-checkbox checked={step1Done} disabled label="Tune your edit rules" />
                  <s-button
                    onClick={() => setExpanded((e) => ({...e, step1: !e.step1}))}
                    accessibilityLabel="Toggle step 1 details"
                    variant="tertiary"
                    icon={expanded.step1 ? "chevron-up" : "chevron-down"}
                  />
                </s-grid>
                <s-box padding="small" paddingBlockStart="none" display={expanded.step1 ? "auto" : "none"}>
                  <s-box padding="base" background="subdued" borderRadius="base">
                    <s-grid gap="small-200">
                      <s-paragraph>
                        Decide how long customers can edit, and whether addresses, products, and discount codes can
                        change after checkout.
                      </s-paragraph>
                      <s-stack direction="inline" gap="small-200">
                        <s-button variant="primary" href="/app/orderflex">
                          Configure rules
                        </s-button>
                      </s-stack>
                    </s-grid>
                  </s-box>
                </s-box>
              </s-box>

              <s-divider />

              <s-box>
                <s-grid gridTemplateColumns="1fr auto" gap="base" padding="small">
                  <s-checkbox checked={step2Done} disabled label="Define upsell targeting" />
                  <s-button
                    onClick={() => setExpanded((e) => ({...e, step2: !e.step2}))}
                    accessibilityLabel="Toggle step 2 details"
                    variant="tertiary"
                    icon={expanded.step2 ? "chevron-up" : "chevron-down"}
                  />
                </s-grid>
                <s-box padding="small" paddingBlockStart="none" display={expanded.step2 ? "auto" : "none"}>
                  <s-box padding="base" background="subdued" borderRadius="base">
                    <s-grid gap="small-200">
                      <s-paragraph>
                        Choose products or collections shown in checkout, and keep headings consistent with your brand.
                      </s-paragraph>
                      <s-stack direction="inline" gap="small-200">
                        <s-button variant="primary" href="/app/orderflex">
                          Select upsells
                        </s-button>
                      </s-stack>
                    </s-grid>
                  </s-box>
                </s-box>
              </s-box>

              <s-divider />

              <s-box>
                <s-grid gridTemplateColumns="1fr auto" gap="base" padding="small">
                  <s-checkbox checked={step3Effective} disabled label="Finalize checkout copy + billing" />
                  <s-button
                    onClick={() => setExpanded((e) => ({...e, step3: !e.step3}))}
                    accessibilityLabel="Toggle step 3 details"
                    variant="tertiary"
                    icon={expanded.step3 ? "chevron-up" : "chevron-down"}
                  />
                </s-grid>
                <s-box padding="small" paddingBlockStart="none" display={expanded.step3 ? "auto" : "none"}>
                  <s-box padding="base" background="subdued" borderRadius="base">
                    <s-grid gap="small-200">
                      <s-paragraph>
                        Turn on checkout upsells, polish the heading, then choose the tier that fits your monthly order
                        volume.
                      </s-paragraph>
                      <s-stack direction="inline" gap="small-200">
                        <s-button variant="primary" href="/app/pricing">
                          Open pricing
                        </s-button>
                        <s-button tone="neutral" variant="tertiary" href="/app/orderflex">
                          Offer heading
                        </s-button>
                      </s-stack>
                    </s-grid>
                  </s-box>
                </s-box>
              </s-box>
            </s-box>
          </s-grid>
        </s-section>
      ) : null}

      {/* Status strip (professional, lightweight) */}
      <s-section padding="base">
        <s-grid
          gridTemplateColumns="@container (inline-size <= 400px) 1fr, 1fr auto 1fr auto 1fr"
          gap="small"
        >
          <s-clickable href="/app/orderflex" paddingBlock="small-400" paddingInline="small-100" borderRadius="base">
            <s-grid gap="small-300">
              <s-heading>Edit window</s-heading>
              <s-stack direction="inline" gap="small-200">
                <s-text>{settings.editWindowMinutes} min</s-text>
                <s-badge tone={settings.editWindowMinutes >= 30 ? "success" : "attention"}>
                  {settings.editWindowMinutes >= 30 ? "Healthy" : "Short"}
                </s-badge>
              </s-stack>
            </s-grid>
          </s-clickable>
          <s-divider direction="block" />
          <s-clickable href="/app/orderflex" paddingBlock="small-400" paddingInline="small-100" borderRadius="base">
            <s-grid gap="small-300">
              <s-heading>Upsells</s-heading>
              <s-stack direction="inline" gap="small-200">
                <s-text>{settings.enableUpsells ? "On" : "Off"}</s-text>
                <s-badge tone={settings.enableUpsells ? "success" : "neutral"}>{settings.enableUpsells ? "Live" : "Paused"}</s-badge>
              </s-stack>
            </s-grid>
          </s-clickable>
          <s-divider direction="block" />
          <s-clickable href="/app/pricing" paddingBlock="small-400" paddingInline="small-100" borderRadius="base">
            <s-grid gap="small-300">
              <s-heading>Billing</s-heading>
              <s-stack direction="inline" gap="small-200">
                <s-text>{hasActiveBilling ? "Active" : "Choose"}</s-text>
                <s-badge tone={hasActiveBilling ? "success" : "info"}>{hasActiveBilling ? "Subscribed" : "Plans"}</s-badge>
              </s-stack>
            </s-grid>
          </s-clickable>
        </s-grid>
      </s-section>

      {visible.calloutCard ? (
        <s-section>
          <s-grid gridTemplateColumns="1fr auto" gap="small-400" alignItems="start">
            <s-grid
              gridTemplateColumns="@container (inline-size <= 480px) 1fr, auto auto"
              gap="base"
              alignItems="center"
            >
              <s-grid gap="small-200">
                <s-heading>Everything customers need after checkout</s-heading>
                <s-paragraph color="subdued">
                  Tune editing rules in Settings, polish checkout upsells, then lock billing to the plan that fits your
                  order volume.
                </s-paragraph>
                <s-stack direction="inline" gap="small-200">
                  <s-button href="/app/orderflex">Open settings</s-button>
                  <s-button tone="neutral" variant="tertiary" href="/app/pricing">
                    View pricing
                  </s-button>
                </s-stack>
              </s-grid>
              <s-stack alignItems="center">
                <s-box maxInlineSize="200px" borderRadius="base" overflow="hidden">
                  <s-image
                    src="https://cdn.shopify.com/static/images/polaris/patterns/callout.png"
                    alt=""
                    aspectRatio="1/0.5"
                  />
                </s-box>
              </s-stack>
            </s-grid>
            <s-button
              onClick={() => setVisible((v) => ({...v, calloutCard: false}))}
              icon="x"
              tone="neutral"
              variant="tertiary"
              accessibilityLabel="Dismiss card"
            />
          </s-grid>
        </s-section>
      ) : null}

      <s-stack alignItems="center" paddingBlock="large">
        <s-text color="subdued">
          Merchant: <s-text fontWeight="medium">{shop}</s-text>. Need help integrating checkout UI extensions? See{" "}
          <s-link href="https://shopify.dev/docs/api/checkout-ui-extensions/latest" target="_blank">
            Checkout UI docs
          </s-link>
          .
        </s-text>
      </s-stack>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
