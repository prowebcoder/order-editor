/**
 * Extend Shopify Checkout with a custom Post Purchase user experience.
 * This template provides two extension points:
 *
 *  1. ShouldRender - Called first, during the checkout process, when the
 *     payment page loads.
 *  2. Render - If requested by `ShouldRender`, will be rendered after checkout
 *     completes
 */
import React from 'react';

import {
  extend,
  render,
  BlockStack,
  Button,
  CalloutBanner,
  Heading,
  Image,
  Layout,
  TextBlock,
  TextContainer,
  View,
} from "@shopify/post-purchase-ui-extensions-react";

/**
 * Entry point for the `ShouldRender` Extension Point.
 *
 * Returns a value indicating whether or not to render a PostPurchase step, and
 * optionally allows data to be stored on the client for use in the `Render`
 * extension point.
 */
extend("Checkout::PostPurchase::ShouldRender", async ({ storage }) => {
  const initialState = await getRenderData();
  const render = true;

  if (render) {
    // Saves initial state, provided to `Render` via `storage.initialData`
    await storage.update(initialState);
  }

  return {
    render,
  };
});

// Simulate results of network call, etc.
async function getRenderData() {
  return {
    offerTitle: "Limited-time offer",
    offerMessage: "Add one more item before your order is shipped.",
  };
}

/**
* Entry point for the `Render` Extension Point
*
* Returns markup composed of remote UI components.  The Render extension can
* optionally make use of data stored during `ShouldRender` extension point to
* expedite time-to-first-meaningful-paint.
*/
render("Checkout::PostPurchase::Render", App);

// Top-level React component
export function App({ extensionPoint, storage }) {
  const initialState = storage.initialData;

  return (
      <BlockStack spacing="loose">
      <CalloutBanner title="Timebound offer">
          {initialState.offerMessage}
      </CalloutBanner>
      <Layout
          maxInlineSize={0.95}
          media={[
          { viewportSize: "small", sizes: [1, 30, 1] },
          { viewportSize: "medium", sizes: [300, 30, 0.5] },
          { viewportSize: "large", sizes: [400, 30, 0.33] },
          ]}
      >
          <View>
          <Image source="https://cdn.shopify.com/static/images/examples/img-placeholder-1120x1120.png" />
          </View>
          <View />
          <BlockStack spacing="xloose">
          <TextContainer>
              <Heading>{initialState.offerTitle}</Heading>
              <TextBlock>
              This post-purchase page can show a single-click upsell before the
              buyer is redirected to the Thank you page.
              </TextBlock>
          </TextContainer>
          <Button
              submit
              onPress={() => {
              // eslint-disable-next-line no-console
              console.log(`Extension point ${extensionPoint}`, initialState);
              }}
          >
              Continue
          </Button>
          </BlockStack>
      </Layout>
      </BlockStack>
  );
}