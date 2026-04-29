import db from "../db.server";
import {generateEditToken, nowPlusMinutes, isExpired} from "./orderflex-token.server";
import {getSettings} from "./orderflex-settings.server";

async function adminGraphql(admin, query, variables = {}) {
  const response = await admin.graphql(query, {variables});
  const json = await response.json();
  if (json.errors?.length) {
    throw new Error(json.errors.map((e) => e.message).join("; "));
  }
  return json.data;
}

export async function getOrderForPortal(admin, orderGid) {
  const data = await adminGraphql(
    admin,
    `#graphql
      query OrderForPortal($id: ID!) {
        order(id: $id) {
          id
          name
          createdAt
          displayFulfillmentStatus
          displayFinancialStatus
          totalPriceSet { shopMoney { amount currencyCode } }
          customer {
            defaultEmailAddress {
              emailAddress
            }
            firstName
            lastName
          }
          shippingAddress {
            address1
            address2
            city
            countryCodeV2
            zip
            provinceCode
            firstName
            lastName
            phone
          }
          lineItems(first: 100) {
            nodes {
              id
              quantity
              discountedTotalSet { shopMoney { amount currencyCode } }
              variant {
                id
                title
                availableForSale
                inventoryQuantity
                selectedOptions { name value }
                image { url }
                product {
                  id
                  title
                  featuredImage { url }
                  variants(first: 50) {
                    nodes {
                      id
                      title
                      availableForSale
                      inventoryQuantity
                      selectedOptions { name value }
                      image { url }
                      price
                    }
                  }
                }
              }
            }
          }
        }
      }`,
    {id: orderGid},
  );

  return data.order;
}

export async function createEditSession({shop, orderId, customerEmail, settings}) {
  const token = generateEditToken();
  const expiresAt = nowPlusMinutes(settings.editWindowMinutes ?? 30);
  return db.editSession.create({
    data: {
      shop,
      orderId,
      token,
      customerEmail: customerEmail || null,
      expiresAt,
      otpRequired: Boolean(settings.codVerification),
      metadata: JSON.stringify({}),
    },
  });
}

export async function getValidEditSession(token) {
  const session = await db.editSession.findUnique({where: {token}});
  if (!session) return null;
  if (session.status !== "ACTIVE") return null;
  if (isExpired(session.expiresAt)) return null;
  return session;
}

export async function getSessionAndOrder({token, admin}) {
  const session = await getValidEditSession(token);
  if (!session) {
    return {session: null, order: null, settings: null};
  }
  const [order, settings] = await Promise.all([
    getOrderForPortal(admin, session.orderId),
    getSettings(session.shop),
  ]);

  return {session, order, settings};
}

export function buildPriceSummary(currentOrder, edits) {
  const original = Number(currentOrder.totalPriceSet?.shopMoney?.amount ?? 0);
  const delta = Number(edits?.priceDelta ?? 0);
  const nextTotal = original + delta;
  return {original, delta, nextTotal};
}

export async function executeOrderEdit({admin, orderId, operations}) {
  const begin = await adminGraphql(
    admin,
    `#graphql
      mutation BeginOrderEdit($id: ID!) {
        orderEditBegin(id: $id) {
          calculatedOrder {
            id
          }
          userErrors { field message }
        }
      }`,
    {id: orderId},
  );

  const calcId = begin.orderEditBegin?.calculatedOrder?.id;
  const beginErrors = begin.orderEditBegin?.userErrors || [];
  if (!calcId || beginErrors.length) {
    throw new Error(beginErrors.map((e) => e.message).join(", ") || "Unable to begin order edit");
  }

  for (const op of operations) {
    if (op.type === "setQuantity") {
      await adminGraphql(
        admin,
        `#graphql
          mutation SetQty($id: ID!, $lineItemId: ID!, $quantity: Int!) {
            orderEditSetQuantity(id: $id, lineItemId: $lineItemId, quantity: $quantity) {
              userErrors { field message }
            }
          }`,
        {id: calcId, lineItemId: op.lineItemId, quantity: Number(op.quantity)},
      );
    } else if (op.type === "addVariant") {
      const variantCheck = await adminGraphql(
        admin,
        `#graphql
          query VariantAvailability($id: ID!) {
            productVariant(id: $id) {
              id
              availableForSale
              inventoryQuantity
            }
          }`,
        {id: op.variantId},
      );
      const variant = variantCheck.productVariant;
      if (!variant?.availableForSale) {
        throw new Error("Selected variant is out of stock");
      }
      if (
        typeof variant.inventoryQuantity === "number" &&
        variant.inventoryQuantity < Number(op.quantity)
      ) {
        throw new Error("Insufficient inventory for selected variant");
      }
      await adminGraphql(
        admin,
        `#graphql
          mutation AddVariant($id: ID!, $variantId: ID!, $quantity: Int!) {
            orderEditAddVariant(id: $id, variantId: $variantId, quantity: $quantity) {
              userErrors { field message }
            }
          }`,
        {id: calcId, variantId: op.variantId, quantity: Number(op.quantity)},
      );
    } else if (op.type === "removeLineItem") {
      await adminGraphql(
        admin,
        `#graphql
          mutation SetQtyZero($id: ID!, $lineItemId: ID!) {
            orderEditSetQuantity(id: $id, lineItemId: $lineItemId, quantity: 0) {
              userErrors { field message }
            }
          }`,
        {id: calcId, lineItemId: op.lineItemId},
      );
    }
  }

  const commit = await adminGraphql(
    admin,
    `#graphql
      mutation CommitOrderEdit($id: ID!) {
        orderEditCommit(id: $id, notifyCustomer: true, staffNote: "OrderFlex self-service edit") {
          order {
            id
            totalOutstandingSet { shopMoney { amount currencyCode } }
            totalPriceSet { shopMoney { amount currencyCode } }
          }
          userErrors { field message }
        }
      }`,
    {id: calcId},
  );

  const commitErrors = commit.orderEditCommit?.userErrors || [];
  if (commitErrors.length) {
    throw new Error(commitErrors.map((e) => e.message).join(", "));
  }
  return commit.orderEditCommit?.order;
}

export async function logOrderEdit({shop, orderId, editSessionId, changes, priceDelta, status}) {
  return db.orderEditLog.create({
    data: {
      shop,
      orderId,
      editSessionId: editSessionId || null,
      changes: JSON.stringify(changes),
      priceDelta: Number(priceDelta || 0),
      status: status || "PENDING",
    },
  });
}

export async function markEditSessionUsed(id, status = "COMPLETED") {
  return db.editSession.update({
    where: {id},
    data: {
      status,
      usedAt: new Date(),
    },
  });
}
