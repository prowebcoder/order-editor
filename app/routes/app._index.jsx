import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { getSettings } from "../services/orderflex-settings.server";

async function adminGraphql(admin, query, variables = {}) {
  const response = await admin.graphql(query, { variables });
  const json = await response.json();
  if (json.errors?.length) {
    throw new Error(json.errors.map((e) => e.message).join("; "));
  }
  return json.data;
}

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;

  const [settings, orderSnapshot, activeSessions, recentLogs] = await Promise.all([
    getSettings(shop),
    adminGraphql(
      admin,
      `#graphql
      query DashboardOrderSnapshot {
        unfulfilled: orders(first: 1, query: "fulfillment_status:unfulfilled") {
          nodes { id }
        }
        today: orders(first: 1, query: "created_at:>=today") {
          nodes { id }
        }
      }`,
    ),
    db.editSession.count({
      where: { shop, status: "ACTIVE" },
    }),
    db.orderEditLog.findMany({
      where: { shop },
      orderBy: { createdAt: "desc" },
      take: 25,
      select: {
        status: true,
        createdAt: true,
      },
    }),
  ]);

  const completedCount = recentLogs.filter((log) => log.status === "COMPLETED").length;
  const failedCount = recentLogs.filter((log) => log.status === "FAILED").length;
  const successRate = recentLogs.length
    ? Math.round((completedCount / recentLogs.length) * 100)
    : 100;

  return {
    shop,
    settings: {
      editWindowMinutes: settings.editWindowMinutes,
      allowAddressEdit: settings.allowAddressEdit,
      allowProductEdit: settings.allowProductEdit,
      enableUpsells: settings.enableUpsells,
      allowDiscountCodes: settings.allowDiscountCodes,
      upsellProductCount: settings.upsellProductIds.length,
      upsellCollectionCount: settings.upsellCollectionIds.length,
      checkoutOfferHeading: settings.checkoutOfferHeading,
    },
    metrics: {
      activeSessions,
      unfulfilledOrders: orderSnapshot.unfulfilled?.nodes?.length ?? 0,
      ordersToday: orderSnapshot.today?.nodes?.length ?? 0,
      recentEdits: recentLogs.length,
      completedEdits: completedCount,
      failedEdits: failedCount,
      successRate,
    },
  };
};

export const action = async ({ request }) => {
  await authenticate.admin(request);
  return null;
};

export default function Index() {
  const { shop, settings, metrics } = useLoaderData();
  const statusTone = metrics.failedEdits > 0 ? "warning" : "success";

  return (
    <s-page heading="OrderFlex dashboard">
      <s-section heading="Overview">
        <s-banner tone={statusTone}>
          Store: {shop} - {metrics.successRate}% success across last {metrics.recentEdits} edits.
        </s-banner>
      </s-section>

      <s-section heading="Live metrics">
        <s-grid columns="repeat(4, minmax(0, 1fr))" gap="base">
          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-heading>Active edit sessions</s-heading>
            <s-text>{String(metrics.activeSessions)}</s-text>
          </s-box>
          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-heading>Recent edits</s-heading>
            <s-text>{String(metrics.recentEdits)}</s-text>
          </s-box>
          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-heading>Completed / failed</s-heading>
            <s-text>{metrics.completedEdits} / {metrics.failedEdits}</s-text>
          </s-box>
          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-heading>Unfulfilled orders</s-heading>
            <s-text>{String(metrics.unfulfilledOrders)}</s-text>
          </s-box>
        </s-grid>
      </s-section>

      <s-section heading="Configuration status">
        <s-grid columns="repeat(2, minmax(0, 1fr))" gap="base">
          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-heading>General controls</s-heading>
            <s-unordered-list>
              <s-list-item>Edit window: {settings.editWindowMinutes} minutes</s-list-item>
              <s-list-item>Address edits: {settings.allowAddressEdit ? "Enabled" : "Disabled"}</s-list-item>
              <s-list-item>Product edits: {settings.allowProductEdit ? "Enabled" : "Disabled"}</s-list-item>
              <s-list-item>Discount codes: {settings.allowDiscountCodes ? "Enabled" : "Disabled"}</s-list-item>
            </s-unordered-list>
          </s-box>

          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-heading>Checkout customization</s-heading>
            <s-unordered-list>
              <s-list-item>Upsells: {settings.enableUpsells ? "Enabled" : "Disabled"}</s-list-item>
              <s-list-item>Selected products: {settings.upsellProductCount}</s-list-item>
              <s-list-item>Selected collections: {settings.upsellCollectionCount}</s-list-item>
              <s-list-item>Offer heading: {settings.checkoutOfferHeading}</s-list-item>
            </s-unordered-list>
          </s-box>
        </s-grid>
      </s-section>

      <s-section heading="Quick actions">
        <s-stack direction="inline" gap="small">
          <s-link href="/app/orderflex">Open settings</s-link>
          <s-link href="https://shopify.dev/docs/api/checkout-ui-extensions/latest" target="_blank">
            Checkout docs
          </s-link>
          <s-link href="https://shopify.dev/docs/apps" target="_blank">
            App docs
          </s-link>
        </s-stack>
      </s-section>

      <s-section heading="Operational checklist">
        <s-paragraph>
          Use this before release and after major changes.
        </s-paragraph>
        <s-unordered-list>
          <s-list-item>Verify theme app extension blocks are configured for legacy customer pages.</s-list-item>
          <s-list-item>Keep `App base URL` synced with your current host URL.</s-list-item>
          <s-list-item>Run a test order and confirm thank-you/order status edit constraints.</s-list-item>
          <s-list-item>Review failed edit logs weekly and adjust settings as needed.</s-list-item>
          <s-list-item>Orders created today: {metrics.ordersToday}</s-list-item>
        </s-unordered-list>
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
