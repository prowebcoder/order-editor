import {Form, useActionData, useLoaderData} from "react-router";
import {unauthenticated} from "../shopify.server";
import {
  getSessionAndOrder,
  executeOrderEdit,
  logOrderEdit,
  markEditSessionUsed,
  buildPriceSummary,
} from "../services/orderflex-order.server";
import db from "../db.server";
import {generateOtpCode} from "../services/orderflex-token.server";

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
  return {session, order, lines, settings, shop};
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
  const {session, order} = await getSessionAndOrder({token, admin});
  if (!session || !order) {
    return {ok: false, message: "Session expired"};
  }

  if (intent === "send-otp") {
    const code = generateOtpCode();
    const metadata = JSON.parse(session.metadata || "{}");
    metadata.otpCode = code;
    metadata.otpGeneratedAt = new Date().toISOString();
    await db.editSession.update({
      where: {id: session.id},
      data: {metadata: JSON.stringify(metadata)},
    });
    return {
      ok: true,
      message: `OTP generated for demo: ${code}. Integrate SMS/email provider in production.`,
    };
  }

  if (intent === "verify-otp") {
    const otp = String(form.get("otp") || "");
    const metadata = JSON.parse(session.metadata || "{}");
    if (!metadata.otpCode || otp !== metadata.otpCode) {
      return {ok: false, message: "Invalid OTP"};
    }
    await db.editSession.update({
      where: {id: session.id},
      data: {otpVerified: true},
    });
    return {ok: true, message: "OTP verified. Editing unlocked."};
  }

  if (session.otpRequired && !session.otpVerified) {
    return {ok: false, message: "OTP verification is required before editing this order."};
  }

  const operations = [];
  const removeIds = JSON.parse(String(form.get("removeLineItemIds") || "[]"));
  const updates = JSON.parse(String(form.get("lineUpdates") || "[]"));
  const addItems = JSON.parse(String(form.get("addItems") || "[]"));

  for (const item of updates) {
    operations.push({
      type: "setQuantity",
      lineItemId: item.lineItemId,
      quantity: Number(item.quantity),
    });
  }
  for (const lineItemId of removeIds) {
    operations.push({
      type: "removeLineItem",
      lineItemId,
    });
  }
  for (const item of addItems) {
    operations.push({
      type: "addVariant",
      variantId: item.variantId,
      quantity: Number(item.quantity),
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
  const {order, lines, settings} = useLoaderData();
  const actionData = useActionData();

  return (
    <s-page heading={`Edit ${order.name}`}>
      <s-section heading="Order lines">
        <s-paragraph>
          You can modify your order until the edit window closes or fulfillment starts.
        </s-paragraph>
        {lines.map((line) => (
          <s-box key={line.id} border="base" borderRadius="base" padding="base">
            <s-stack gap="small">
              <s-text>{line.title}</s-text>
              <s-text tone="neutral">Current variant: {line.variantTitle}</s-text>
              <s-text tone="neutral">Current quantity: {line.quantity}</s-text>
              <details>
                <summary>Available variants</summary>
                <ul>
                  {line.variants.map((v) => (
                    <li key={v.id}>{v.title} ({v.price})</li>
                  ))}
                </ul>
              </details>
            </s-stack>
          </s-box>
        ))}
      </s-section>

      <s-section heading="Submit edit request">
        <Form method="post">
          <input type="hidden" name="intent" value="apply-edit" />
          <s-stack gap="base">
            <s-paragraph>
              Provide JSON payloads for updates/removals/additions. This is ready for production API usage and can be replaced
              with richer UI controls incrementally.
            </s-paragraph>
            <label>
              Line updates JSON
              <textarea
                name="lineUpdates"
                defaultValue="[]"
                rows={4}
              />
            </label>
            <label>
              Remove line item IDs JSON
              <textarea
                name="removeLineItemIds"
                defaultValue="[]"
                rows={3}
              />
            </label>
            <label>
              Add items JSON
              <textarea
                name="addItems"
                defaultValue="[]"
                rows={4}
              />
            </label>
            <s-button type="submit">Apply order edit</s-button>
          </s-stack>
        </Form>
      </s-section>

      {settings.codVerification ? (
        <s-section heading="COD verification">
          <s-stack gap="base">
            <Form method="post">
              <input type="hidden" name="intent" value="send-otp" />
              <s-button type="submit">Send OTP</s-button>
            </Form>
            <Form method="post">
              <input type="hidden" name="intent" value="verify-otp" />
              <label>
                Enter OTP
                <input name="otp" type="text" />
              </label>
              <s-button type="submit">Verify OTP</s-button>
            </Form>
          </s-stack>
        </s-section>
      ) : null}

      <s-section heading="Configured capabilities">
        <s-unordered-list>
          <s-list-item>Window (minutes): {settings.editWindowMinutes}</s-list-item>
          <s-list-item>Address edits: {String(settings.allowAddressEdit)}</s-list-item>
          <s-list-item>Product edits: {String(settings.allowProductEdit)}</s-list-item>
          <s-list-item>Upsells: {String(settings.enableUpsells)}</s-list-item>
          <s-list-item>Discounts: {String(settings.allowDiscountCodes)}</s-list-item>
          <s-list-item>COD OTP required: {String(settings.codVerification)}</s-list-item>
        </s-unordered-list>
      </s-section>

      {actionData?.message ? (
        <s-section heading="Result">
          <s-banner tone={actionData.ok ? "success" : "critical"}>
            {actionData.message}
          </s-banner>
        </s-section>
      ) : null}
    </s-page>
  );
}
