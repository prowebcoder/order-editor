import { Form, useActionData, useLoaderData } from "react-router";
import { useEffect } from "react";
import { authenticate } from "../shopify.server";

const PLANS = {
  starter: {
    id: "starter",
    title: "Starter",
    range: "0 - 2,500 orders",
    monthlyAmount: 99,
    yearlyAmount: 999,
    savings: "Save 16%",
    trialDays: 7,
    addOnPrice: "29.99",
    featured: false,
  },
  growth: {
    id: "growth",
    title: "Growth",
    range: "2,500 - 5,000 orders",
    monthlyAmount: 199,
    yearlyAmount: 1999,
    savings: "Save 16%",
    trialDays: 14,
    addOnPrice: "49.99",
    featured: true,
  },
  scale: {
    id: "scale",
    title: "Scale",
    range: "5,000 - 10,000 orders",
    monthlyAmount: 399,
    yearlyAmount: 3999,
    savings: "Save 16%",
    trialDays: 14,
    addOnPrice: "99.99",
    featured: false,
  },
  pro: {
    id: "pro",
    title: "Pro",
    range: "10,000 - 20,000 orders",
    monthlyAmount: 599,
    yearlyAmount: 6000,
    savings: "Save 17%",
    trialDays: 14,
    addOnPrice: "199.99",
    featured: false,
  },
};
const BILLING_TEST_MODE = true;

async function adminGraphql(admin, query, variables = {}) {
  const response = await admin.graphql(query, { variables });
  const json = await response.json();
  if (json.errors?.length) {
    throw new Error(json.errors.map((e) => e.message).join("; "));
  }
  return json.data;
}

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const data = await adminGraphql(
    admin,
    `#graphql
    query ActiveSubscriptions {
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

  return {
    shop: session.shop,
    activeSubscriptions: data.currentAppInstallation?.activeSubscriptions ?? [],
  };
};

export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const form = await request.formData();
  const planId = String(form.get("planId") || "");
  const billingCycle = String(form.get("billingCycle") || "monthly");
  const selectedPlan = PLANS[planId];

  if (!selectedPlan) {
    return { ok: false, message: "Invalid plan selected." };
  }

  const amount = billingCycle === "yearly" ? selectedPlan.yearlyAmount : selectedPlan.monthlyAmount;
  const interval = billingCycle === "yearly" ? "ANNUAL" : "EVERY_30_DAYS";
  const requestUrl = new URL(request.url);
  const returnUrl = new URL("/app/payments", requestUrl.origin);
  returnUrl.searchParams.set("shop", session.shop);
  const hostParam = requestUrl.searchParams.get("host");
  if (hostParam) {
    returnUrl.searchParams.set("host", hostParam);
  }

  const response = await adminGraphql(
    admin,
    `#graphql
    mutation AppSubscriptionCreate(
      $name: String!
      $lineItems: [AppSubscriptionLineItemInput!]!
      $returnUrl: URL!
      $trialDays: Int
      $test: Boolean
    ) {
      appSubscriptionCreate(
        name: $name
        returnUrl: $returnUrl
        trialDays: $trialDays
        test: $test
        lineItems: $lineItems
      ) {
        confirmationUrl
        userErrors {
          field
          message
        }
      }
    }`,
    {
      name: `OrderFlex ${selectedPlan.title} (${billingCycle})`,
      returnUrl: returnUrl.toString(),
      trialDays: selectedPlan.trialDays,
      test: BILLING_TEST_MODE,
      lineItems: [
        {
          plan: {
            appRecurringPricingDetails: {
              price: {
                amount,
                currencyCode: "USD",
              },
              interval,
            },
          },
        },
      ],
    },
  );

  const payload = response.appSubscriptionCreate;
  if (payload.userErrors?.length) {
    return { ok: false, message: payload.userErrors.map((error) => error.message).join("; ") };
  }
  if (!payload.confirmationUrl) {
    return { ok: false, message: "Unable to start billing approval flow." };
  }

  return { ok: true, confirmationUrl: payload.confirmationUrl };
};

export default function PaymentsPage() {
  const { shop, activeSubscriptions } = useLoaderData();
  const actionData = useActionData();
  useEffect(() => {
    if (actionData?.confirmationUrl) {
      if (window.top) {
        window.top.location.href = actionData.confirmationUrl;
      } else {
        window.location.href = actionData.confirmationUrl;
      }
    }
  }, [actionData]);

  const plans = [
    {
      id: "starter",
      range: "0 - 2,500 orders",
      monthly: "$99",
      yearly: "$999/year",
      addOnPrice: "29.99",
      savings: "Save 16%",
      overage: "Optional address validation: US $0.01, UK $0.03, NZ $0.03, AU $0.015 per order.",
      trial: "7-day free trial",
      featured: false,
    },
    {
      id: "growth",
      range: "2,500 - 5,000 orders",
      monthly: "$199",
      yearly: "$1,999/year",
      addOnPrice: "49.99",
      savings: "Save 16%",
      overage: "Optional address validation: US $0.01, UK $0.03, NZ $0.03, AU $0.015 per order.",
      trial: "14-day free trial",
      featured: true,
    },
    {
      id: "scale",
      range: "5,000 - 10,000 orders",
      monthly: "$399",
      yearly: "$3,999/year",
      addOnPrice: "99.99",
      savings: "Save 16%",
      overage: "Optional address validation: US $0.01, UK $0.03, NZ $0.03, AU $0.015 per order.",
      trial: "14-day free trial",
      featured: false,
    },
    {
      id: "pro",
      range: "10,000 - 20,000 orders",
      monthly: "$599",
      yearly: "$6,000/year",
      addOnPrice: "199.99",
      savings: "Save 17%",
      overage: "Optional address validation: US $0.01, UK $0.03, NZ $0.03, AU $0.015 per order.",
      trial: "14-day free trial",
      featured: false,
    },
  ];
  const activePlanNames = activeSubscriptions.map((sub) => sub.name);

  return (
    <s-page heading="Payments">
      <s-section>
        <s-grid gap="small-300">
          <s-heading>Usage-based pricing</s-heading>
          <s-paragraph color="subdued">
            Pick a plan based on monthly order volume. Upgrade or downgrade anytime as your store grows.
          </s-paragraph>
        </s-grid>
      </s-section>

      <s-section>
        {actionData?.message ? (
          <s-banner tone={actionData.ok ? "success" : "critical"}>{actionData.message}</s-banner>
        ) : null}
        {activeSubscriptions.length ? (
          <s-banner tone="success">
            Active subscription{activeSubscriptions.length > 1 ? "s" : ""}: {activePlanNames.join(", ")}
          </s-banner>
        ) : (
          <s-banner tone="info">No active subscription found for {shop}. Select a plan below to continue.</s-banner>
        )}
      </s-section>

      <s-section>
        <s-grid columns="repeat(4, minmax(0, 1fr))" gap="base">
          {plans.map((plan) => (
            <s-box
              key={plan.id}
              border="base"
              borderRadius="base"
              padding="base"
              background={plan.featured ? "strong" : "base"}
            >
              <s-grid gap="small-300">
                <s-text color="subdued">{plan.range}</s-text>
                <s-stack direction="inline" gap="small-200" alignItems="end">
                  <s-heading>{plan.monthly}</s-heading>
                  <s-text color="subdued">/ month</s-text>
                  <s-text tone="critical">${plan.addOnPrice}</s-text>
                </s-stack>
                <s-text color="success">
                  or {plan.yearly} and {plan.savings}
                </s-text>
                <s-paragraph color="subdued">{plan.overage}</s-paragraph>
                <s-divider />
                <s-grid gap="small">
                  <s-text>Includes:</s-text>
                  <s-unordered-list>
                    <s-list-item>Access to all core order edit features</s-list-item>
                    <s-list-item>Unlimited order edits</s-list-item>
                    <s-list-item>Checkout upsell integration</s-list-item>
                    <s-list-item>Email support</s-list-item>
                  </s-unordered-list>
                </s-grid>
                <s-grid gap="small">
                  <Form method="post">
                    <input type="hidden" name="planId" value={plan.id} />
                    <input type="hidden" name="billingCycle" value="monthly" />
                    <s-button type="submit" variant={plan.featured ? "primary" : "secondary"}>
                      Choose monthly
                    </s-button>
                  </Form>
                  <Form method="post">
                    <input type="hidden" name="planId" value={plan.id} />
                    <input type="hidden" name="billingCycle" value="yearly" />
                    <s-button type="submit" variant="tertiary" tone="neutral">
                      Choose yearly
                    </s-button>
                  </Form>
                </s-grid>
                <s-text color="subdued">{plan.trial}</s-text>
              </s-grid>
            </s-box>
          ))}
        </s-grid>
      </s-section>

      <s-section heading="Billing notes">
        <s-box border="base" borderRadius="base" padding="base">
          <s-unordered-list>
            <s-list-item>All charges are billed in USD.</s-list-item>
            <s-list-item>Recurring and usage-based charges are billed every 30 days.</s-list-item>
            <s-list-item>Address validation usage is charged only when enabled.</s-list-item>
          </s-unordered-list>
        </s-box>
      </s-section>
    </s-page>
  );
}
