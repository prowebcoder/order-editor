import {useState} from "react";
import {Form, useActionData, useLoaderData} from "react-router";
import {authenticate} from "../shopify.server";
import {getSettings, updateSettings} from "../services/orderflex-settings.server";

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
  const [settings, products, collections] = await Promise.all([
    getSettings(session.shop),
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
    products: products.products.nodes,
    collections: collections.collections.nodes,
  };
};

export const action = async ({request}) => {
  const {session} = await authenticate.admin(request);
  const form = await request.formData();
  const intent = String(form.get("intent") || "");

  if (intent === "save-settings") {
    const currentSettings = await getSettings(session.shop);
    const upsellProductIds = String(form.get("upsellProductIds") || "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);
    const upsellCollectionIds = String(form.get("upsellCollectionIds") || "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);
    const settings = await updateSettings(session.shop, {
      editWindowMinutes: form.has("editWindowMinutes")
        ? Number(form.get("editWindowMinutes") || 30)
        : currentSettings.editWindowMinutes,
      allowAddressEdit: form.has("allowAddressEdit")
        ? form.get("allowAddressEdit") === "on"
        : currentSettings.allowAddressEdit,
      allowProductEdit: form.has("allowProductEdit")
        ? form.get("allowProductEdit") === "on"
        : currentSettings.allowProductEdit,
      enableUpsells: form.has("enableUpsells")
        ? form.get("enableUpsells") === "on"
        : currentSettings.enableUpsells,
      allowDiscountCodes: form.has("allowDiscountCodes")
        ? form.get("allowDiscountCodes") === "on"
        : currentSettings.allowDiscountCodes,
      upsellProductIds: form.has("upsellProductIds") ? upsellProductIds : currentSettings.upsellProductIds,
      upsellCollectionIds: form.has("upsellCollectionIds") ? upsellCollectionIds : currentSettings.upsellCollectionIds,
      checkoutOfferHeading: form.has("checkoutOfferHeading")
        ? String(form.get("checkoutOfferHeading") || "Add the finishing touch")
        : currentSettings.checkoutOfferHeading,
    });
    return {ok: true, message: "Settings saved", settings};
  }

  return {ok: false, message: "Unsupported action"};
};

export default function OrderFlexAdmin() {
  const {shop, settings, products, collections} = useLoaderData();
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
    <s-page heading="Settings">
      <Form method="post">
        <input type="hidden" name="intent" value="save-settings" />
        <input type="hidden" name="upsellProductIds" value={selectedProducts.map((item) => item.id).join(",")} />
        <input
          type="hidden"
          name="upsellCollectionIds"
          value={selectedCollections.map((item) => item.id).join(",")}
        />

        <s-section heading="General controls">
          <s-grid gap="base">
            <s-number-field
              label="Edit window duration (minutes)"
              name="editWindowMinutes"
              value={String(settings.editWindowMinutes)}
              min={1}
              max={240}
              details="Customers can edit orders only during this time window."
            />
            <s-box border="base" borderRadius="base" padding="base">
              <s-grid gap="small">
                <label>
                  <input type="checkbox" name="allowAddressEdit" defaultChecked={settings.allowAddressEdit} />
                  <span> Enable address editing</span>
                </label>
                <label>
                  <input type="checkbox" name="allowProductEdit" defaultChecked={settings.allowProductEdit} />
                  <span> Enable product editing</span>
                </label>
                <label>
                  <input type="checkbox" name="allowDiscountCodes" defaultChecked={settings.allowDiscountCodes} />
                  <span> Enable discount codes</span>
                </label>
              </s-grid>
            </s-box>
          </s-grid>
        </s-section>

        <s-section heading="Checkout customization">
          <s-grid gap="base">
            <label>
              <input type="checkbox" name="enableUpsells" defaultChecked={settings.enableUpsells} />
              <span> Enable upsells in checkout</span>
            </label>
            <s-text-field
              label="Checkout offer heading"
              name="checkoutOfferHeading"
              defaultValue={settings.checkoutOfferHeading || "Add the finishing touch"}
              details="This heading appears above offer recommendations in checkout."
            />

            <s-box border="base" borderRadius="base" padding="base">
              <s-grid gap="small">
                <s-grid columns="1fr auto" alignItems="center">
                  <s-heading>Upsell products</s-heading>
                  <s-button type="button" variant="secondary" onClick={pickProducts}>
                    Select products
                  </s-button>
                </s-grid>
                {selectedProducts.length ? (
                  <s-unordered-list>
                    {selectedProducts.map((item) => (
                      <s-list-item key={item.id}>{item.title}</s-list-item>
                    ))}
                  </s-unordered-list>
                ) : (
                  <s-text color="subdued">No products selected.</s-text>
                )}
              </s-grid>
            </s-box>

            <s-box border="base" borderRadius="base" padding="base">
              <s-grid gap="small">
                <s-grid columns="1fr auto" alignItems="center">
                  <s-heading>Upsell collections</s-heading>
                  <s-button type="button" variant="secondary" onClick={pickCollections}>
                    Select collections
                  </s-button>
                </s-grid>
                {selectedCollections.length ? (
                  <s-unordered-list>
                    {selectedCollections.map((item) => (
                      <s-list-item key={item.id}>{item.title}</s-list-item>
                    ))}
                  </s-unordered-list>
                ) : (
                  <s-text color="subdued">No collections selected.</s-text>
                )}
              </s-grid>
            </s-box>
          </s-grid>
        </s-section>

        <s-section heading="Theme extension guidance">
          <s-box border="base" borderRadius="base" padding="base">
            <s-grid gap="small-300">
              <s-paragraph color="subdued">
                Use this only for legacy customer accounts and keep the app base URL synced with your live host.
              </s-paragraph>
              <s-unordered-list>
                <s-list-item>Add blocks on `customers/order` and `customers/account` templates.</s-list-item>
                <s-list-item>Verify app URL whenever your tunnel or host changes.</s-list-item>
                <s-list-item>Publish theme changes after testing one order flow.</s-list-item>
              </s-unordered-list>
            </s-grid>
          </s-box>
        </s-section>

        {pickerError ? (
          <s-section>
            <s-banner tone="critical">{pickerError}</s-banner>
          </s-section>
        ) : null}

        {actionData?.message ? (
          <s-section>
            <s-banner tone={actionData.ok ? "success" : "critical"}>{actionData.message}</s-banner>
          </s-section>
        ) : null}

        <s-section>
          <s-grid columns="1fr auto" alignItems="center">
            <s-text color="subdued">Store: {shop}</s-text>
            <s-button type="submit" variant="primary">
              Save settings
            </s-button>
          </s-grid>
        </s-section>
      </Form>
    </s-page>
  );
}
