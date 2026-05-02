import {useEffect, useRef, useState} from "react";
import {useFetcher, useLoaderData} from "react-router";
import {authenticate} from "../shopify.server";
import {CheckoutMerchandisingTab} from "../components/CheckoutMerchandisingTab.jsx";
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

function pickInitialSelection(ids, lookup) {
  return (ids || []).map((id) => ({
    id,
    title: lookup.find((item) => item.id === id)?.title || id,
  }));
}

export const action = async ({request}) => {
  const {session} = await authenticate.admin(request);
  const form = await request.formData();
  const intent = String(form.get("intent") || "");

  if (intent === "save-merchandising") {
    let parsed;
    try {
      parsed = JSON.parse(String(form.get("merchandising_json") || "{}"));
    } catch {
      return {ok: false, message: "Invalid checkout display data."};
    }
    const next = await updateSettings(session.shop, {merchandising: parsed});
    return {
      ok: true,
      message: "Checkout display saved.",
      merchandising: next.merchandising,
      shop: session.shop,
    };
  }

  if (intent !== "save-settings") {
    return {ok: false, message: "Unsupported action"};
  }

  const currentSettings = await getSettings(session.shop);
  const upsellProductIds = String(form.get("upsellProductIds") || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  const upsellCollectionIds = String(form.get("upsellCollectionIds") || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

  const next = await updateSettings(session.shop, {
    editWindowMinutes: Number(form.get("editWindowMinutes") || currentSettings.editWindowMinutes),
    allowAddressEdit: String(form.get("allowAddressEdit") || "") === "true",
    allowProductEdit: String(form.get("allowProductEdit") || "") === "true",
    enableUpsells: String(form.get("enableUpsells") || "") === "true",
    allowDiscountCodes: String(form.get("allowDiscountCodes") || "") === "true",
    upsellProductIds,
    upsellCollectionIds,
    checkoutOfferHeading: String(form.get("checkoutOfferHeading") || "").trim() || currentSettings.checkoutOfferHeading,
  });

  return {
    ok: true,
    message: "Settings saved",
    settings: next,
    shop: session.shop,
  };
};

function getCheckboxLikeValue(event) {
  if (typeof event?.currentTarget?.checked === "boolean") return event.currentTarget.checked;
  if (typeof event?.target?.checked === "boolean") return event.target.checked;
  if (typeof event?.detail?.checked === "boolean") return event.detail.checked;
  return false;
}

function getFieldStringValue(event) {
  const t = event?.currentTarget ?? event?.target;
  if (t?.values != null && Array.isArray(t.values)) return String(t.values[0] ?? "");
  if (event?.detail != null) {
    if (typeof event.detail === "string") return event.detail;
    if (event.detail?.value != null) return String(event.detail.value);
  }
  return String(t?.value ?? "");
}

export default function OrderFlexAdmin() {
  const {shop, settings: loaderSettings, products, collections} = useLoaderData();
  const fetcher = useFetcher();
  const merchFetcher = useFetcher();
  const saveAttemptRef = useRef(false);
  const merchSaveAttemptRef = useRef(false);

  const [activeTab, setActiveTab] = useState("general");

  const [editWindowMinutes, setEditWindowMinutes] = useState(loaderSettings.editWindowMinutes);
  const [allowAddressEdit, setAllowAddressEdit] = useState(loaderSettings.allowAddressEdit);
  const [allowProductEdit, setAllowProductEdit] = useState(loaderSettings.allowProductEdit);
  const [allowDiscountCodes, setAllowDiscountCodes] = useState(loaderSettings.allowDiscountCodes);
  const [enableUpsells, setEnableUpsells] = useState(loaderSettings.enableUpsells);
  const [checkoutOfferHeading, setCheckoutOfferHeading] = useState(
    loaderSettings.checkoutOfferHeading || "Add the finishing touch",
  );
  const [selectedProducts, setSelectedProducts] = useState(() =>
    pickInitialSelection(loaderSettings.upsellProductIds || [], products),
  );
  const [selectedCollections, setSelectedCollections] = useState(() =>
    pickInitialSelection(loaderSettings.upsellCollectionIds || [], collections),
  );

  const [pickerError, setPickerError] = useState("");
  const [showSavedBanner, setShowSavedBanner] = useState(false);
  const [showMerchSavedBanner, setShowMerchSavedBanner] = useState(false);

  const [merch, setMerch] = useState(() => JSON.parse(JSON.stringify(loaderSettings.merchandising || {})));

  const submitting = fetcher.state === "submitting";
  const merchSubmitting = merchFetcher.state === "submitting";
  const busy =
    submitting || merchSubmitting || fetcher.state === "loading" || merchFetcher.state === "loading";

  function patchMerch(section, key, value) {
    setMerch((m) => ({
      ...m,
      [section]: {...m[section], [key]: value},
    }));
  }

  /** Sync React state after successful save response */
  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data?.ok || !fetcher.data.settings) return;
    const s = fetcher.data.settings;
    setEditWindowMinutes(s.editWindowMinutes);
    setAllowAddressEdit(!!s.allowAddressEdit);
    setAllowProductEdit(!!s.allowProductEdit);
    setAllowDiscountCodes(!!s.allowDiscountCodes);
    setEnableUpsells(!!s.enableUpsells);
    setCheckoutOfferHeading(s.checkoutOfferHeading || "");
    setSelectedProducts(pickInitialSelection(s.upsellProductIds || [], products));
    setSelectedCollections(pickInitialSelection(s.upsellCollectionIds || [], collections));
  }, [fetcher.state, fetcher.data, products, collections]);

  /** Banner + Shopify admin toast after any save attempt settles (handles submitting → loading → idle) */
  useEffect(() => {
    if (fetcher.state !== "idle") return;
    if (!saveAttemptRef.current) return;
    saveAttemptRef.current = false;

    if (!fetcher.data?.ok) return;

    setShowSavedBanner(true);

    try {
      const toast = globalThis.shopify?.toast;
      if (toast && typeof toast.show === "function") toast.show("Saved");
    } catch {
      /* optional surface */
    }
  }, [fetcher.state, fetcher.data]);

  useEffect(() => {
    if (merchFetcher.state !== "idle" || !merchFetcher.data?.ok || !merchFetcher.data.merchandising) return;
    setMerch(JSON.parse(JSON.stringify(merchFetcher.data.merchandising)));
  }, [merchFetcher.state, merchFetcher.data]);

  /** Checkout display toast */
  useEffect(() => {
    if (merchFetcher.state !== "idle") return;
    if (!merchSaveAttemptRef.current) return;
    merchSaveAttemptRef.current = false;

    if (!merchFetcher.data?.ok) return;

    setShowMerchSavedBanner(true);

    try {
      const toast = globalThis.shopify?.toast;
      if (toast && typeof toast.show === "function") toast.show("Checkout display saved");
    } catch {
      /* optional */
    }
  }, [merchFetcher.state, merchFetcher.data]);

  function buildSaveFormData() {
    const fd = new FormData();
    fd.append("intent", "save-settings");
    fd.append("editWindowMinutes", String(editWindowMinutes));
    fd.append("allowAddressEdit", allowAddressEdit ? "true" : "false");
    fd.append("allowProductEdit", allowProductEdit ? "true" : "false");
    fd.append("allowDiscountCodes", allowDiscountCodes ? "true" : "false");
    fd.append("enableUpsells", enableUpsells ? "true" : "false");
    fd.append("checkoutOfferHeading", checkoutOfferHeading || "");
    fd.append(
      "upsellProductIds",
      selectedProducts.map((p) => p.id).join(","),
    );
    fd.append(
      "upsellCollectionIds",
      selectedCollections.map((c) => c.id).join(","),
    );
    return fd;
  }

  function submitSave() {
    setPickerError("");
    saveAttemptRef.current = true;
    fetcher.submit(buildSaveFormData(), {method: "post"});
  }

  function submitMerchSave() {
    merchSaveAttemptRef.current = true;
    const fd = new FormData();
    fd.append("intent", "save-merchandising");
    fd.append("merchandising_json", JSON.stringify(merch));
    merchFetcher.submit(fd, {method: "post"});
  }

  function primarySave() {
    setPickerError("");
    if (activeTab === "display") submitMerchSave();
    else submitSave();
  }

  async function pickResources(type) {
    setPickerError("");
    try {
      const picker = globalThis?.shopify?.resourcePicker;
      if (typeof picker !== "function") {
        setPickerError("Resource picker is unavailable in this surface.");
        return;
      }
      if (type === "product") {
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
      } else {
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
      }
    } catch (error) {
      setPickerError(String(error));
    }
  }

  const errorMessage = fetcher.data?.ok === false ? fetcher.data?.message : null;
  const merchErrorMessage = merchFetcher.data?.ok === false ? merchFetcher.data?.message : null;

  return (
    <s-page heading="PWC : Order Editor · Settings">
      <s-button
        slot="primary-action"
        variant="primary"
        type="button"
        loading={busy}
        onClick={primarySave}
      >
        {activeTab === "display" ? "Save checkout display" : "Save settings"}
      </s-button>
      <s-button slot="secondary-actions" variant="secondary" href="/app/pricing">
        Pricing
      </s-button>
      <s-button slot="secondary-actions" variant="tertiary" href="/app">
        Dashboard
      </s-button>

      <s-stack direction="block" gap="large">
        {showSavedBanner && fetcher.data?.ok ? (
          <s-banner tone="success" dismissible onDismiss={() => setShowSavedBanner(false)}>
            <s-text>Settings saved successfully.</s-text>
          </s-banner>
        ) : null}
        {showMerchSavedBanner && merchFetcher.data?.ok ? (
          <s-banner tone="success" dismissible onDismiss={() => setShowMerchSavedBanner(false)}>
            <s-text>Checkout display saved. Refresh checkout customize preview if needed.</s-text>
          </s-banner>
        ) : null}
        {errorMessage ? (
          <s-banner tone="critical">
            <s-text>{errorMessage}</s-text>
          </s-banner>
        ) : null}
        {pickerError ? (
          <s-banner tone="critical" dismissible onDismiss={() => setPickerError("")}>
            <s-text>{pickerError}</s-text>
          </s-banner>
        ) : null}
        {merchErrorMessage ? (
          <s-banner tone="critical">
            <s-text>{merchErrorMessage}</s-text>
          </s-banner>
        ) : null}

        <s-stack direction="inline" gap="small-200" wrap alignItems="center" paddingBlockEnd="small-400">
          <s-button type="button" variant={activeTab === "general" ? "primary" : "secondary"} onClick={() => setActiveTab("general")}>
            General
          </s-button>
          <s-button type="button" variant={activeTab === "checkout" ? "primary" : "secondary"} onClick={() => setActiveTab("checkout")}>
            Checkout & upsells
          </s-button>
          <s-button type="button" variant={activeTab === "display" ? "primary" : "secondary"} onClick={() => setActiveTab("display")}>
            Checkout display
          </s-button>
          <s-button type="button" variant={activeTab === "instructions" ? "primary" : "secondary"} onClick={() => setActiveTab("instructions")}>
            Instructions
          </s-button>
        </s-stack>

        {/* General */}
        <s-box
          border="base"
          borderRadius="base"
          background="base"
          padding="base"
          display={activeTab === "general" ? "auto" : "none"}
        >
          <s-stack direction="block" gap="large">
            <s-grid gap="small-200">
              <s-heading>General controls</s-heading>
              <s-paragraph color="subdued" variant="bodySm">
                Control how long customers may edit orders and what they can change after checkout.
              </s-paragraph>
            </s-grid>
            <s-divider />

            <s-number-field
              label="Edit window duration (minutes)"
              name="editWindowMinutes"
              value={String(editWindowMinutes)}
              min={1}
              max={240}
              details="Customers can edit orders only during this time window."
              onInput={(e) => {
                const n = Number.parseInt(getFieldStringValue(e) || "0", 10);
                if (Number.isNaN(n)) return;
                setEditWindowMinutes(Math.min(240, Math.max(1, n)));
              }}
              onChange={(e) => {
                const n = Number.parseInt(getFieldStringValue(e) || "0", 10);
                if (Number.isNaN(n)) return;
                setEditWindowMinutes(Math.min(240, Math.max(1, n)));
              }}
            />

            <s-stack direction="block" gap="small-200">
              <s-switch
                label="Enable address editing"
                checked={allowAddressEdit}
                onChange={(e) => setAllowAddressEdit(getCheckboxLikeValue(e))}
              />
              <s-switch
                label="Enable product editing"
                checked={allowProductEdit}
                onChange={(e) => setAllowProductEdit(getCheckboxLikeValue(e))}
              />
              <s-switch
                label="Enable discount codes"
                checked={allowDiscountCodes}
                onChange={(e) => setAllowDiscountCodes(getCheckboxLikeValue(e))}
              />
            </s-stack>
          </s-stack>
        </s-box>

        {/* Checkout */}
        <s-box
          border="base"
          borderRadius="base"
          background="base"
          padding="base"
          display={activeTab === "checkout" ? "auto" : "none"}
        >
          <s-stack direction="block" gap="large">
            <s-grid gap="small-200">
              <s-heading>Checkout customization</s-heading>
              <s-paragraph color="subdued" variant="bodySm">
                Heading and targeting for checkout upsell surfaces.
              </s-paragraph>
            </s-grid>
            <s-divider />

            <s-switch label="Enable upsells in checkout" checked={enableUpsells} onChange={(e) => setEnableUpsells(getCheckboxLikeValue(e))} />

            <s-text-field
              label="Checkout offer heading"
              name="checkoutOfferHeading"
              value={checkoutOfferHeading}
              details="Shown above recommendation offers in checkout."
              onInput={(e) => setCheckoutOfferHeading(getFieldStringValue(e))}
              onChange={(e) => setCheckoutOfferHeading(getFieldStringValue(e))}
            />

            <s-box padding="small" background="subdued" borderRadius="base">
              <s-stack direction="block" gap="small">
                <s-grid gap="small-400" columns="1fr auto" alignItems="center">
                  <s-text fontWeight="semibold">Upsell products</s-text>
                  <s-button type="button" variant="secondary" loading={busy} onClick={() => pickResources("product")}>
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
                  <s-text tone="subdued" variant="bodySm">
                    No products selected.
                  </s-text>
                )}
              </s-stack>
            </s-box>

            <s-box padding="small" background="subdued" borderRadius="base">
              <s-stack direction="block" gap="small">
                <s-grid gap="small-400" columns="1fr auto" alignItems="center">
                  <s-text fontWeight="semibold">Upsell collections</s-text>
                  <s-button type="button" variant="secondary" loading={busy} onClick={() => pickResources("collection")}>
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
                  <s-text tone="subdued" variant="bodySm">
                    No collections selected.
                  </s-text>
                )}
              </s-stack>
            </s-box>
          </s-stack>
        </s-box>

        {/* Checkout display (banners + trust → API → extension) */}
        <s-box
          border="base"
          borderRadius="base"
          background="base"
          padding="base"
          display={activeTab === "display" ? "auto" : "none"}
        >
          <s-stack direction="block" gap="large">
            <s-grid gap="small-200">
              <s-heading>Checkout display</s-heading>
              <s-paragraph color="subdued" variant="bodySm">
                Controls the separate “Checkout banners & trust” checkout UI extension. Add that block on checkout and
                thank-you pages; paste your app URL once per block (same value as Order Editor checkout block).
              </s-paragraph>
            </s-grid>
            <s-divider />
            <CheckoutMerchandisingTab merch={merch} patchMerch={patchMerch} disabled={busy} />
          </s-stack>
        </s-box>

        {/* Instructions */}
        <s-box
          border="base"
          borderRadius="base"
          background="base"
          padding="base"
          display={activeTab === "instructions" ? "auto" : "none"}
        >
          <s-stack direction="block" gap="large">
            <s-grid gap="small-200">
              <s-heading>Theme extension (legacy accounts)</s-heading>
              <s-paragraph color="subdued" variant="bodySm">
                For storefronts still on legacy customer account templates.
              </s-paragraph>
            </s-grid>
            <s-divider />
            <s-unordered-list>
              <s-list-item>Add app blocks on the `customers/order` and `customers/account` templates.</s-list-item>
              <s-list-item>Keep Order Editor checkout block App public URL aligned with your live app.</s-list-item>
              <s-list-item>For banners & trust, use the Checkout display tab here and only set App public URL on that block.</s-list-item>
              <s-list-item>After changes, publish the theme and run one test checkout + edit.</s-list-item>
            </s-unordered-list>

            <s-box padding="base" background="subdued" borderRadius="base">
              <s-text variant="bodySm" tone="subdued">
                Store:{" "}
                <s-text fontWeight="semibold" variant="bodySm">
                  {shop}
                </s-text>
              </s-text>
            </s-box>
          </s-stack>
        </s-box>

        <s-box padding="small" border="base" borderRadius="base">
          <s-grid columns="1fr auto" gap="small" alignItems="center">
            <s-text variant="bodySm" tone="subdued">
              {activeTab === "display"
                ? "Tap Save checkout display (above or here) to update storefront banners & trust."
                : "You have unsaved changes until you tap Save settings."}
            </s-text>
            <s-button type="button" variant="primary" loading={busy} onClick={primarySave}>
              {activeTab === "display" ? "Save checkout display" : "Save settings"}
            </s-button>
          </s-grid>
        </s-box>
      </s-stack>
    </s-page>
  );
}
