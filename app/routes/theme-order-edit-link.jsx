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
  const returnTo = String(url.searchParams.get("return_to") || "/");

  if (!shop || !orderId) {
    return redirect(returnTo);
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
      return redirect(returnTo);
    }

    const session = await createEditSessionFromOrderTime({
      shop,
      orderId,
      customerEmail: order.customer?.defaultEmailAddress?.emailAddress || null,
      settings,
      orderCreatedAt: order.createdAt,
    });

    return redirect(`/order-edit/${session.token}?shop=${encodeURIComponent(shop)}`);
  } catch {
    return redirect(returnTo);
  }
};

function normalizeOrderId(value) {
  const input = String(value || "").trim();
  if (!input) return "";
  if (input.startsWith("gid://shopify/Order/")) return input;
  if (/^\d+$/.test(input)) return `gid://shopify/Order/${input}`;
  return "";
}
