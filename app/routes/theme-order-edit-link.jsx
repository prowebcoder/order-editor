import {redirect} from "react-router";
import {unauthenticated} from "../shopify.server";
import {getSettings} from "../services/orderflex-settings.server";
import {createEditSessionFromOrderTime} from "../services/orderflex-order.server";

async function adminGraphql(admin, query, variables = {}) {
  const response = await admin.graphql(query, {variables});
  const body = await response.json();
  if (body.errors?.length) {
    throw new Error(body.errors.map((e) => e.message).join("; "));
  }
  return body.data;
}

export const loader = async ({request}) => {
  const url = new URL(request.url);
  const shop = String(url.searchParams.get("shop") || "").trim();
  const orderId = normalizeOrderId(url.searchParams.get("orderId"));
  const returnTo = safeReturnTo(shop, url.searchParams.get("return_to"));
  const embed = url.searchParams.get("embed");
  const frameParent = url.searchParams.get("frame_parent");

  if (!shop || !orderId) {
    return redirect(withError(returnTo, "invalid_link"));
  }

  try {
    const {admin} = await unauthenticated.admin(shop);
    const [settings, orderData] = await Promise.all([
      getSettings(shop),
      adminGraphql(
        admin,
        `#graphql
        query ThemeOrderForEdit($id: ID!) {
          order(id: $id) {
            id
            createdAt
            displayFulfillmentStatus
            customer {
              defaultEmailAddress {
                emailAddress
              }
            }
          }
        }`,
        {id: orderId},
      ),
    ]);

    const order = orderData.order;
    if (!order || order.displayFulfillmentStatus !== "UNFULFILLED") {
      return redirect(withError(returnTo, "order_not_editable"));
    }

    const session = await createEditSessionFromOrderTime({
      shop,
      orderId,
      customerEmail: order.customer?.defaultEmailAddress?.emailAddress || null,
      settings,
      orderCreatedAt: order.createdAt,
    });

    let dest = `/order-edit/${session.token}?shop=${encodeURIComponent(shop)}`;
    if (embed === "1") {
      dest += "&embed=1";
      const fp = safeFrameParent(frameParent);
      if (fp) dest += `&frame_parent=${encodeURIComponent(fp)}`;
    }
    return redirect(dest);
  } catch {
    return redirect(withError(returnTo, "link_failed"));
  }
};

function normalizeOrderId(value) {
  const input = String(value || "").trim();
  if (!input) return "";
  if (input.startsWith("gid://shopify/Order/")) return input;
  if (/^\d+$/.test(input)) return `gid://shopify/Order/${input}`;
  return "";
}

function safeReturnTo(shop, input) {
  const fallback = `https://${shop || "example.myshopify.com"}/account`;
  const raw = String(input || "").trim();
  if (!raw) return fallback;

  try {
    const absolute = new URL(raw, fallback);
    const isSameShop = absolute.hostname === shop;
    return isSameShop ? absolute.toString() : fallback;
  } catch {
    return fallback;
  }
}

function withError(urlString, code) {
  try {
    const url = new URL(urlString);
    url.searchParams.set("order_edit_error", code);
    return url.toString();
  } catch {
    return urlString;
  }
}

/** HTTPS storefront origin only, for CSP frame-ancestors when embedding editor. */
function safeFrameParent(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "https:") return "";
    return parsed.origin;
  } catch {
    return "";
  }
}
