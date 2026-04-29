import {Form, useActionData, useLoaderData} from "react-router";
import {authenticate} from "../shopify.server";
import {getSettings, updateSettings} from "../services/orderflex-settings.server";
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
  const {admin, session} = await authenticate.admin(request);
  const [settings, orders, products] = await Promise.all([
    getSettings(session.shop),
    adminGraphql(
      admin,
      `#graphql
      query RecentOrders {
        orders(first: 15, reverse: true) {
          nodes {
            id
            name
            createdAt
            displayFulfillmentStatus
            customer {
              defaultEmailAddress {
                emailAddress
              }
            }
          }
        }
      }`,
    ),
    adminGraphql(
      admin,
      `#graphql
      query ProductList {
        products(first: 20) {
          nodes {
            id
            title
          }
        }
      }`,
    ),
  ]);

  return {
    shop: session.shop,
    settings,
    orders: orders.orders.nodes,
    products: products.products.nodes,
    appUrl: process.env.SHOPIFY_APP_URL || "",
  };
};

export const action = async ({request}) => {
  const {session} = await authenticate.admin(request);
  const form = await request.formData();
  const intent = String(form.get("intent") || "");

  if (intent === "save-settings") {
    const upsellProductIds = String(form.get("upsellProductIds") || "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);
    const settings = await updateSettings(session.shop, {
      editWindowMinutes: Number(form.get("editWindowMinutes") || 30),
      allowAddressEdit: form.get("allowAddressEdit") === "on",
      allowProductEdit: form.get("allowProductEdit") === "on",
      enableUpsells: form.get("enableUpsells") === "on",
      codVerification: form.get("codVerification") === "on",
      allowDiscountCodes: form.get("allowDiscountCodes") === "on",
      upsellProductIds,
    });
    return {ok: true, message: "Settings saved", settings};
  }

  if (intent === "create-session") {
    const orderId = String(form.get("orderId") || "");
    const customerEmail = String(form.get("customerEmail") || "");
    if (!orderId) {
      return {ok: false, message: "Order is required"};
    }
    const settings = await getSettings(session.shop);
    const editSession = await createEditSession({
      shop: session.shop,
      orderId,
      customerEmail,
      settings,
    });
    const appUrl = process.env.SHOPIFY_APP_URL || "";
    return {
      ok: true,
      message: "Edit session created",
      link: `${appUrl}/order-edit/${editSession.token}`,
    };
  }

  return {ok: false, message: "Unsupported action"};
};

export default function OrderFlexAdmin() {
  const {settings, orders, products} = useLoaderData();
  const actionData = useActionData();

  return (
    <s-page heading="OrderFlex">
      <s-section heading="Merchant settings">
        <Form method="post">
          <input type="hidden" name="intent" value="save-settings" />
          <s-stack gap="base">
            <s-number-field
              label="Edit window duration (minutes)"
              name="editWindowMinutes"
              value={String(settings.editWindowMinutes)}
              min={1}
              max={240}
            />
            <label>
              <input type="checkbox" name="allowAddressEdit" defaultChecked={settings.allowAddressEdit} />
              <span> Enable address editing</span>
            </label>
            <label>
              <input type="checkbox" name="allowProductEdit" defaultChecked={settings.allowProductEdit} />
              <span> Enable product editing</span>
            </label>
            <label>
              <input type="checkbox" name="enableUpsells" defaultChecked={settings.enableUpsells} />
              <span> Enable upsells</span>
            </label>
            <label>
              <input type="checkbox" name="allowDiscountCodes" defaultChecked={settings.allowDiscountCodes} />
              <span> Enable discount codes</span>
            </label>
            <label>
              <input type="checkbox" name="codVerification" defaultChecked={settings.codVerification} />
              <span> Enable COD OTP verification</span>
            </label>
            <s-text-field
              label="Upsell product IDs (comma separated)"
              name="upsellProductIds"
              defaultValue={settings.upsellProductIds.join(", ")}
            />
            <s-button type="submit">Save settings</s-button>
          </s-stack>
        </Form>
      </s-section>

      <s-section heading="Create customer edit link">
        <Form method="post">
          <input type="hidden" name="intent" value="create-session" />
          <s-stack gap="base">
            <label>
              <span>Order</span>
              <select name="orderId" required defaultValue="">
                <option value="" disabled>Select order</option>
                {orders.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name} - {o.displayFulfillmentStatus}
                  </option>
                ))}
              </select>
            </label>
            <s-text-field label="Customer email (optional)" name="customerEmail" />
            <s-button type="submit">Generate secure edit link</s-button>
          </s-stack>
        </Form>
      </s-section>

      <s-section heading="Catalog reference">
        <s-unordered-list>
          {products.map((p) => (
            <s-list-item key={p.id}>
              {p.title} ({p.id})
            </s-list-item>
          ))}
        </s-unordered-list>
      </s-section>

      {actionData?.message ? (
        <s-section heading="Result">
          <s-banner tone={actionData.ok ? "success" : "critical"}>
            {actionData.message}
            {actionData.link ? (
              <s-text>
                {" "} - <a href={actionData.link} target="_blank" rel="noreferrer">{actionData.link}</a>
              </s-text>
            ) : null}
          </s-banner>
        </s-section>
      ) : null}
    </s-page>
  );
}
