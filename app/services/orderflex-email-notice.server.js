import {
  ORDER_EMAIL_NOTICE_BODY_KEY,
  ORDER_EMAIL_NOTICE_LINK_KEY,
  ORDER_EMAIL_NOTICE_NAMESPACE,
} from "../constants/order-email-notice.js";
import {createEditSessionFromOrderTime} from "./orderflex-order.server";

export {
  ORDER_EMAIL_NOTICE_BODY_KEY,
  ORDER_EMAIL_NOTICE_LINK_KEY,
  ORDER_EMAIL_NOTICE_NAMESPACE,
};

export function isOrderEmailNoticeEligible(settings) {
  if (!settings?.includeShopifyEmailEditNotice) return false;
  const minutes = Number(settings.editWindowMinutes || 0);
  if (!(minutes > 0)) return false;
  return Boolean(settings.allowAddressEdit || settings.allowProductEdit || settings.allowDiscountCodes);
}

function minutePhrase(minutes) {
  const n = Math.max(1, Math.floor(Number(minutes) || 0));
  return n === 1 ? "1 minute" : `${n} minutes`;
}

function buildPortalUrl(appBaseUrl, shop, token) {
  const base = String(appBaseUrl || "").replace(/\/+$/, "");
  const q = `shop=${encodeURIComponent(shop)}`;
  return `${base}/order-edit/${encodeURIComponent(token)}?${q}`;
}

function formatNoticeSentence(settings, orderNameDisplay) {
  const windowPhrase = minutePhrase(settings.editWindowMinutes);
  const namePart = orderNameDisplay ? ` for ${orderNameDisplay}` : "";
  return `You have ${windowPhrase} from when this order was placed to make eligible changes${namePart}. Use the secure link below to open the order editor.`;
}

async function adminGraphql(admin, query, variables = {}) {
  const response = await admin.graphql(query, {variables});
  const json = await response.json();
  if (json.errors?.length) {
    throw new Error(json.errors.map((e) => e.message).join("; "));
  }
  return json.data;
}

async function upsertNoticeMetafields(admin, ownerId, {bodyText, portalUrl}) {
  const result = await adminGraphql(
    admin,
    `#graphql
      mutation EmailNoticeMetafieldsSet($mf: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $mf) {
          metafields {
            namespace
            key
            id
          }
          userErrors {
            field
            message
          }
        }
      }`,
    {
      mf: [
        {
          ownerId,
          namespace: ORDER_EMAIL_NOTICE_NAMESPACE,
          key: ORDER_EMAIL_NOTICE_BODY_KEY,
          type: "multi_line_text_field",
          value: bodyText,
        },
        {
          ownerId,
          namespace: ORDER_EMAIL_NOTICE_NAMESPACE,
          key: ORDER_EMAIL_NOTICE_LINK_KEY,
          type: "url",
          value: portalUrl,
        },
      ],
    },
  );
  const errs = result?.metafieldsSet?.userErrors || [];
  if (errs.length) {
    throw new Error(errs.map((e) => e.message || String(e)).join("; "));
  }
}

export function graphqlOrderIdFromWebhookPayload(payload) {
  if (!payload || typeof payload !== "object") return "";
  const raw = payload.admin_graphql_api_id || payload.adminGraphqlApiId;
  if (raw && typeof raw === "string" && raw.startsWith("gid://")) return raw;
  const numericId = payload.id ?? payload.order_id ?? payload.orderId;
  if (numericId === undefined || numericId === null) return "";
  return `gid://shopify/Order/${String(numericId).replace(/^gid:\/\/shopify\/Order\//i, "")}`;
}

/**
 * Validated orders/create webhook: write metafields for Shopify confirmation email Liquid.
 */
export async function applyOrderConfirmationEmailNoticeFromWebhook({
  admin,
  shop,
  settings,
  appBaseUrl,
  orderPayload,
}) {
  if (!admin || !shop || !orderPayload || !isOrderEmailNoticeEligible(settings)) {
    return {ok: false, skipped: true, reason: "ineligible"};
  }

  const orderGid = graphqlOrderIdFromWebhookPayload(orderPayload);
  if (!orderGid) return {ok: false, skipped: true, reason: "missing_order_id"};

  let order;
  try {
    order = await adminGraphql(
      admin,
      `#graphql
        query NoticeOrder($id: ID!) {
          order(id: $id) {
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
        }`,
      {id: orderGid},
    );
  } catch {
    return {ok: false, skipped: true, reason: "order_lookup_failed"};
  }

  const o = order?.order;
  if (!o?.id) {
    return {ok: false, skipped: true, reason: "order_missing"};
  }
  if (String(o.displayFulfillmentStatus || "") !== "UNFULFILLED") {
    return {ok: false, skipped: true, reason: "not_unfulfilled"};
  }

  const editSession = await createEditSessionFromOrderTime({
    shop,
    orderId: o.id,
    customerEmail: o.customer?.defaultEmailAddress?.emailAddress || orderPayload.contact_email || null,
    settings,
    orderCreatedAt: o.createdAt || orderPayload.created_at || null,
  });

  const portalUrl = buildPortalUrl(appBaseUrl, shop, editSession.token);
  const bodyText = formatNoticeSentence(settings, o.name ? String(o.name).trim() : "");

  await upsertNoticeMetafields(admin, o.id, {bodyText, portalUrl});

  return {
    ok: true,
    orderId: o.id,
    metafieldsNamespace: ORDER_EMAIL_NOTICE_NAMESPACE,
  };
}
