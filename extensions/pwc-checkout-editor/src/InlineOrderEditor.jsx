/** Custom elements must be `s-*` only — raw <select>/<input> breaks sandbox and yields a blank UI. */
import "@shopify/ui-extensions/preact";
import {useEffect, useMemo, useState} from "preact/hooks";

const NO_UPSELL_VARIANT = "__orderflex_no_upsell__";

export function InlineOrderEditor() {
  /** Thank-you + account surfaces populate orderConfirmation / shop asynchronously — subscribe instead of one-off reads. */
  const [resolvedOrderId, setResolvedOrderId] = useState("");
  const [resolvedShopDomain, setResolvedShopDomain] = useState("");

  const appBase = (shopify.settings?.current?.portal_base_url || "").replace(/\/$/, "");
  const [nowMs, setNowMs] = useState(Date.now());
  const [state, setState] = useState({
    loading: false,
    message: "",
    ok: false,
    token: "",
    session: null,
    order: null,
    settings: null,
    lines: [],
    upsellProducts: [],
  });
  const [draft, setDraft] = useState({lineChanges: [], addVariantId: "", addQty: 1, otp: ""});

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  /** Wait for Shopify signals (thank-you fills orderConfirmation async). */
  useEffect(() => {
    return subscribeOrderAndShopSignals(setResolvedOrderId, setResolvedShopDomain);
  }, []);

  const waitingForContext = !(resolvedShopDomain && resolvedOrderId);
  const g = typeof globalThis !== "undefined" ? globalThis : self;

  useEffect(() => {
    async function loadState() {
      if (!appBase) {
        setState((prev) => ({...prev, loading: false, ok: false, message: "Missing portal_base_url configuration."}));
        return;
      }
      if (!resolvedShopDomain || !resolvedOrderId) return;

      const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
      const failTimer = g.setTimeout(() => controller?.abort(), 25000);

      setState((prev) => ({...prev, loading: true, message: "Loading editor...", ok: prev.ok}));

      try {
        const url = buildApiUrl(appBase, resolvedShopDomain, resolvedOrderId);
        const response = await fetch(url, controller?.signal ? {signal: controller.signal} : {});
        g.clearTimeout(failTimer);
        let payload;
        try {
          payload = await response.json();
        } catch (_jsonError) {
          setState((prev) => ({
            ...prev,
            loading: false,
            ok: false,
            message: `Invalid response from app server (${response.status}).`,
          }));
          return;
        }

        if (!response.ok || !payload?.ok) {
          const msg =
            payload?.message && String(payload.message).trim()
              ? String(payload.message)
              : response.status >= 400
                ? `Request failed (${response.status}).`
                : "Order editing is unavailable.";
          setState((prev) => ({
            ...prev,
            loading: false,
            ok: false,
            message: /edit window expired/i.test(msg) ? "Edit window expired." : msg,
          }));
          return;
        }
        setState({
          loading: false,
          ok: true,
          message: "",
          token: payload.token || "",
          session: payload.session,
          order: payload.order,
          settings: payload.settings,
          lines: payload.lines || [],
          upsellProducts: payload.upsellProducts || [],
        });
        setDraft({
          lineChanges: (payload.lines || []).map((line) => ({
            lineItemId: line.id,
            variantId: line.variantId,
            nextVariantId: line.variantId,
            quantity: line.quantity,
            originalQuantity: line.quantity,
            remove: false,
          })),
          addVariantId: "",
          addQty: 1,
          otp: "",
        });
      } catch (error) {
        g.clearTimeout(failTimer);
        const name = error && typeof error === "object" ? error.name : "";
        setState((prev) => ({
          ...prev,
          loading: false,
          ok: false,
          message:
            name === "AbortError"
              ? "Request timed out. Check your portal URL matches the dev server URL."
              : "Could not connect to edit API. Please try again.",
        }));
      }
    }

    loadState();
    return () => {};
  }, [appBase, resolvedShopDomain, resolvedOrderId]);

  async function mutate(intent, payload = {}) {
    try {
      if (!resolvedShopDomain || !resolvedOrderId) return false;
      const response = await fetch(buildApiUrl(appBase, resolvedShopDomain, resolvedOrderId), {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({
          shop: resolvedShopDomain,
          token: state.token,
          intent,
          payload,
        }),
      });
      const data = await response.json();
      if (!data?.ok) {
        setState((prev) => ({
          ...prev,
          ok: false,
          message: data?.message || "Action failed.",
        }));
        return false;
      }
      const hasFreshState = Boolean(data?.session && data?.order);
      if (hasFreshState) {
        setState((prev) => ({
          ...prev,
          ok: true,
          message: data.message || "",
          session: data.session,
          order: data.order,
          settings: data.settings,
          lines: data.lines || [],
          upsellProducts: data.upsellProducts || [],
        }));
        setDraft((prev) => ({
          ...prev,
          lineChanges: (data.lines || []).map((line) => ({
            lineItemId: line.id,
            variantId: line.variantId,
            nextVariantId: line.variantId,
            quantity: line.quantity,
            originalQuantity: line.quantity,
            remove: false,
          })),
        }));
      } else {
        setState((prev) => ({
          ...prev,
          ok: true,
          message: data.message || "Order updated.",
        }));
      }
      return true;
    } catch (_error) {
      setState((prev) => ({
        ...prev,
        ok: false,
        message: "Unable to perform this action right now.",
      }));
      return false;
    }
  }

  function patchLine(lineItemId, updater) {
    setDraft((prev) => ({
      ...prev,
      lineChanges: prev.lineChanges.map((line) =>
        line.lineItemId === lineItemId ? {...line, ...updater} : line,
      ),
    }));
  }

  const secondsLeft = useMemo(() => {
    const expiresAt = state?.session?.expiresAt;
    if (!expiresAt) return 0;
    const expiresAtMs = new Date(expiresAt).getTime();
    if (!Number.isFinite(expiresAtMs)) return 0;
    return Math.max(0, Math.floor((expiresAtMs - nowMs) / 1000));
  }, [state?.session?.expiresAt, nowMs]);

  const countdown = `${Math.floor(secondsLeft / 60).toString().padStart(2, "0")}:${String(
    secondsLeft % 60,
  ).padStart(2, "0")}`;

  return (
  
    <s-section>
      <s-stack gap="base">
        <s-heading>Edit your order</s-heading>
        {waitingForContext ? (
          <s-banner tone="info">Connecting your order…</s-banner>
        ) : null}
        {!waitingForContext && state.loading ? (
          <s-banner tone="info">Loading editor…</s-banner>
        ) : null}
        {!waitingForContext && !state.loading && state.message ? (
          <s-banner tone={state.ok ? "success" : "warning"}>{state.message}</s-banner>
        ) : null}
        {!waitingForContext && !state.loading && state.ok ? (
          <s-stack gap="base">
            <s-text type="small">
              {secondsLeft > 0 ? `Time left to edit: ${countdown}` : "Edit window expired."}
            </s-text>

            <s-box border="base" borderRadius="base" padding="base">
              <s-details>
                <s-summary>Change contact information</s-summary>
              <s-stack gap="small">
                <s-text-field
                  label="Contact email"
                  value={state.order?.customerEmail || ""}
                  onChange={(event) =>
                    setState((prev) => ({...prev, order: {...prev.order, customerEmail: event.currentTarget.value}}))
                  }
                />
                {state.order?.customerFirstName || state.order?.customerLastName ? (
                  <s-text type="small">
                    Name on account: {[state.order?.customerFirstName, state.order?.customerLastName].filter(Boolean).join(" ")}
                  </s-text>
                ) : null}
                <s-button onClick={() => mutate("update-contact", {contactEmail: state.order?.customerEmail || ""})}>
                  Save contact
                </s-button>
              </s-stack>
              </s-details>
            </s-box>

            {state.settings?.allowAddressEdit ? (
              <s-box border="base" borderRadius="base" padding="base">
                <s-details>
                  <s-summary>Edit shipping address</s-summary>
                <s-stack gap="small">
                <s-text type="small">Include full name, state / province code, and ZIP (required by Shopify).</s-text>

                <s-stack direction="inline" gap="small">
                  <s-text-field
                    label="First name"
                    value={state.order?.shippingAddress?.firstName ?? ""}
                    onChange={(event) =>
                      setState((prev) => ({
                        ...prev,
                        order: {
                          ...prev.order,
                          shippingAddress: {
                            ...prev.order.shippingAddress,
                            firstName: event.currentTarget.value,
                          },
                        },
                      }))
                    }
                  />
                  <s-text-field
                    label="Last name"
                    value={state.order?.shippingAddress?.lastName ?? ""}
                    onChange={(event) =>
                      setState((prev) => ({
                        ...prev,
                        order: {
                          ...prev.order,
                          shippingAddress: {
                            ...prev.order.shippingAddress,
                            lastName: event.currentTarget.value,
                          },
                        },
                      }))
                    }
                  />
                </s-stack>

                <s-text-field
                  label="Address line 1"
                  value={state.order?.shippingAddress?.address1 ?? ""}
                  onChange={(event) =>
                    setState((prev) => ({
                      ...prev,
                      order: {
                        ...prev.order,
                        shippingAddress: {
                          ...prev.order.shippingAddress,
                          address1: event.currentTarget.value,
                        },
                      },
                    }))
                  }
                />
                <s-text-field
                  label="Address line 2"
                  value={state.order?.shippingAddress?.address2 ?? ""}
                  onChange={(event) =>
                    setState((prev) => ({
                      ...prev,
                      order: {
                        ...prev.order,
                        shippingAddress: {
                          ...prev.order.shippingAddress,
                          address2: event.currentTarget.value,
                        },
                      },
                    }))
                  }
                />

                <s-stack direction="inline" gap="small">
                  <s-text-field
                    label="City"
                    value={state.order?.shippingAddress?.city ?? ""}
                    onChange={(event) =>
                      setState((prev) => ({
                        ...prev,
                        order: {
                          ...prev.order,
                          shippingAddress: {
                            ...prev.order.shippingAddress,
                            city: event.currentTarget.value,
                          },
                        },
                      }))
                    }
                  />
                  <s-text-field
                    label="Province / State code"
                    value={state.order?.shippingAddress?.provinceCode ?? ""}
                    placeholder="e.g. MA"
                    onChange={(event) =>
                      setState((prev) => ({
                        ...prev,
                        order: {
                          ...prev.order,
                          shippingAddress: {
                            ...prev.order.shippingAddress,
                            provinceCode: event.currentTarget.value,
                          },
                        },
                      }))
                    }
                  />
                </s-stack>

                <s-stack direction="inline" gap="small">
                  <s-text-field
                    label="ZIP / Postal code"
                    value={state.order?.shippingAddress?.zip ?? ""}
                    onChange={(event) =>
                      setState((prev) => ({
                        ...prev,
                        order: {
                          ...prev.order,
                          shippingAddress: {
                            ...prev.order.shippingAddress,
                            zip: event.currentTarget.value,
                          },
                        },
                      }))
                    }
                  />
                  <s-text-field
                    label="Country code"
                    value={state.order?.shippingAddress?.countryCodeV2 ?? ""}
                    placeholder="US"
                    onChange={(event) =>
                      setState((prev) => ({
                        ...prev,
                        order: {
                          ...prev.order,
                          shippingAddress: {
                            ...prev.order.shippingAddress,
                            countryCodeV2: event.currentTarget.value.toUpperCase(),
                          },
                        },
                      }))
                    }
                  />
                </s-stack>

                <s-text-field
                  label="Phone"
                  value={state.order?.shippingAddress?.phone ?? ""}
                  onChange={(event) =>
                    setState((prev) => ({
                      ...prev,
                      order: {
                        ...prev.order,
                        shippingAddress: {
                          ...prev.order.shippingAddress,
                          phone: event.currentTarget.value,
                        },
                      },
                    }))
                  }
                />

                <s-button
                  onClick={() =>
                    mutate("update-shipping", {
                      shipFirstName: state.order?.shippingAddress?.firstName ?? "",
                      shipLastName: state.order?.shippingAddress?.lastName ?? "",
                      shipAddress1: state.order?.shippingAddress?.address1 ?? "",
                      shipAddress2: state.order?.shippingAddress?.address2 ?? "",
                      shipCity: state.order?.shippingAddress?.city ?? "",
                      shipProvinceCode: state.order?.shippingAddress?.provinceCode ?? "",
                      shipZip: state.order?.shippingAddress?.zip ?? "",
                      shipCountryCode: state.order?.shippingAddress?.countryCodeV2 ?? "",
                      shipPhone: state.order?.shippingAddress?.phone ?? "",
                    })}
                >
                  Save shipping
                </s-button>
              </s-stack>
                </s-details>
              </s-box>
            ) : null}

            <s-box border="base" borderRadius="base" padding="base">
              <s-details>
                <s-summary>Edit gift note</s-summary>
              <s-stack gap="small">
                <s-text-area
                  label="Gift note"
                  value={state.order?.note || ""}
                  onChange={(event) =>
                    setState((prev) => ({...prev, order: {...prev.order, note: event.currentTarget.value}}))
                  }
                />
                <s-button onClick={() => mutate("update-gift-note", {giftNote: state.order?.note || ""})}>
                  Save gift note
                </s-button>
              </s-stack>
              </s-details>
            </s-box>

            <s-box border="base" borderRadius="base" padding="base">
              <s-details>
                <s-summary>Update products — variant, quantity, remove</s-summary>
              <s-stack gap="small">
            {state.lines.map((line) => {
              const lineDraft = draft.lineChanges.find((item) => item.lineItemId === line.id);
              const variants = ensureVariantOptions(line);
              const selectedVariant =
                lineDraft?.nextVariantId || line.variantId || variants[0]?.id || "";

              return (
                <s-box key={line.id} border="base" borderRadius="base" padding="base">
                  <s-stack gap="small">
                    <s-text>{line.title}</s-text>
                    <s-text type="small">Current: {line.variantTitle}</s-text>
                    <s-select
                      label="Variant"
                      value={selectedVariant}
                      onChange={(event) =>
                        patchLine(line.id, {
                          nextVariantId: event.currentTarget.value,
                        })
                      }
                    >
                      {variants.map((variant) => (
                        <s-option key={variant.id} value={variant.id}>
                          {variant.title} ({variant.price})
                        </s-option>
                      ))}
                    </s-select>
                    <s-number-field
                      label="Quantity"
                      value={String(lineDraft?.quantity ?? line.quantity)}
                      min={0}
                      max={99}
                      onChange={(event) =>
                        patchLine(line.id, {quantity: Number(event.currentTarget.value || 0)})
                      }
                    />
                    <s-checkbox
                      label="Remove this line item"
                      checked={Boolean(lineDraft?.remove)}
                      onChange={(event) =>
                        patchLine(line.id, {remove: Boolean(event.currentTarget.checked)})
                      }
                    />
                  </s-stack>
                </s-box>
              );
            })}
              <s-button
                disabled={secondsLeft <= 0 || !state.settings?.allowProductEdit}
                onClick={() =>
                  mutate("apply-edit", {
                    lineChanges: draft.lineChanges,
                    additions: [],
                  })}
              >
                Save product changes
              </s-button>
              </s-stack>
              </s-details>
            </s-box>

            {state.settings?.enableUpsells ? (
              <s-box border="base" borderRadius="base" padding="base">
                <s-details>
                  <s-summary>Add a product to your order</s-summary>
              <s-stack gap="small">
                <s-text type="small">
                  Add another product — pick a variant below. Merchant can configure specific addon products in the OrderFlex admin.
                </s-text>

                {!state.upsellProducts?.length ? (
                  <s-banner tone="warning">
                    No addon catalog loaded. In the merchant app (OrderFlex), add product IDs under upsells, or ensure your store has active products.
                  </s-banner>
                ) : upsellVariantOptionCount(state.upsellProducts) === 0 ? (
                  <s-banner tone="warning">
                    No variants are available for addon products yet. Try other products or check inventory on those items.
                  </s-banner>
                ) : (
                  <>
                    <s-select
                      label="Add another product (variant)"
                      value={draft.addVariantId || NO_UPSELL_VARIANT}
                      placeholder="Select variant"
                      onChange={(event) =>
                        setDraft((prev) => ({
                          ...prev,
                          addVariantId:
                            event.currentTarget.value === NO_UPSELL_VARIANT
                              ? ""
                              : event.currentTarget.value || "",
                        }))
                      }
                    >
                      <s-option value={NO_UPSELL_VARIANT}>Select variant</s-option>
                      {flattenUpsellVariantOptions(state.upsellProducts).map(({productTitle, variant}) => (
                        <s-option key={variant.id} value={variant.id}>
                          {productTitle} — {variant.title} (${variant.price})
                          {!variant.availableForSale ? " (check stock)" : ""}
                        </s-option>
                      ))}
                    </s-select>
                    <s-number-field
                      label="Add quantity"
                      value={String(draft.addQty)}
                      min={1}
                      max={10}
                      onChange={(event) =>
                        setDraft((prev) => ({
                          ...prev,
                          addQty: Number(event.currentTarget.value || 1),
                        }))
                      }
                    />
                    <s-button
                      disabled={
                        secondsLeft <= 0 ||
                        !state.settings?.allowProductEdit ||
                        !draft.addVariantId ||
                        draft.addVariantId === NO_UPSELL_VARIANT
                      }
                      onClick={async () => {
                        const ok = await mutate("apply-edit", {
                          lineChanges: [],
                          additions: [{variantId: draft.addVariantId, quantity: draft.addQty}],
                        });
                        if (ok) {
                          setDraft((prev) => ({
                            ...prev,
                            addVariantId: "",
                            addQty: 1,
                          }));
                        }
                      }}
                    >
                      Add product
                    </s-button>
                  </>
                )}
              </s-stack>
                </s-details>
              </s-box>
            ) : null}

            {state.session?.otpRequired && !state.session?.otpVerified ? (
              <s-box border="base" borderRadius="base" padding="base">
                <s-details>
                  <s-summary>OTP verification (COD)</s-summary>
              <s-stack gap="small">
                <s-button onClick={() => mutate("send-otp")}>Send OTP</s-button>
                <s-text-field
                  label="OTP"
                  value={draft.otp}
                  onChange={(event) => setDraft((prev) => ({...prev, otp: event.currentTarget.value}))}
                />
                <s-button onClick={() => mutate("verify-otp", {otp: draft.otp})}>Verify OTP</s-button>
              </s-stack>
                </s-details>
              </s-box>
            ) : null}

          </s-stack>
        ) : null}
      </s-stack>
      </s-section>
   
  );
}

function ensureVariantOptions(line) {
  const list = Array.isArray(line.variants) && line.variants.length > 0 ? line.variants : [];
  const hasCurrent = list.some((v) => v.id === line.variantId);
  if (!hasCurrent && line.variantId) {
    return [
      ...list,
      {
        id: line.variantId,
        title: line.variantTitle || "Current",
        price: "",
      },
    ];
  }
  return list;
}

/** List every variant so add-ons aren’t hidden when Shopify marks `availableForSale` false; server still validates stock on apply. */
function flattenUpsellVariantOptions(products) {
  const out = [];
  for (const product of products || []) {
    const title = product?.title || "Product";
    for (const variant of product?.variants?.nodes || []) {
      if (!variant?.id) continue;
      out.push({productTitle: title, variant});
    }
  }
  return out;
}

function upsellVariantOptionCount(products) {
  return flattenUpsellVariantOptions(products).length;
}

function normalizeOrderId(id) {
  if (!id) return "";
  return String(id).replace("gid://shopify/OrderIdentity/", "gid://shopify/Order/");
}

/**
 * Thank-you and customer-account targets expose order + shop as signals that hydrate after first paint.
 */
function subscribeOrderAndShopSignals(setOrderId, setShopDomain) {
  const cleanup = [];

  function readOrderIdRaw() {
    const ocSignal = shopify.orderConfirmation;
    if (ocSignal) {
      const confirmation = ocSignal.value ?? ocSignal.current ?? null;
      const gid = confirmation?.order?.id;
      if (gid) return String(gid);
    }

    const orderSignal = shopify.order;
    if (orderSignal) {
      const o = orderSignal.value ?? orderSignal.current ?? orderSignal;
      if (o && typeof o === "object" && o.id) return String(o.id);
    }

    return "";
  }

  function refreshOrderId() {
    setOrderId(normalizeOrderId(readOrderIdRaw()));
  }

  refreshOrderId();

  const ocSignal = shopify.orderConfirmation;
  if (typeof ocSignal?.subscribe === "function") {
    cleanup.push(ocSignal.subscribe(refreshOrderId));
  }

  const orderSignal = shopify.order;
  if (typeof orderSignal?.subscribe === "function") {
    cleanup.push(orderSignal.subscribe(refreshOrderId));
  }

  function readShopDomain() {
    const shopSignal = shopify.shop;
    if (!shopSignal) return "";

    const s = shopSignal.value ?? shopSignal.current ?? shopSignal;
    if (!s || typeof s !== "object") return "";

    if (s.myshopifyDomain) return String(s.myshopifyDomain);

    if (s.storefrontUrl) {
      return String(s.storefrontUrl).replace(/^https?:\/\//, "").replace(/\/$/, "");
    }

    return "";
  }

  function refreshShop() {
    setShopDomain(readShopDomain());
  }

  refreshShop();

  const shopSignal = shopify.shop;
  if (typeof shopSignal?.subscribe === "function") {
    cleanup.push(shopSignal.subscribe(refreshShop));
  }

  return () => {
    cleanup.forEach((unsubscribe) => {
      if (typeof unsubscribe === "function") unsubscribe();
    });
  };
}

function buildApiUrl(baseUrl, shopDomain, orderId) {
  const base = baseUrl.replace(/\/$/, "");
  const appRoot = base.replace(/\/order-edit$/, "");
  return `${appRoot}/api/order-edit-link?shop=${encodeURIComponent(shopDomain)}&orderId=${encodeURIComponent(orderId)}`;
}
