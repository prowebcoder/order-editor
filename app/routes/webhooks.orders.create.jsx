import { authenticate, unauthenticated } from "../shopify.server";
import { applyOrderConfirmationEmailNoticeFromWebhook } from "../services/orderflex-email-notice.server";
import { getSettings } from "../services/orderflex-settings.server";

/**
 * Shopify `orders/create` — writes order metafields when the merchant enables "Order confirmation email".
 * Confirmation email Liquid must be added once under Admin → Settings → Notifications.
 */
export const action = async ({ request }) => {
  const { topic, shop, payload } = await authenticate.webhook(request);

  const normalizedTopic = String(topic || "")
    .trim()
    .replace(/\//g, "_")
    .toUpperCase();
  if (normalizedTopic !== "ORDERS_CREATE") {
    return new Response(null, { status: 200 });
  }

  if (!shop || !payload) {
    return new Response(null, { status: 200 });
  }

  let settings;
  try {
    settings = await getSettings(shop);
  } catch {
    return new Response(null, { status: 200 });
  }

  const appBaseUrl = process.env.SHOPIFY_APP_URL || "";
  try {
    const { admin } = await unauthenticated.admin(shop);
    await applyOrderConfirmationEmailNoticeFromWebhook({
      admin,
      shop,
      settings,
      appBaseUrl,
      orderPayload: payload,
    });
  } catch (error) {
    console.warn(`orders/create email notice webhook for ${shop}:`, error?.message || error);
  }

  return new Response(null, { status: 200 });
};
