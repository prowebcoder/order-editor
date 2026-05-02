import {redirect, useLoaderData} from "react-router";
import {useEffect} from "react";
import {authenticate} from "../shopify.server";

/** Must match keys in shopify.server.js billing config */
const PLAN_KEYS = new Set([
  "starter_monthly_99",
  "starter_yearly_999",
  "growth_monthly_199",
  "growth_yearly_1999",
  "scale_monthly_399",
  "scale_yearly_3999",
  "pro_monthly_599",
  "pro_yearly_6000",
]);

export async function loader({request, params}) {
  const url = new URL(request.url);

  try {
    const auth = await authenticate.admin(request);
    const {billing, session} = auth;

    if (!session?.shop) {
      const shop = url.searchParams.get("shop");
      if (!shop) return redirect("/app/pricing?error=missing_shop");
      return redirect(`/auth?shop=${encodeURIComponent(shop)}`);
    }

    const planKey = String(params.planKey || "");
    if (!PLAN_KEYS.has(planKey)) {
      return redirect("/app/pricing?error=invalid_plan");
    }

    const shopSlug = session.shop.replace(".myshopify.com", "");
    const appHandle = process.env.SHOPIFY_APP_HANDLE || "pwc-order-editor";
    const appHost = `https://admin.shopify.com/store/${shopSlug}/apps/${appHandle}`;
    const returnUrl = `${appHost}/app/pricing`;

    const isTest = process.env.SHOPIFY_BILLING_TEST !== "false";

    if (!billing) {
      console.warn("Billing not configured on authenticate.admin");
      return redirect(`/app/pricing?error=billing_not_configured`);
    }

    await billing.require({
      plans: [planKey],
      isTest,
      returnUrl,
      onFailure: async () =>
        billing.request({
          plan: planKey,
          isTest,
          returnUrl,
        }),
    });

    return redirect(`/app/pricing?updated=true`);
  } catch (error) {
    if (error?.headers?.get) {
      const billingUrl = error.headers.get("X-Shopify-API-Request-Failure-Reauthorize-Url");
      if (billingUrl) {
        return {billingUrl};
      }
    }

    console.error("Billing error", error);
    return redirect(`/app/pricing?error=${encodeURIComponent(error?.message || "Billing failed")}`);
  }
}

export default function BillingRedirect() {
  const data = useLoaderData();

  useEffect(() => {
    if (data?.billingUrl) {
      window.open(data.billingUrl, "_top");
    }
  }, [data]);

  return (
    <s-page>
      <s-box padding="large" textAlign="center">
        <s-spinner size="large" />
        <s-text tone="subdued">Redirecting to billing approval…</s-text>
      </s-box>
    </s-page>
  );
}
