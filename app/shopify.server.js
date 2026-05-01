import "@shopify/shopify-app-react-router/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  BillingInterval,
  shopifyApp,
} from "@shopify/shopify-app-react-router/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import prisma from "./db.server";

const configuredScopes = process.env.SCOPES?.split(",").map((scope) => scope.trim()).filter(Boolean) ?? [];
const scopes = configuredScopes.includes("write_own_subscription")
  ? configuredScopes
  : [...configuredScopes, "write_own_subscription"];

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
      amount: 99,
      currencyCode: "USD",
      interval: BillingInterval.Every30Days,
      trialDays: 7,
    },
    [BILLING_PLANS.STARTER_YEARLY]: {
      amount: 999,
      currencyCode: "USD",
      interval: BillingInterval.Annual,
      trialDays: 14,
    },
    [BILLING_PLANS.GROWTH_MONTHLY]: {
      amount: 199,
      currencyCode: "USD",
      interval: BillingInterval.Every30Days,
      trialDays: 14,
    },
    [BILLING_PLANS.GROWTH_YEARLY]: {
      amount: 1999,
      currencyCode: "USD",
      interval: BillingInterval.Annual,
      trialDays: 14,
    },
    [BILLING_PLANS.SCALE_MONTHLY]: {
      amount: 399,
      currencyCode: "USD",
      interval: BillingInterval.Every30Days,
      trialDays: 14,
    },
    [BILLING_PLANS.SCALE_YEARLY]: {
      amount: 3999,
      currencyCode: "USD",
      interval: BillingInterval.Annual,
      trialDays: 14,
    },
    [BILLING_PLANS.PRO_MONTHLY]: {
      amount: 599,
      currencyCode: "USD",
      interval: BillingInterval.Every30Days,
      trialDays: 14,
    },
    [BILLING_PLANS.PRO_YEARLY]: {
      amount: 6000,
      currencyCode: "USD",
      interval: BillingInterval.Annual,
      trialDays: 14,
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
