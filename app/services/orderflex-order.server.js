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
          note
          statusPageUrl
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
  const existing = await db.editSession.findFirst({
    where: {
      shop,
      orderId,
      status: "ACTIVE",
      expiresAt: {gt: new Date()},
    },
    orderBy: {
      createdAt: "desc",
    },
  });
  if (existing) return existing;

  const token = generateEditToken();
  const expiresAt = nowPlusMinutes(settings.editWindowMinutes ?? 30);
  return db.editSession.create({
    data: {
      shop,
      orderId,
      token,
      customerEmail: customerEmail || null,
      expiresAt,
      otpRequired: false,
      metadata: JSON.stringify({}),
    },
  });
}

export async function createEditSessionFromOrderTime({
  shop,
  orderId,
  customerEmail,
  settings,
  orderCreatedAt,
}) {
  const existing = await db.editSession.findFirst({
    where: {
      shop,
      orderId,
      status: "ACTIVE",
      expiresAt: {gt: new Date()},
    },
    orderBy: {
      createdAt: "desc",
    },
  });
  if (existing) return existing;

  const createdAt = orderCreatedAt ? new Date(orderCreatedAt) : new Date();
  const expiresAt = new Date(createdAt.getTime() + Number(settings.editWindowMinutes ?? 30) * 60 * 1000);
  const token = generateEditToken();

  return db.editSession.create({
    data: {
      shop,
      orderId,
      token,
      customerEmail: customerEmail || null,
      expiresAt,
      otpRequired: false,
      metadata: JSON.stringify({}),
    },
  });
}

function throwOnUserErrors(payload, key) {
  const errors = payload?.[key]?.userErrors || [];
  if (errors.length) {
    throw new Error(errors.map((e) => e.message).join(", "));
  }
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

  const calculatedLinesData = await adminGraphql(
    admin,
    `#graphql
      query CalculatedLines($id: ID!) {
        node(id: $id) {
          ... on CalculatedOrder {
            lineItems(first: 250) {
              nodes {
                id
                quantity
                variant {
                  id
                }
              }
            }
          }
        }
      }`,
    {id: calcId},
  );
  const calculatedLines = (calculatedLinesData?.node?.lineItems?.nodes || []).map((line) => ({
    id: line.id,
    quantity: Number(line.quantity || 0),
    variantId: line?.variant?.id || "",
  }));
  const consumedCalculatedIds = new Set();

  function resolveCalculatedLineId(op) {
    const exact = calculatedLines.find(
      (line) =>
        !consumedCalculatedIds.has(line.id) &&
        line.variantId &&
        op.variantId &&
        line.variantId === op.variantId &&
        typeof op.originalQuantity === "number" &&
        line.quantity === Number(op.originalQuantity),
    );
    if (exact) {
      consumedCalculatedIds.add(exact.id);
      return exact.id;
    }

    const byVariant = calculatedLines.find(
      (line) =>
        !consumedCalculatedIds.has(line.id) &&
        line.variantId &&
        op.variantId &&
        line.variantId === op.variantId,
    );
    if (byVariant) {
      consumedCalculatedIds.add(byVariant.id);
      return byVariant.id;
    }

    return null;
  }

  for (const op of operations) {
    if (op.type === "setQuantity") {
      const calculatedLineItemId = resolveCalculatedLineId(op);
      if (!calculatedLineItemId) {
        throw new Error(`Unable to find editable calculated line for ${op.lineItemId}`);
      }
      const setQtyResult = await adminGraphql(
        admin,
        `#graphql
          mutation SetQty($id: ID!, $lineItemId: ID!, $quantity: Int!) {
            orderEditSetQuantity(id: $id, lineItemId: $lineItemId, quantity: $quantity) {
              userErrors { field message }
            }
          }`,
        {id: calcId, lineItemId: calculatedLineItemId, quantity: Number(op.quantity)},
      );
      throwOnUserErrors(setQtyResult, "orderEditSetQuantity");
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
      const addVariantResult = await adminGraphql(
        admin,
        `#graphql
          mutation AddVariant($id: ID!, $variantId: ID!, $quantity: Int!) {
            orderEditAddVariant(id: $id, variantId: $variantId, quantity: $quantity) {
              userErrors { field message }
            }
          }`,
        {id: calcId, variantId: op.variantId, quantity: Number(op.quantity)},
      );
      throwOnUserErrors(addVariantResult, "orderEditAddVariant");
    } else if (op.type === "removeLineItem") {
      const calculatedLineItemId = resolveCalculatedLineId(op);
      if (!calculatedLineItemId) {
        throw new Error(`Unable to find removable calculated line for ${op.lineItemId}`);
      }
      const removeResult = await adminGraphql(
        admin,
        `#graphql
          mutation SetQtyZero($id: ID!, $lineItemId: ID!) {
            orderEditSetQuantity(id: $id, lineItemId: $lineItemId, quantity: 0) {
              userErrors { field message }
            }
          }`,
        {id: calcId, lineItemId: calculatedLineItemId},
      );
      throwOnUserErrors(removeResult, "orderEditSetQuantity");
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

export async function updateOrderDetails({admin, orderId, updates}) {
  const input = {
    id: orderId,
  };
  if (updates.email) input.email = updates.email;
  if (typeof updates.note === "string") input.note = updates.note;
  if (updates.shippingAddress) input.shippingAddress = updates.shippingAddress;

  const result = await adminGraphql(
    admin,
    `#graphql
      mutation UpdateOrder($input: OrderInput!) {
        orderUpdate(input: $input) {
          order {
            id
            email
            note
          }
          userErrors {
            field
            message
          }
        }
      }`,
    {input},
  );

  const errors = result.orderUpdate?.userErrors || [];
  if (errors.length) {
    throw new Error(errors.map((e) => e.message).join(", "));
  }

  return result.orderUpdate?.order;
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
