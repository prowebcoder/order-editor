import {Form, useActionData, useLoaderData} from "react-router";
import {useEffect, useMemo, useState} from "react";
import {unauthenticated} from "../shopify.server";
import {
  getSessionAndOrder,
  executeOrderEdit,
  logOrderEdit,
  markEditSessionUsed,
  buildPriceSummary,
  updateOrderDetails,
} from "../services/orderflex-order.server";

function flattenOrderLines(order) {
  return (order?.lineItems?.nodes || []).map((line) => ({
    id: line.id,
    quantity: line.quantity,
    variantId: line.variant?.id,
    title: line.variant?.product?.title || "Product",
    variantTitle: line.variant?.title || "Default",
    image: line.variant?.image?.url || line.variant?.product?.featuredImage?.url || "",
    variants: line.variant?.product?.variants?.nodes || [],
  }));
}

async function adminGraphql(admin, query, variables = {}) {
  const response = await admin.graphql(query, {variables});
  const body = await response.json();
  if (body.errors?.length) {
    throw new Error(body.errors.map((e) => e.message).join("; "));
  }
  return body.data;
}

function lineKey(lineId) {
  return lineId.replace(/[^a-zA-Z0-9]/g, "_");
}

export const loader = async ({params, request}) => {
  const token = params.token;
  if (!token) throw new Response("Missing token", {status: 400});

  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  if (!shop) throw new Response("Missing shop query parameter", {status: 400});

  const {admin} = await unauthenticated.admin(shop);
  const {session, order, settings} = await getSessionAndOrder({token, admin});
  if (!session || !order) {
    throw new Response("Edit session expired or invalid", {status: 410});
  }

  const lines = flattenOrderLines(order);
  let upsellProducts = [];
  if (settings.enableUpsells && settings.upsellProductIds?.length) {
    const data = await adminGraphql(
      admin,
      `#graphql
      query UpsellProducts($ids: [ID!]!) {
        nodes(ids: $ids) {
          ... on Product {
            id
            title
            featuredImage { url }
            variants(first: 50) {
              nodes {
                id
                title
                availableForSale
                inventoryQuantity
                price
              }
            }
          }
        }
      }`,
      {ids: settings.upsellProductIds},
    );
    upsellProducts = (data.nodes || []).filter(Boolean);
  } else if (settings.enableUpsells) {
    const data = await adminGraphql(
      admin,
      `#graphql
      query FallbackUpsells {
        products(first: 10, sortKey: UPDATED_AT, reverse: true, query: "status:active") {
          nodes {
            id
            title
            featuredImage { url }
            variants(first: 50) {
              nodes {
                id
                title
                availableForSale
                inventoryQuantity
                price
              }
            }
          }
        }
      }`,
    );
    upsellProducts = (data.products?.nodes || []).filter(Boolean);
  }

  return {session, order, lines, settings, shop, upsellProducts};
};

export const action = async ({params, request}) => {
  const token = params.token;
  const form = await request.formData();
  const intent = String(form.get("intent") || "apply-edit");
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  if (!token || !shop) {
    return {ok: false, message: "Missing token or shop"};
  }

  const {admin} = await unauthenticated.admin(shop);
  const {session, order, settings} = await getSessionAndOrder({token, admin});
  if (!session || !order || !settings) {
    return {ok: false, message: "Session expired"};
  }
  if (order.displayFulfillmentStatus !== "UNFULFILLED") {
    return {ok: false, message: "Order can no longer be edited after fulfillment starts."};
  }

  if (intent === "update-contact") {
    try {
      const email = String(form.get("contactEmail") || "").trim();
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return {ok: false, message: "Enter a valid email address."};
      }
      await updateOrderDetails({
        admin,
        orderId: session.orderId,
        updates: {email},
      });
      return {ok: true, message: "Contact information updated."};
    } catch (error) {
      return {ok: false, message: String(error)};
    }
  }

  if (intent === "update-shipping") {
    if (!settings.allowAddressEdit) {
      return {ok: false, message: "Shipping address editing is disabled by merchant settings."};
    }
    try {
      const shippingAddress = {
        firstName: String(form.get("shipFirstName") || ""),
        lastName: String(form.get("shipLastName") || ""),
        address1: String(form.get("shipAddress1") || ""),
        address2: String(form.get("shipAddress2") || ""),
        city: String(form.get("shipCity") || ""),
        provinceCode: String(form.get("shipProvinceCode") || ""),
        zip: String(form.get("shipZip") || ""),
        countryCode: String(form.get("shipCountryCode") || "").toUpperCase(),
        phone: String(form.get("shipPhone") || ""),
      };
      if (!shippingAddress.address1 || !shippingAddress.city || !shippingAddress.countryCode) {
        return {ok: false, message: "Address line 1, city, and country code are required."};
      }
      await updateOrderDetails({
        admin,
        orderId: session.orderId,
        updates: {shippingAddress},
      });
      return {ok: true, message: "Shipping address updated."};
    } catch (error) {
      return {ok: false, message: String(error)};
    }
  }

  if (intent === "update-gift-note") {
    try {
      const giftNote = String(form.get("giftNote") || "");
      await updateOrderDetails({
        admin,
        orderId: session.orderId,
        updates: {note: giftNote},
      });
      return {ok: true, message: "Gift note updated."};
    } catch (error) {
      return {ok: false, message: String(error)};
    }
  }

  const operations = [];
  if (!settings.allowProductEdit) {
    return {ok: false, message: "Product editing is disabled by merchant settings."};
  }
  const lines = flattenOrderLines(order);
  const removeIds = [];
  const updates = [];
  const addItems = [];

  for (const line of lines) {
    const key = lineKey(line.id);
    const submittedQty = Number(form.get(`qty__${key}`) || line.quantity);
    const nextQty = Number.isFinite(submittedQty)
      ? Math.max(1, submittedQty)
      : line.quantity;
    const nextVariantId = String(form.get(`variant__${key}`) || line.variantId || "");

    if (nextVariantId && nextVariantId !== line.variantId) {
      removeIds.push(line.id);
      operations.push({
        type: "removeLineItem",
        lineItemId: line.id,
        variantId: line.variantId,
        originalQuantity: line.quantity,
      });
      addItems.push({variantId: nextVariantId, quantity: nextQty});
      operations.push({type: "addVariant", variantId: nextVariantId, quantity: nextQty});
      continue;
    }

    if (nextQty !== line.quantity) {
      updates.push({lineItemId: line.id, quantity: nextQty});
      operations.push({
        type: "setQuantity",
        lineItemId: line.id,
        quantity: nextQty,
        variantId: line.variantId,
        originalQuantity: line.quantity,
      });
    }
  }

  for (const [fieldName, fieldValue] of form.entries()) {
    if (!fieldName.startsWith("addVariant__")) continue;
    const suffix = fieldName.replace("addVariant__", "");
    const variantId = String(fieldValue || "");
    const quantity = Number(form.get(`addQty__${suffix}`) || 0);
    if (!variantId || quantity <= 0) continue;
    addItems.push({variantId, quantity});
    operations.push({
      type: "addVariant",
      variantId,
      quantity,
    });
  }

  const singleAddVariantId = String(form.get("addVariantId") || "");
  const singleAddQty = Number(form.get("addQty") || 0);
  if (singleAddVariantId && singleAddQty > 0) {
    addItems.push({variantId: singleAddVariantId, quantity: singleAddQty});
    operations.push({
      type: "addVariant",
      variantId: singleAddVariantId,
      quantity: singleAddQty,
    });
  }

  try {
    const committedOrder = await executeOrderEdit({
      admin,
      orderId: session.orderId,
      operations,
    });

    const outstanding = Number(
      committedOrder?.totalOutstandingSet?.shopMoney?.amount || 0,
    );
    const summary = buildPriceSummary(order, {
      priceDelta: outstanding,
    });

    await logOrderEdit({
      shop: session.shop,
      orderId: session.orderId,
      editSessionId: session.id,
      changes: {updates, removeIds, addItems},
      priceDelta: summary.delta,
      status: "COMPLETED",
    });
    await markEditSessionUsed(session.id, "COMPLETED");

    return {
      ok: true,
      message: outstanding > 0
        ? "Order updated. Additional payment is required and has been attached to the order."
        : outstanding < 0
          ? "Order updated. Merchant should issue a partial refund for the reduced total."
          : "Order updated successfully.",
      outstanding,
      completed: true,
    };
  } catch (error) {
    await logOrderEdit({
      shop: session.shop,
      orderId: session.orderId,
      editSessionId: session.id,
      changes: {updates, removeIds, addItems},
      priceDelta: 0,
      status: "FAILED",
    });
    return {ok: false, message: String(error)};
  }
};

export default function CustomerOrderEditPortal() {
  const {order, lines, settings, upsellProducts, session} = useLoaderData();
  const actionData = useActionData();
  const [nowTs, setNowTs] = useState(Date.now());
  const [selectedUpsellProductId, setSelectedUpsellProductId] = useState(
    upsellProducts?.[0]?.id || "",
  );
  const expiresAtTs = new Date(session.expiresAt).getTime();
  const secondsLeft = useMemo(
    () => Math.max(0, Math.floor((expiresAtTs - nowTs) / 1000)),
    [expiresAtTs, nowTs],
  );
  const timerText = useMemo(() => {
    const m = Math.floor(secondsLeft / 60).toString().padStart(2, "0");
    const s = (secondsLeft % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  }, [secondsLeft]);

  useEffect(() => {
    const timer = setInterval(() => setNowTs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!actionData?.ok || !actionData?.completed) return;
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({type: "ORDERFLEX_EDIT_COMPLETE"}, "*");
      return;
    }
    if (order?.statusPageUrl) {
      window.location.href = order.statusPageUrl;
    }
  }, [actionData, order?.statusPageUrl]);

  const selectedUpsellProduct = useMemo(
    () => upsellProducts.find((p) => p.id === selectedUpsellProductId) || null,
    [upsellProducts, selectedUpsellProductId],
  );
  const selectedUpsellVariants = selectedUpsellProduct
    ? selectedUpsellProduct.variants.nodes.filter((v) => v.availableForSale)
    : [];

  const ui = {
    page: {
      maxWidth: 980,
      margin: "24px auto",
      fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      padding: "0 16px 48px",
      color: "#111827",
      background: "#f6f6f7",
    },
    title: {fontSize: 36, fontWeight: 700, margin: "0 0 10px"},
    card: {
      border: "1px solid #e3e3e3",
      borderRadius: 12,
      background: "#fff",
      padding: 16,
      boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
      marginBottom: 14,
    },
    muted: {color: "#6b7280", margin: 0},
    sectionTitle: {margin: "0 0 12px", fontSize: 20, fontWeight: 650},
    label: {display: "grid", gap: 6},
    labelText: {fontSize: 12, color: "#6b7280", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em"},
    input: {
      border: "1px solid #d1d5db",
      borderRadius: 8,
      padding: "10px 12px",
      fontSize: 14,
      background: "#fff",
    },
    primaryBtn: {
      marginTop: 8,
      padding: "11px 16px",
      borderRadius: 10,
      border: "none",
      background: "#111827",
      color: "#fff",
      fontWeight: 600,
      cursor: "pointer",
    },
    secondaryBtn: {
      padding: "10px 14px",
      borderRadius: 8,
      border: "1px solid #d1d5db",
      background: "#fff",
      color: "#111827",
      fontWeight: 500,
      cursor: "pointer",
    },
  };

  return (
    <main style={ui.page}>
      <h1 style={ui.title}>Edit {order.name}</h1>
      <div style={{...ui.card, background: secondsLeft > 0 ? "#eef6ff" : "#fff7ed"}}>
        {secondsLeft > 0
          ? `You can edit this order for ${timerText}.`
          : "Edit window expired."}
      </div>

      {actionData?.message ? (
        <div style={{...ui.card, background: actionData.ok ? "#ecfdf3" : "#fef2f2"}}>
          {actionData.message}
        </div>
      ) : null}

      <p style={{...ui.muted, marginBottom: 16}}>
        You can modify your order until the edit window closes or fulfillment starts.
      </p>

      <section style={ui.card}>
        <h2 style={ui.sectionTitle}>Change contact information</h2>
        <Form method="post" style={{display: "grid", gap: 10}}>
          <input type="hidden" name="intent" value="update-contact" />
          <label style={ui.label}>
            <span style={ui.labelText}>Email</span>
            <input
              name="contactEmail"
              type="email"
              defaultValue={order?.customer?.defaultEmailAddress?.emailAddress || ""}
              style={ui.input}
            />
          </label>
          <button type="submit" style={{...ui.secondaryBtn, width: "fit-content"}}>Save contact info</button>
        </Form>
      </section>

      <section style={ui.card}>
        <h2 style={ui.sectionTitle}>Change shipping address</h2>
        <Form method="post" style={{display: "grid", gap: 10}}>
          <input type="hidden" name="intent" value="update-shipping" />
          <div style={{display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10}}>
            <input name="shipFirstName" placeholder="First name" defaultValue={order.shippingAddress?.firstName || ""} style={ui.input} />
            <input name="shipLastName" placeholder="Last name" defaultValue={order.shippingAddress?.lastName || ""} style={ui.input} />
          </div>
          <input name="shipAddress1" placeholder="Address line 1" defaultValue={order.shippingAddress?.address1 || ""} style={ui.input} />
          <input name="shipAddress2" placeholder="Address line 2" defaultValue={order.shippingAddress?.address2 || ""} style={ui.input} />
          <div style={{display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10}}>
            <input name="shipCity" placeholder="City" defaultValue={order.shippingAddress?.city || ""} style={ui.input} />
            <input name="shipProvinceCode" placeholder="State/Province code" defaultValue={order.shippingAddress?.provinceCode || ""} style={ui.input} />
            <input name="shipZip" placeholder="ZIP/Postal code" defaultValue={order.shippingAddress?.zip || ""} style={ui.input} />
          </div>
          <div style={{display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10}}>
            <input name="shipCountryCode" placeholder="Country code (US, IN, AU)" defaultValue={order.shippingAddress?.countryCodeV2 || ""} style={ui.input} />
            <input name="shipPhone" placeholder="Phone" defaultValue={order.shippingAddress?.phone || ""} style={ui.input} />
          </div>
          <button type="submit" style={{...ui.secondaryBtn, width: "fit-content"}}>Save shipping address</button>
        </Form>
      </section>

      <section style={ui.card}>
        <h2 style={ui.sectionTitle}>Edit order gift note</h2>
        <Form method="post" style={{display: "grid", gap: 10}}>
          <input type="hidden" name="intent" value="update-gift-note" />
          <textarea
            name="giftNote"
            rows={4}
            defaultValue={order.note || ""}
            placeholder="Write a gift message or special note"
            style={ui.input}
          />
          <button type="submit" style={{...ui.secondaryBtn, width: "fit-content"}}>Save gift note</button>
        </Form>
      </section>

      <section style={ui.card}>
        <h2 style={ui.sectionTitle}>Download invoice / order details</h2>
        <div style={{display: "flex", gap: 10, flexWrap: "wrap"}}>
          <a
            href={order.statusPageUrl}
            target="_blank"
            rel="noreferrer"
            style={{...ui.primaryBtn, marginTop: 0, textDecoration: "none", display: "inline-block"}}
          >
            Open order status page
          </a>
          <button
            type="button"
            onClick={() => window.print()}
            style={ui.secondaryBtn}
          >
            Print this page
          </button>
        </div>
      </section>

      <Form method="post">
        <input type="hidden" name="intent" value="apply-edit" />
        <section style={{display: "grid", gap: 12}}>
          {lines.map((line) => {
            const key = lineKey(line.id);
            return (
              <div key={line.id} style={{...ui.card, marginBottom: 0, background: "#fff"}}>
                <div style={{display: "grid", gridTemplateColumns: "64px 1fr", gap: 12, alignItems: "center"}}>
                  <div style={{width: 64, height: 64, borderRadius: 8, overflow: "hidden", border: "1px solid #e5e7eb", background: "#f3f4f6"}}>
                    {line.image ? (
                      <img src={line.image} alt={line.title} style={{width: "100%", height: "100%", objectFit: "cover"}} />
                    ) : null}
                  </div>
                  <div>
                    <h3 style={{margin: "0 0 4px"}}>{line.title}</h3>
                    <p style={{...ui.muted, fontSize: 13}}>Current: {line.variantTitle}</p>
                  </div>
                </div>
                <div style={{display: "grid", gridTemplateColumns: "1fr 130px", gap: 10, alignItems: "end"}}>
                  <label style={ui.label}>
                    <span style={ui.labelText}>Variant</span>
                    <select name={`variant__${key}`} defaultValue={line.variantId || ""} style={ui.input}>
                      {line.variants.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.title} ({v.price})
                        </option>
                      ))}
                    </select>
                  </label>
                  <label style={ui.label}>
                    <span style={ui.labelText}>Quantity</span>
                    <input
                      name={`qty__${key}`}
                      type="number"
                      min={1}
                      max={99}
                      defaultValue={line.quantity}
                      style={ui.input}
                    />
                  </label>
                </div>
              </div>
            );
          })}
        </section>

            {settings.enableUpsells ? (
              <section style={{...ui.card, marginTop: 4}}>
                <h2 style={ui.sectionTitle}>Add another product to your order</h2>
                {upsellProducts.length === 0 ? (
                  <p style={{margin: 0, color: "#6b7280"}}>
                    No active products are available for upsell right now.
                  </p>
                ) : (
                  <div style={{border: "1px solid #e5e7eb", borderRadius: 10, padding: 12, background: "#fff"}}>
                    {selectedUpsellProduct?.featuredImage?.url ? (
                      <div style={{display: "grid", gridTemplateColumns: "64px 1fr", gap: 12, alignItems: "center", marginBottom: 10}}>
                        <div style={{width: 64, height: 64, borderRadius: 8, overflow: "hidden", border: "1px solid #e5e7eb", background: "#f3f4f6"}}>
                          <img
                            src={selectedUpsellProduct.featuredImage.url}
                            alt={selectedUpsellProduct.title}
                            style={{width: "100%", height: "100%", objectFit: "cover"}}
                          />
                        </div>
                        <div style={{fontWeight: 600}}>{selectedUpsellProduct.title}</div>
                      </div>
                    ) : null}
                    <div style={{display: "grid", gridTemplateColumns: "1fr 1fr 130px", gap: 10}}>
                      <label style={ui.label}>
                        <span style={ui.labelText}>Product</span>
                        <select
                          name="addProductId"
                          value={selectedUpsellProductId}
                          onChange={(e) => setSelectedUpsellProductId(e.currentTarget.value)}
                          style={ui.input}
                        >
                          {upsellProducts.map((product) => (
                            <option key={product.id} value={product.id}>
                              {product.title}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label style={ui.label}>
                        <span style={ui.labelText}>Variant</span>
                        <select name="addVariantId" defaultValue="" style={ui.input}>
                          <option value="">Select variant</option>
                          {selectedUpsellVariants.map((v) => (
                            <option key={v.id} value={v.id}>
                              {v.title} ({v.price})
                            </option>
                          ))}
                        </select>
                      </label>
                      <label style={ui.label}>
                        <span style={ui.labelText}>Quantity</span>
                        <input
                          name="addQty"
                          type="number"
                          min={0}
                          max={10}
                          defaultValue={0}
                          style={ui.input}
                        />
                      </label>
                    </div>
                  </div>
                )}
          </section>
        ) : null}

        <button
          type="submit"
          disabled={secondsLeft <= 0}
          style={{
            ...ui.primaryBtn,
            marginTop: 18,
            background: secondsLeft > 0 ? "#111827" : "#9ca3af",
            cursor: secondsLeft > 0 ? "pointer" : "not-allowed",
          }}
        >
          Apply order edit
        </button>
      </Form>

    </main>
  );
}
