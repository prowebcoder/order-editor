import "@shopify/ui-extensions/preact";
import {render} from "preact";

export default async () => {
  render(<OrderStatusExtension />, document.body);
};

function OrderStatusExtension() {
  const rawOrderId = shopify.orderConfirmation?.value?.order?.id;
  const orderId = normalizeOrderId(rawOrderId);
  const baseUrl = shopify.settings?.current?.portal_base_url || "";
  const shopDomain = shopify.shop?.storefrontUrl?.replace(/^https?:\/\//, "").replace(/\/$/, "") || "";

  if (!baseUrl || !orderId) {
    return (
      <s-banner tone="info">
        Order editing is available. Configure `portal_base_url` to enable the edit button.
      </s-banner>
    );
  }

  const tokenlessLink = `${baseUrl}?shop=${encodeURIComponent(shopDomain)}&orderId=${encodeURIComponent(orderId)}`;

  return (
    <s-box border="base" borderRadius="base" padding="base">
      <s-stack gap="small">
        <s-heading>Edit your order</s-heading>
        <s-text tone="neutral">
          Need to update size, quantity, shipping, or add products? Continue in OrderFlex.
        </s-text>
        <s-link href={tokenlessLink} target="_blank">
          Open OrderFlex editor
        </s-link>
      </s-stack>
    </s-box>
  );
}

function normalizeOrderId(id) {
  if (!id) return "";
  return String(id).replace("gid://shopify/OrderIdentity/", "gid://shopify/Order/");
}
