import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { getSettings } from "../services/orderflex-settings.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const settings = await getSettings(shop);

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
  };
};

export default function Index() {
  const { shop, settings } = useLoaderData();

  return (
    <s-page heading="OrderFlex">
      <s-section>
        <s-grid gap="small-300">
          <s-heading>Welcome back</s-heading>
          <s-paragraph color="subdued">
            Manage post-purchase editing in one place for <s-text>{shop}</s-text>.
          </s-paragraph>
        </s-grid>
      </s-section>

      <s-section heading="Setup guide">
        <s-box border="base" borderRadius="base" padding="base">
          <s-grid gap="small-300">
            <s-paragraph>Keep onboarding simple. Complete these essentials to launch smoothly.</s-paragraph>
            <s-unordered-list>
              <s-list-item>Review core behavior in Settings.</s-list-item>
              <s-list-item>Configure checkout upsells and offer heading.</s-list-item>
              <s-list-item>Open Payments and select your usage plan.</s-list-item>
            </s-unordered-list>
          </s-grid>
        </s-box>
      </s-section>

      <s-section heading="Current configuration">
        <s-grid columns="repeat(2, minmax(0, 1fr))" gap="base">
          <s-box border="base" borderRadius="base" padding="base">
            <s-heading>General controls</s-heading>
            <s-unordered-list>
              <s-list-item>Edit window: {settings.editWindowMinutes} minutes</s-list-item>
              <s-list-item>Address edits: {settings.allowAddressEdit ? "Enabled" : "Disabled"}</s-list-item>
              <s-list-item>Product edits: {settings.allowProductEdit ? "Enabled" : "Disabled"}</s-list-item>
              <s-list-item>Discount codes: {settings.allowDiscountCodes ? "Enabled" : "Disabled"}</s-list-item>
            </s-unordered-list>
          </s-box>
          <s-box border="base" borderRadius="base" padding="base">
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
        <s-grid columns="repeat(3, minmax(0, 1fr))" gap="base">
          <s-clickable href="/app/orderflex" border="base" borderRadius="base" padding="base">
            <s-grid gap="small-200">
              <s-heading>Settings</s-heading>
              <s-paragraph color="subdued">Update edit behavior, upsells, and theme guidance.</s-paragraph>
            </s-grid>
          </s-clickable>
          <s-clickable href="/app/payments" border="base" borderRadius="base" padding="base">
            <s-grid gap="small-200">
              <s-heading>Payments</s-heading>
              <s-paragraph color="subdued">Choose a usage-based plan that matches order volume.</s-paragraph>
            </s-grid>
          </s-clickable>
          <s-clickable
            href="https://shopify.dev/docs/apps"
            target="_blank"
            border="base"
            borderRadius="base"
            padding="base"
          >
            <s-grid gap="small-200">
              <s-heading>Documentation</s-heading>
              <s-paragraph color="subdued">Open Shopify app docs for implementation references.</s-paragraph>
            </s-grid>
          </s-clickable>
        </s-grid>
      </s-section>

      <s-stack alignItems="center" paddingBlock="large">
        <s-text color="subdued">
          Need help? Visit the <s-link href="/app/orderflex">settings center</s-link> to complete setup.
        </s-text>
      </s-stack>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
