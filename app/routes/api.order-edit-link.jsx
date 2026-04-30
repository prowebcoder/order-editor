import {unauthenticated} from "../shopify.server";
import {getSettings} from "../services/orderflex-settings.server";
import {
  buildPriceSummary,
  createEditSessionFromOrderTime,
  executeOrderEdit,
  getSessionAndOrder,
  logOrderEdit,
  markEditSessionUsed,
  updateOrderDetails,
} from "../services/orderflex-order.server";

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
  const shop = url.searchParams.get("shop");
  const rawOrderId = url.searchParams.get("orderId");
  const orderId = normalizeOrderId(rawOrderId);

  if (!shop || !orderId) {
    return toJson({ok: false, message: "Missing shop/orderId"}, 400);
  }

  try {
    const {admin} = await unauthenticated.admin(shop);
    const [settings, orderData] = await Promise.all([
      getSettings(shop),
      adminGraphql(
        admin,
        `#graphql
        query OrderForSession($id: ID!) {
          order(id: $id) {
            id
            createdAt
            customer {
              defaultEmailAddress {
                emailAddress
              }
            }
            displayFulfillmentStatus
          }
        }`,
        {id: orderId},
      ),
    ]);

    const order = orderData.order;
    if (!order) {
      return toJson({ok: false, message: "Order not found"}, 404);
    }
    if (order.displayFulfillmentStatus !== "UNFULFILLED") {
      return toJson(
        {ok: false, message: "Order can no longer be edited after fulfillment starts."},
        409,
      );
    }
    const orderCreatedAt = order.createdAt ? new Date(order.createdAt) : null;
    const expiresAt = orderCreatedAt
      ? new Date(orderCreatedAt.getTime() + Number(settings.editWindowMinutes || 30) * 60 * 1000)
      : null;
    if (expiresAt && Date.now() >= expiresAt.getTime()) {
      return toJson(
        {ok: false, message: "Edit window expired for this order."},
        410,
      );
    }

    const editSession = await createEditSessionFromOrderTime({
      shop,
      orderId,
      customerEmail: order.customer?.defaultEmailAddress?.emailAddress || null,
      settings,
      orderCreatedAt: order.createdAt,
    });

    return toJson(await buildExtensionState({admin, shop, token: editSession.token}));
  } catch (error) {
    return toJson(
      {ok: false, message: String(error)},
      500,
    );
  }
};

export const action = async ({request}) => {
  try {
    const body = await request.json();
    const shop = String(body?.shop || "");
    const token = String(body?.token || "");
    const intent = String(body?.intent || "");
    const payload = body?.payload || {};
    if (!shop || !token || !intent) {
      return toJson({ok: false, message: "Missing shop, token, or intent."}, 400);
    }

    const {admin} = await unauthenticated.admin(shop);
    const {session, order, settings} = await getSessionAndOrder({token, admin});
    if (!session || !order || !settings) {
      return toJson({ok: false, message: "Session expired"}, 410);
    }
    if (order.displayFulfillmentStatus !== "UNFULFILLED") {
      return toJson({ok: false, message: "Order can no longer be edited after fulfillment starts."}, 409);
    }

    if (intent === "update-contact") {
      const email = String(payload.contactEmail || "").trim();
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return toJson({ok: false, message: "Enter a valid email address."});
      }
      await updateOrderDetails({admin, orderId: session.orderId, updates: {email}});
      return toJson({
        ok: true,
        message: "Contact information updated.",
        ...(await buildExtensionState({admin, shop, token})),
      });
    }

    if (intent === "update-shipping") {
      if (!settings.allowAddressEdit) {
        return toJson({ok: false, message: "Shipping address editing is disabled by merchant settings."}, 403);
      }
      const shippingAddress = {
        firstName: String(payload.shipFirstName || ""),
        lastName: String(payload.shipLastName || ""),
        address1: String(payload.shipAddress1 || ""),
        address2: String(payload.shipAddress2 || ""),
        city: String(payload.shipCity || ""),
        provinceCode: String(payload.shipProvinceCode || ""),
        zip: String(payload.shipZip || ""),
        countryCode: String(payload.shipCountryCode || "").toUpperCase(),
        phone: String(payload.shipPhone || ""),
      };
      if (!shippingAddress.address1 || !shippingAddress.city || !shippingAddress.countryCode) {
        return toJson({ok: false, message: "Address line 1, city, and country code are required."});
      }
      await updateOrderDetails({admin, orderId: session.orderId, updates: {shippingAddress}});
      return toJson({
        ok: true,
        message: "Shipping address updated.",
        ...(await buildExtensionState({admin, shop, token})),
      });
    }

    if (intent === "update-gift-note") {
      await updateOrderDetails({
        admin,
        orderId: session.orderId,
        updates: {note: String(payload.giftNote || "")},
      });
      return toJson({
        ok: true,
        message: "Gift note updated.",
        ...(await buildExtensionState({admin, shop, token})),
      });
    }

    if (intent === "apply-edit") {
      if (!settings.allowProductEdit) {
        return toJson({ok: false, message: "Product editing is disabled by merchant settings."}, 403);
      }
      const operations = [];
      const removeIds = [];
      const updates = [];
      const addItems = [];
      const lineChanges = Array.isArray(payload.lineChanges) ? payload.lineChanges : [];
      const additions = Array.isArray(payload.additions) ? payload.additions : [];

      for (const change of lineChanges) {
        const lineItemId = String(change.lineItemId || "");
        const variantId = String(change.variantId || "");
        const originalQuantity = Number(change.originalQuantity || 0);
        const quantity = Number(change.quantity || 0);
        const remove = Boolean(change.remove);
        if (!lineItemId || !variantId) continue;

        if (remove || quantity <= 0) {
          removeIds.push(lineItemId);
          operations.push({type: "removeLineItem", lineItemId, variantId, originalQuantity});
          continue;
        }

        if (String(change.nextVariantId || "") && String(change.nextVariantId) !== variantId) {
          const nextVariantId = String(change.nextVariantId);
          removeIds.push(lineItemId);
          operations.push({type: "removeLineItem", lineItemId, variantId, originalQuantity});
          addItems.push({variantId: nextVariantId, quantity});
          operations.push({type: "addVariant", variantId: nextVariantId, quantity});
          continue;
        }

        if (quantity !== originalQuantity) {
          updates.push({lineItemId, quantity});
          operations.push({type: "setQuantity", lineItemId, variantId, quantity, originalQuantity});
        }
      }

      for (const item of additions) {
        const variantId = String(item.variantId || "");
        const quantity = Number(item.quantity || 0);
        if (!variantId || quantity <= 0) continue;
        addItems.push({variantId, quantity});
        operations.push({type: "addVariant", variantId, quantity});
      }

      const committedOrder = await executeOrderEdit({
        admin,
        orderId: session.orderId,
        operations,
      });
      const outstanding = Number(committedOrder?.totalOutstandingSet?.shopMoney?.amount || 0);
      const summary = buildPriceSummary(order, {priceDelta: outstanding});

      await logOrderEdit({
        shop: session.shop,
        orderId: session.orderId,
        editSessionId: session.id,
        changes: {updates, removeIds, addItems},
        priceDelta: summary.delta,
        status: "COMPLETED",
      });
      await markEditSessionUsed(session.id, "COMPLETED");
      return toJson({
        ok: true,
        message: outstanding > 0
          ? "Order updated. Additional payment is required and has been attached to the order."
          : outstanding < 0
            ? "Order updated. Merchant should issue a partial refund for the reduced total."
            : "Order updated successfully.",
        outstanding,
      });
    }

    return toJson({ok: false, message: "Unsupported intent."}, 400);
  } catch (error) {
    return toJson({ok: false, message: String(error)}, 500);
  }
};

async function buildExtensionState({admin, shop, token}) {
  const {session, order, settings} = await getSessionAndOrder({token, admin});
  if (!session || !order || !settings) {
    return {ok: false, message: "Edit session expired or invalid"};
  }
  const lines = flattenOrderLines(order);
  const upsellProducts = await fetchUpsellProducts({admin, settings});

  return {
    ok: true,
    shop,
    token,
    session: {
      id: session.id,
      expiresAt: session.expiresAt,
      status: session.status,
    },
    settings: {
      allowAddressEdit: settings.allowAddressEdit,
      allowProductEdit: settings.allowProductEdit,
      enableUpsells: settings.enableUpsells,
    },
    order: {
      id: order.id,
      name: order.name,
      note: order.note || "",
      createdAt: order.createdAt,
      displayFulfillmentStatus: order.displayFulfillmentStatus,
      customerEmail: order?.customer?.defaultEmailAddress?.emailAddress || "",
      customerFirstName: order.customer?.firstName || "",
      customerLastName: order.customer?.lastName || "",
      shippingAddress: serializeShippingAddressForExtension(order.shippingAddress),
    },
    lines,
    upsellProducts,
  };
}

function flattenOrderLines(order) {
  return (order?.lineItems?.nodes || []).map((line) => ({
    id: line.id,
    quantity: Number(line.quantity || 0),
    variantId: line.variant?.id || "",
    title: line.variant?.product?.title || "Product",
    variantTitle: line.variant?.title || "Default",
    image: line.variant?.image?.url || line.variant?.product?.featuredImage?.url || "",
    variants: (line.variant?.product?.variants?.nodes || []).map((variant) => ({
      id: variant.id,
      title: variant.title,
      price: variant.price,
      availableForSale: variant.availableForSale,
    })),
  }));
}

async function fetchUpsellProducts({admin, settings}) {
  if (!settings.enableUpsells) return [];
  if (settings.upsellProductIds?.length) {
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
    return (data.nodes || []).filter(Boolean);
  }

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
  return (data.products?.nodes || []).filter(Boolean);
}

/** Flat fields for extension editors (explicit keys so hydration never drops names/ZIP/state). */
function serializeShippingAddressForExtension(addr) {
  const empty = {
    firstName: "",
    lastName: "",
    address1: "",
    address2: "",
    city: "",
    provinceCode: "",
    zip: "",
    countryCodeV2: "",
    phone: "",
  };
  if (!addr || typeof addr !== "object") return empty;
  return {
    ...empty,
    firstName: addr.firstName ?? "",
    lastName: addr.lastName ?? "",
    address1: addr.address1 ?? "",
    address2: addr.address2 ?? "",
    city: addr.city ?? "",
    provinceCode: addr.provinceCode ?? "",
    zip: addr.zip ?? "",
    countryCodeV2: String(addr.countryCodeV2 ?? "").toUpperCase(),
    phone: addr.phone ?? "",
  };
}

function normalizeOrderId(id) {
  if (!id) return "";
  return String(id).replace("gid://shopify/OrderIdentity/", "gid://shopify/Order/");
}

function toJson(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

/** CORS preflight for POST from checkout extension (different origin than app host). */
export function options() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
