import "@shopify/shopify-app-react-router/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  BillingInterval,
  shopifyApp,
} from "@shopify/shopify-app-react-router/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import prisma from "./db.server";

/**
 * OAuth scopes on the offline/online Admin token.
 * `SCOPES` env (CLI / hosting) is the baseline; `fileCreate`/Files uploads always need `write_files`.
 */
function resolveScopes() {
  const fallback =
    "read_files,write_files,write_products,read_orders,write_orders,read_customers,write_order_edits";
  const raw = process.env.SCOPES?.trim();
  const parts = raw
    ? raw.split(",").map((s) => s.trim()).filter(Boolean)
    : fallback.split(",").map((s) => s.trim()).filter(Boolean);
  const uniq = [...new Set(parts)];
  for (const required of ["read_files", "write_files"]) {
    if (!uniq.includes(required)) uniq.push(required);
  }
  return uniq;
}

const scopes = resolveScopes();

export const BILLING_PLANS = {
  STARTER_MONTHLY: "starter_monthly_99",
  STARTER_YEARLY: "starter_yearly_999",
  GROWTH_MONTHLY: "growth_monthly_199",
  GROWTH_YEARLY: "growth_yearly_1999",
  SCALE_MONTHLY: "scale_monthly_399",
  SCALE_YEARLY: "scale_yearly_3999",
  PRO_MONTHLY: "pro_monthly_599",
  PRO_YEARLY: "pro_yearly_6000",
};

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: ApiVersion.October25,
  scopes,
  appUrl: process.env.SHOPIFY_APP_URL || "",
  authPathPrefix: "/auth",
  sessionStorage: new PrismaSessionStorage(prisma),
  distribution: AppDistribution.AppStore,
  billing: {
    [BILLING_PLANS.STARTER_MONTHLY]: {
      trialDays: 7,
      lineItems: [
        {
          interval: BillingInterval.Every30Days,
          amount: 99,
          currencyCode: "USD",
        },
      ],
    },
    [BILLING_PLANS.STARTER_YEARLY]: {
      trialDays: 14,
      lineItems: [
        {
          interval: BillingInterval.Annual,
          amount: 999,
          currencyCode: "USD",
        },
      ],
    },
    [BILLING_PLANS.GROWTH_MONTHLY]: {
      trialDays: 14,
      lineItems: [
        {
          interval: BillingInterval.Every30Days,
          amount: 199,
          currencyCode: "USD",
        },
      ],
    },
    [BILLING_PLANS.GROWTH_YEARLY]: {
      trialDays: 14,
      lineItems: [
        {
          interval: BillingInterval.Annual,
          amount: 1999,
          currencyCode: "USD",
        },
      ],
    },
    [BILLING_PLANS.SCALE_MONTHLY]: {
      trialDays: 14,
      lineItems: [
        {
          interval: BillingInterval.Every30Days,
          amount: 399,
          currencyCode: "USD",
        },
      ],
    },
    [BILLING_PLANS.SCALE_YEARLY]: {
      trialDays: 14,
      lineItems: [
        {
          interval: BillingInterval.Annual,
          amount: 3999,
          currencyCode: "USD",
        },
      ],
    },
    [BILLING_PLANS.PRO_MONTHLY]: {
      trialDays: 14,
      lineItems: [
        {
          interval: BillingInterval.Every30Days,
          amount: 599,
          currencyCode: "USD",
        },
      ],
    },
    [BILLING_PLANS.PRO_YEARLY]: {
      trialDays: 14,
      lineItems: [
        {
          interval: BillingInterval.Annual,
          amount: 6000,
          currencyCode: "USD",
        },
      ],
    },
  },
  future: {
    expiringOfflineAccessTokens: true,
  },
  ...(process.env.SHOP_CUSTOM_DOMAIN
    ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] }
    : {}),
});

export default shopify;
export const apiVersion = ApiVersion.October25;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;
