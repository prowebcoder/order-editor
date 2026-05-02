/**
 * Shopify usage billing for optional address validation.
 * Caps and terms mirror `shopify.server.js` usage line items; caller records per save when opted in.
 */

import crypto from "node:crypto";

const QUERY_SUBSCRIPTION_USAGE = `#graphql
  query AddressValidationSubscriptionUsage {
    currentAppInstallation {
      activeSubscriptions {
        status
        lineItems {
          id
          plan {
            pricingDetails {
              __typename
              ... on AppUsagePricing {
                terms
                cappedAmount {
                  amount
                  currencyCode
                }
                balanceUsed {
                  amount
                  currencyCode
                }
              }
            }
          }
        }
      }
    }
  }
`;

const MUT_CREATE_USAGE = `#graphql
  mutation AddressValidationUsageRecordCreate(
    $subscriptionLineItemId: ID!
    $price: MoneyInput!
    $description: String!
    $idempotencyKey: String
  ) {
    appUsageRecordCreate(
      subscriptionLineItemId: $subscriptionLineItemId
      price: $price
      description: $description
      idempotencyKey: $idempotencyKey
    ) {
      userErrors {
        field
        message
      }
      appUsageRecord {
        id
      }
    }
  }
`;

/** Per-order validation fee in USD (matches pricing disclosure). */
export const ADDRESS_VALIDATION_RATE_USD = {
  US: 0.01,
  AU: 0.015,
  NZ: 0.03,
  GB: 0.03,
  DEFAULT: 0.02,
};

export function validationRateUsd(countryCode) {
  const code = String(countryCode || "")
    .trim()
    .toUpperCase();
  if (!code) return ADDRESS_VALIDATION_RATE_USD.DEFAULT;
  const rate = ADDRESS_VALIDATION_RATE_USD[code];
  if (typeof rate === "number") return rate;
  return ADDRESS_VALIDATION_RATE_USD.DEFAULT;
}

function parseMoneyAmount(value) {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function findActiveUsageLineItemFromData(data) {
  const subs = data?.currentAppInstallation?.activeSubscriptions ?? [];
  const active = subs.find(
    (s) => String(s?.status || "").toUpperCase() === "ACTIVE",
  );
  if (!active?.lineItems) return null;
  return (
    active.lineItems.find((li) => {
      const t = String(li?.plan?.pricingDetails?.__typename || "");
      return t === "AppUsagePricing";
    }) || null
  );
}

/**
 * @param {{ graphql: Function }} admin
 * @returns {Promise<string | null>}
 */
export async function getAddressValidationUsageLineItemId(admin) {
  const res = await admin.graphql(QUERY_SUBSCRIPTION_USAGE);
  const json = await res.json();
  if (json.errors?.length) {
    throw new Error(json.errors.map((e) => e.message).join("; "));
  }
  const line = findActiveUsageLineItemFromData(json.data);
  return line?.id || null;
}

/**
 * Current-period usage for the app's usage-priced line (address validation).
 *
 * @param {{ graphql: Function }} admin
 * @returns {Promise<{ ok: true, lineItemId: string, terms: string, usedAmount: number, capAmount: number, currencyCode: string } | { ok: false, message: string }>}
 */
export async function getAddressValidationUsageSummary(admin) {
  const res = await admin.graphql(QUERY_SUBSCRIPTION_USAGE);
  const json = await res.json();
  if (json.errors?.length) {
    return {
      ok: false,
      message: json.errors.map((e) => e.message).join("; "),
    };
  }
  const line = findActiveUsageLineItemFromData(json.data);
  const details = line?.plan?.pricingDetails;
  if (!line?.id || details?.__typename !== "AppUsagePricing") {
    return {
      ok: false,
      message:
        "Usage totals appear here once your active plan includes address validation billing. If you haven’t subscribed yet, open Pricing and pick a tier.",
    };
  }
  const currencyCode = details.cappedAmount?.currencyCode || details.balanceUsed?.currencyCode || "USD";
  const capAmount =
    parseMoneyAmount(details.cappedAmount?.amount) ?? 0;
  const usedAmount =
    parseMoneyAmount(details.balanceUsed?.amount) ?? 0;
  return {
    ok: true,
    lineItemId: line.id,
    terms: String(details.terms || ""),
    usedAmount,
    capAmount,
    currencyCode,
  };
}

/** Stable key so retries / duplicate submits do not double-charge for the same address payload. */
export function buildShippingSaveIdempotencyKey(orderId, shippingAddress) {
  const canon = canonicalShipping(shippingAddress);
  const digest = crypto.createHash("sha256").update(canon).digest("hex").slice(0, 40);
  return `${String(orderId).split("/").pop() || orderId}:${digest}`;
}

function canonicalShipping(addr) {
  const o =
    addr && typeof addr === "object"
      ? addr
      : {};
  const keys = [
    "firstName",
    "lastName",
    "address1",
    "address2",
    "city",
    "provinceCode",
    "zip",
    "countryCode",
    "phone",
  ];
  const sorted = {};
  for (const k of keys) {
    sorted[k] = String(o[k] ?? "").trim();
  }
  return JSON.stringify(sorted);
}

/**
 * Records a Shopify usage charge for one billed address save (when merchant opted in).
 *
 * @param {{ graphql: Function }} admin - Authenticated admin client
 * @param {object} params
 */
export async function recordAddressValidationUsage(admin, params) {
  const { description, countryCode, idempotencyKey } = params;
  const lineItemId = await getAddressValidationUsageLineItemId(admin);
  if (!lineItemId) {
    throw new Error(
      "No active subscription with a usage line item — ensure the shop has accepted the plan that includes address validation billing.",
    );
  }

  const amount = validationRateUsd(countryCode);

  const res = await admin.graphql(MUT_CREATE_USAGE, {
    variables: {
      subscriptionLineItemId: lineItemId,
      price: { amount, currencyCode: "USD" },
      description: description || `Address validation (${countryCode || "INTL"})`,
      idempotencyKey: idempotencyKey ?? null,
    },
  });
  const json = await res.json();
  if (json.errors?.length) {
    throw new Error(json.errors.map((e) => e.message).join("; "));
  }
  const errs = json.data?.appUsageRecordCreate?.userErrors ?? [];
  if (errs.length) {
    throw new Error(errs.map((e) => e.message).join("; "));
  }
  return json.data?.appUsageRecordCreate?.appUsageRecord ?? null;
}

/**
 * After a successful order shipping-address update: record plan usage (rates/cap on Pricing).
 * Never throws — logs and continues so checkout/edit flows stay reliable.
 */
export async function tryRecordAddressValidationAfterShippingSave(admin, ctx) {
  const { orderId, shippingAddress } = ctx;
  if (!shippingAddress?.countryCode) {
    return;
  }
  try {
    await recordAddressValidationUsage(admin, {
      countryCode: shippingAddress.countryCode,
      description: `Shipping address save (${String(orderId).split("/").pop() || orderId})`,
      idempotencyKey: buildShippingSaveIdempotencyKey(orderId, shippingAddress),
    });
  } catch (error) {
    console.error("[address-validation-billing] usage record failed:", error?.message || error);
  }
}
