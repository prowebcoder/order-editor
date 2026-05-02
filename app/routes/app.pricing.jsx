import { useEffect, useMemo, useState } from "react";

import { useLoaderData, useNavigate } from "react-router";

import { authenticate } from "../shopify.server";

import { PricingCard } from "../components/PricingCard";

async function fetchActiveSubscriptions(admin) {
  const res = await admin.graphql(
    `#graphql

      query ActiveSubscriptionsPricing {

        currentAppInstallation {

          activeSubscriptions {

            id

            name

            status

            lineItems {

              plan {

                pricingDetails {

                  __typename

                  ... on AppRecurringPricing {

                    price {

                      amount

                      currencyCode

                    }

                    interval

                  }

                }

              }

            }

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

function subscriptionMatchesBillingKey(subscription, billingKey) {
  const needle = billingKey.replace(/_/g, " ").toLowerCase();

  const name = String(subscription?.name || "").toLowerCase();

  return name.includes(billingKey) || name.includes(needle);
}

function findActiveBillingKey(activeSubscriptions, keys) {
  const active =
    activeSubscriptions.find(
      (s) => String(s?.status || "").toUpperCase() === "ACTIVE",
    ) || null;

  if (!active) return null;

  const lineItems = active.lineItems ?? [];

  for (const key of keys) {
    if (subscriptionMatchesBillingKey(active, key)) return key;

    for (const li of lineItems) {
      const amount = Number(li?.plan?.pricingDetails?.price?.amount ?? "");

      const interval = String(
        li?.plan?.pricingDetails?.interval || "",
      ).toUpperCase();

      if (
        key.includes("starter") &&
        interval === "EVERY_30_DAYS" &&
        amount === 99
      )
        return key;

      if (
        key.includes("growth") &&
        interval === "EVERY_30_DAYS" &&
        amount === 199
      )
        return key;

      if (
        key.includes("scale") &&
        interval === "EVERY_30_DAYS" &&
        amount === 399
      )
        return key;

      if (key.includes("pro") && interval === "EVERY_30_DAYS" && amount === 599)
        return key;

      if (
        key.includes("yearly") ||
        key.endsWith("_999") ||
        key.endsWith("_1999")
      ) {
        if (interval === "ANNUAL") {
          if (key.includes("starter") && amount === 999) return key;

          if (key.includes("growth") && amount === 1999) return key;

          if (key.includes("scale") && amount === 3999) return key;

          if (key.includes("pro") && amount === 6000) return key;
        }
      }
    }
  }

  return null;
}

function billingIntervalFromKey(key) {
  if (!key) return "monthly";

  return key.includes("yearly") ? "yearly" : "monthly";
}

function yearlyPriceParts(yearlyLine) {
  const priceMatch = yearlyLine?.match(/\$([\d,]+)\s*\/\s*year/);

  const saveMatch = yearlyLine?.match(/save\s+(\d+)/i);

  return {
    headline: priceMatch ? `$${priceMatch[1]}` : null,

    saveHint: saveMatch
      ? `Save ${saveMatch[1]}% vs paying monthly • billed annually`
      : null,
  };
}

/** Strike price when showing yearly: monthly list × 12 (whole dollars). */

function annualStrikeFromMonthlyListLabel(monthlyListLabel) {
  const m = String(monthlyListLabel || "").match(/\$([\d,]+(?:\.\d+)?)/);

  if (!m) return null;

  const monthly = Number.parseFloat(m[1].replace(/,/g, ""));

  if (!Number.isFinite(monthly)) return null;

  const annual = Math.round(monthly * 12);

  return `$${annual.toLocaleString("en-US")}`;
}

/** Product capabilities shipped with the app — shown inside every tier card */

const APP_FEATURES = [
  "Signed self-service edit link for customers",

  "Edit rules: timing, address, products, discounts",

  "Checkout upsell + post-checkout extensions",

  "Customer Account + order-status UI extensions",

  "Checkout banners and trust surfaces (when configured)",

  "Theme extension for storefront edit entry",

  "Optional address validation (usage-based when enabled)",
];

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);

  let activeSubscriptions = [];

  try {
    activeSubscriptions = await fetchActiveSubscriptions(admin);
  } catch {
    activeSubscriptions = [];
  }

  const billingPlanKeys = [
    "starter_monthly_99",

    "starter_yearly_999",

    "growth_monthly_199",

    "growth_yearly_1999",

    "scale_monthly_399",

    "scale_yearly_3999",

    "pro_monthly_599",

    "pro_yearly_6000",
  ];

  let activeBillingKey = findActiveBillingKey(
    activeSubscriptions,
    billingPlanKeys,
  );

  return {
    shop: session.shop,

    activeSubscriptions,

    activeBillingKey,

    hasBillingError: new URL(request.url).searchParams.get("error"),

    updated: new URL(request.url).searchParams.get("updated") === "true",
  };
};

export default function PricingPage() {
  const navigate = useNavigate();

  const { activeBillingKey, hasBillingError, updated } = useLoaderData();

  const [billingInterval, setBillingInterval] = useState(() =>
    billingIntervalFromKey(activeBillingKey),
  );

  useEffect(() => {
    setBillingInterval(billingIntervalFromKey(activeBillingKey));
  }, [activeBillingKey]);

  useEffect(() => {
    if (updated || hasBillingError) {
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [hasBillingError, updated]);

  const tierPlans = useMemo(
    () => [
      {
        id: "starter",

        tier: "0 — 2,500 orders / month",

        billingMonthly: "starter_monthly_99",

        billingYearly: "starter_yearly_999",

        listPrice: "$99",

        promoPrice: "$29.99",

        yearlyLine: "or $999/year and save 16%",

        trialFooter: "7-day free trial",

        featuredText: null,

        supportLine: "Email support from the developer",
      },

      {
        id: "growth",

        tier: "2,500 — 5,000 orders / month",

        billingMonthly: "growth_monthly_199",

        billingYearly: "growth_yearly_1999",

        listPrice: "$199",

        promoPrice: "$49.99",

        yearlyLine: "or $1,999/year and save 16%",

        trialFooter: "14-day free trial",

        featuredText: "Most popular",

        supportLine:
          "Shared Slack channel with the team; onboarding session included",
      },

      {
        id: "scale",

        tier: "5,000 — 10,000 orders / month",

        billingMonthly: "scale_monthly_399",

        billingYearly: "scale_yearly_3999",

        listPrice: "$399",

        promoPrice: "$99.99",

        yearlyLine: "or $3,999/year and save 16%",

        trialFooter: "14-day free trial",

        featuredText: null,

        supportLine:
          "Shared Slack channel with the team; onboarding session included",
      },

      {
        id: "pro",

        tier: "10,000 — 20,000 orders / month",

        billingMonthly: "pro_monthly_599",

        billingYearly: "pro_yearly_6000",

        listPrice: "$599",

        promoPrice: "$199.99",

        yearlyLine: "or $6,000/year and save 17%",

        trialFooter: "14-day free trial",

        featuredText: null,

        supportLine:
          "Priority 24/7 support via Slack; onboarding session included",
      },
    ],

    [],
  );

  return (
    <s-page heading="PWC : Order Editor · Pricing" inlineSize="base">
      <s-button
        slot="primary-action"
        variant="tertiary"
        onClick={() => navigate("/app")}
      >
        Back to dashboard
      </s-button>

      <s-stack direction="block" gap="large">
        {updated ? (
          <s-banner tone="success">
            <s-text>
              Billing finished. If you don&apos;t see &quot;Active
              subscription&quot; yet, refresh this page.
            </s-text>
          </s-banner>
        ) : null}

        {hasBillingError ? (
          <s-banner tone="critical">
            <s-text>
              Something went wrong starting billing ({hasBillingError}). Please
              try again.
            </s-text>
          </s-banner>
        ) : null}

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "24px",
            width: "100%",
          }}
        >
          <div
            role="group"
            aria-label="Monthly or yearly billing"
            style={{
              display: "inline-flex",
              gap: "2px",
              padding: "4px",
              borderRadius: "10px",
              background: "#E4E9EC",
              border: "1px solid #CBD1D6",
              boxSizing: "border-box",
              boxShadow: "inset 0 1px 1px rgba(0,0,0,0.04)",
            }}
          >
            {[
              ["monthly", "Monthly"],
              ["yearly", "Yearly"],
            ].map(([key, label]) => {
              const selected = billingInterval === key;
              return (
                <button
                  key={key}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setBillingInterval(key)}
                  style={{
                    appearance: "none",
                    cursor: "pointer",
                    WebkitAppearance: "none",
                    padding: "10px 26px",
                    borderRadius: "8px",
                    fontSize: "14px",
                    fontFamily: "inherit",
                    fontWeight: selected ? 600 : 550,
                    lineHeight: 1.25,
                    color: selected ? "#FFFFFF" : "#2E3134",
                    background: selected ? "#111213" : "#FFFFFF",
                    border: selected
                      ? "1px solid #111213"
                      : "1px solid #DDE1E5",
                    boxShadow: selected
                      ? "0 1px 2px rgba(0, 0, 0, 0.16)"
                      : "0 1px 2px rgba(0, 0, 0, 0.04)",
                    minWidth: "124px",
                    transition:
                      "background 120ms ease, color 120ms ease, box-shadow 120ms ease",
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "row",
              flexWrap: "wrap",
              alignItems: "stretch",
              alignContent: "flex-start",
              gap: "32px",
              width: "100%",
              maxWidth: "100%",
              boxSizing: "border-box",
              paddingBottom: "8px",
              marginTop: "4px",
            }}
          >
            {tierPlans.map((plan) => {
              const isMonthlyActive = activeBillingKey === plan.billingMonthly;

              const isYearlyActive = activeBillingKey === plan.billingYearly;

              const isPlanActive = isMonthlyActive || isYearlyActive;

              const { headline: yearlyHeadline, saveHint } = yearlyPriceParts(
                plan.yearlyLine,
              );

              const isYear = billingInterval === "yearly";

              const headlinePrice = isYear
                ? yearlyHeadline || plan.promoPrice
                : plan.promoPrice;

              const annualStrike = annualStrikeFromMonthlyListLabel(
                plan.listPrice,
              );

              const strikethroughPrice = isYear
                ? annualStrike || plan.listPrice
                : plan.listPrice;

              const priceHint =
                isYear && saveHint
                  ? saveHint
                  : !isYear && plan.trialFooter
                    ? `${plan.trialFooter} • cancel anytime`
                    : null;

              const intervalMatches =
                (!isYear && isMonthlyActive) || (isYear && isYearlyActive);

              const buttonHref = `/app/billing/${isYear ? plan.billingYearly : plan.billingMonthly}`;

              let buttonLabel = isYear
                ? "Subscribe yearly"
                : "Subscribe monthly";

              if (intervalMatches) {
                buttonLabel = isYear ? "Active (yearly)" : "Active (monthly)";
              }

              const features = [
                ...APP_FEATURES,

                `Support: ${plan.supportLine}`,
              ];

              return (
                <div
                  key={plan.id}
                  style={{
                    boxSizing: "border-box",
                    flex: "1 1 calc((100% - 32px) / 2)",
                    minWidth: "min(100%, 280px)",
                    display: "flex",
                    flexDirection: "column",
                    alignSelf: "stretch",
                  }}
                >
                  <PricingCard
                    title={plan.tier}
                    description=""
                    strikethroughPrice={strikethroughPrice}
                    headlinePrice={headlinePrice}
                    frequency={isYear ? "year" : "month"}
                    priceHint={priceHint}
                    features={features}
                    featuredText={plan.featuredText || undefined}
                    isCurrentPlan={isPlanActive}
                    button={{
                      content: buttonLabel,
                      href: buttonHref,
                      variant:
                        intervalMatches || plan.featuredText
                          ? "primary"
                          : "secondary",
                      disabled: intervalMatches,
                    }}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </s-stack>
    </s-page>
  );
}
