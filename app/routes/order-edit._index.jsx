import {redirect} from "react-router";
import {unauthenticated} from "../shopify.server";
import {getSettings} from "../services/orderflex-settings.server";
import {createEditSession} from "../services/orderflex-order.server";

async function adminGraphql(admin, query, variables = {}) {
  const response = await admin.graphql(query, {variables});
  const json = await response.json();
  if (json.errors?.length) {
    throw new Error(json.errors.map((e) => e.message).join("; "));
  }
  return json.data;
}

export const loader = async ({request}) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  const rawOrderId = url.searchParams.get("orderId");
  const orderId = normalizeOrderId(rawOrderId);
  if (!shop || !orderId) {
    throw new Response("Missing shop or orderId", {status: 400});
  }

  const {admin} = await unauthenticated.admin(shop);
  const [settings, orderData] = await Promise.all([
    getSettings(shop),
    adminGraphql(
      admin,
      `#graphql
      query CustomerEmail($id: ID!) {
        order(id: $id) {
          id
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

  const session = await createEditSession({
    shop,
    orderId,
    customerEmail: orderData.order?.customer?.defaultEmailAddress?.emailAddress || null,
    settings,
  });

  return redirect(`/order-edit/${session.token}?shop=${encodeURIComponent(shop)}`);
};

function normalizeOrderId(id) {
  if (!id) return "";
  return String(id).replace("gid://shopify/OrderIdentity/", "gid://shopify/Order/");
}
