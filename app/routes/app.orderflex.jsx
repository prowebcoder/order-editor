import {useState} from "react";
import {Form, useActionData, useLoaderData} from "react-router";
import process from "node:process";
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
  const [settings, orders, products, collections] = await Promise.all([
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
    adminGraphql(
      admin,
      `#graphql
      query CollectionList {
        collections(first: 20, sortKey: UPDATED_AT, reverse: true) {
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
    collections: collections.collections.nodes,
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
    const upsellCollectionIds = String(form.get("upsellCollectionIds") || "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);
    const settings = await updateSettings(session.shop, {
      editWindowMinutes: Number(form.get("editWindowMinutes") || 30),
      allowAddressEdit: form.get("allowAddressEdit") === "on",
      allowProductEdit: form.get("allowProductEdit") === "on",
      enableUpsells: form.get("enableUpsells") === "on",
      allowDiscountCodes: form.get("allowDiscountCodes") === "on",
      upsellProductIds,
      upsellCollectionIds,
      checkoutOfferHeading: String(form.get("checkoutOfferHeading") || "Add the finishing touch"),
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
  const {settings, orders, products, collections} = useLoaderData();
  const actionData = useActionData();
  const [selectedProducts, setSelectedProducts] = useState(
    (settings.upsellProductIds || []).map((id) => {
      const existing = products.find((p) => p.id === id);
      return {id, title: existing?.title || id};
    }),
  );
  const [selectedCollections, setSelectedCollections] = useState(
    (settings.upsellCollectionIds || []).map((id) => {
      const existing = collections.find((c) => c.id === id);
      return {id, title: existing?.title || id};
    }),
  );
  const [pickerError, setPickerError] = useState("");

  async function pickProducts() {
    setPickerError("");
    try {
      const picker = globalThis?.shopify?.resourcePicker;
      if (typeof picker !== "function") {
        setPickerError("Resource picker is unavailable in this surface.");
        return;
      }
      const result = await picker({
        type: "product",
        action: "select",
        multiple: true,
        filter: {variants: false},
        selectionIds: selectedProducts.map((p) => ({id: p.id})),
      });
      if (!result) return;
      setSelectedProducts(
        result.map((item) => ({
          id: item.id,
          title: item.title || item.id,
        })),
      );
    } catch (error) {
      setPickerError(String(error));
    }
  }

  async function pickCollections() {
    setPickerError("");
    try {
      const picker = globalThis?.shopify?.resourcePicker;
      if (typeof picker !== "function") {
        setPickerError("Resource picker is unavailable in this surface.");
        return;
      }
      const result = await picker({
        type: "collection",
        action: "select",
        multiple: true,
        selectionIds: selectedCollections.map((c) => ({id: c.id})),
      });
      if (!result) return;
      setSelectedCollections(
        result.map((item) => ({
          id: item.id,
          title: item.title || item.id,
        })),
      );
    } catch (error) {
      setPickerError(String(error));
    }
  }

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
            <input
              type="hidden"
              name="upsellProductIds"
              value={selectedProducts.map((item) => item.id).join(",")}
            />
            <input
              type="hidden"
              name="upsellCollectionIds"
              value={selectedCollections.map((item) => item.id).join(",")}
            />
            <s-stack gap="small">
              <s-text-field
                label="Checkout offer heading"
                name="checkoutOfferHeading"
                defaultValue={settings.checkoutOfferHeading || "Add the finishing touch"}
              />
            </s-stack>
            <s-stack gap="small">
              <s-text>Upsell products</s-text>
              <s-button type="button" variant="secondary" onClick={pickProducts}>
                Select products
              </s-button>
              {selectedProducts.length ? (
                <s-text type="small">
                  {selectedProducts.map((item) => item.title).join(", ")}
                </s-text>
              ) : (
                <s-text type="small">No products selected.</s-text>
              )}
            </s-stack>
            <s-stack gap="small">
              <s-text>Upsell collections</s-text>
              <s-button type="button" variant="secondary" onClick={pickCollections}>
                Select collections
              </s-button>
              {selectedCollections.length ? (
                <s-text type="small">
                  {selectedCollections.map((item) => item.title).join(", ")}
                </s-text>
              ) : (
                <s-text type="small">No collections selected.</s-text>
              )}
            </s-stack>
            {pickerError ? <s-banner tone="critical">{pickerError}</s-banner> : null}
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
        <s-heading>Collections</s-heading>
        <s-unordered-list>
          {collections.map((c) => (
            <s-list-item key={c.id}>
              {c.title} ({c.id})
            </s-list-item>
          ))}
        </s-unordered-list>
        <s-heading>Products</s-heading>
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
