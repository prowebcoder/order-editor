import '@shopify/ui-extensions/preact';
import {render} from "preact";
import {useEffect, useState} from "preact/hooks";

export default async () => {
  render(<Extension />, document.body);
};

function Extension() {
  const instructions = shopify.instructions.value;
  const cartLines = shopify.cartLines?.value ?? [];
  const discountCodes = shopify.discountCodes?.value ?? [];
  const shippingAddress = shopify.shippingAddress?.value;
  const notesEnabled = instructions?.notes?.canUpdateNote === true;

  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");

  const [zip, setZip] = useState(shippingAddress?.zip ?? "");
  const [city, setCity] = useState(shippingAddress?.city ?? "");
  const [countryCode, setCountryCode] = useState(shippingAddress?.countryCode ?? "");
  const [discountCode, setDiscountCode] = useState("");
  const [giftCardCode, setGiftCardCode] = useState("");
  const [orderNote, setOrderNote] = useState("");
  const [lineId, setLineId] = useState("");
  const [lineQty, setLineQty] = useState("1");
  const [addQty, setAddQty] = useState("1");
  const [modalQty, setModalQty] = useState("1");
  const [modalSize, setModalSize] = useState("XS");
  const [showOfferStep, setShowOfferStep] = useState(false);
  const [variantImageUrl, setVariantImageUrl] = useState("");

  const configuredUpsellVariantId = shopify.settings?.current?.upsell_variant_id ?? "";
  const upsellTitle = shopify.settings?.current?.upsell_title ?? "Featured item";
  const upsellPrice = shopify.settings?.current?.upsell_price ?? "";
  const upsellImage = shopify.settings?.current?.upsell_image_url ?? "";
  const fallbackVariantId = cartLines[0]?.merchandise?.id ?? "";
  const effectiveUpsellVariantId = configuredUpsellVariantId || fallbackVariantId;
  const canAddLines = instructions?.lines?.canAddCartLine === true;
  const addBlockedReason = !effectiveUpsellVariantId
    ? "No variant available. Configure `upsell_variant_id` or ensure cart has at least one line."
    : !canAddLines
      ? "This checkout does not allow cart line additions at this step."
      : "";
  const normalizedCountryCode = countryCode.trim().toUpperCase();
  const shippingValidationError =
    normalizedCountryCode && !/^[A-Z]{2}$/.test(normalizedCountryCode)
      ? "Country code must be 2 letters (for example: US, AU, IN)."
      : "";
  const discountValidationError =
    discountCode.trim() && discountCode.trim().length < 3
      ? "Discount code looks too short."
      : "";
  const giftCardValidationError =
    giftCardCode.trim() && giftCardCode.trim().length < 6
      ? "Gift card code looks too short."
      : "";
  const addQtyNumber = Number(addQty || 0);
  const addQtyValidationError =
    !Number.isInteger(addQtyNumber) || addQtyNumber < 1 || addQtyNumber > 10
      ? "Quantity must be a whole number between 1 and 10."
      : "";
  const modalQtyNumber = Number(modalQty || 0);
  const modalQtyValidationError =
    !Number.isInteger(modalQtyNumber) || modalQtyNumber < 1 || modalQtyNumber > 10
      ? "Quantity must be a whole number between 1 and 10."
      : "";
  const lineQtyNumber = Number(lineQty || 0);
  const lineQtyValidationError =
    !Number.isInteger(lineQtyNumber) || lineQtyNumber < 0 || lineQtyNumber > 99
      ? "Line quantity must be a whole number between 0 and 99."
      : "";
  const noteValidationError =
    orderNote.length > 500 ? "Order note must be 500 characters or fewer." : "";

  useEffect(() => {
    let cancelled = false;

    async function loadVariantImage() {
      if (!effectiveUpsellVariantId) {
        setVariantImageUrl("");
        return;
      }

      try {
        const response = await shopify.query(
          `#graphql
            query VariantImage($id: ID!) {
              node(id: $id) {
                ... on ProductVariant {
                  image {
                    url
                  }
                  product {
                    featuredImage {
                      url
                    }
                  }
                }
              }
            }`,
          {variables: {id: effectiveUpsellVariantId}},
        );
        const data = /** @type {any} */ (response?.data);
        const image =
          data?.node?.image?.url ??
          data?.node?.product?.featuredImage?.url ??
          "";
        if (!cancelled) setVariantImageUrl(image);
      } catch {
        if (!cancelled) setVariantImageUrl("");
      }
    }

    loadVariantImage();
    return () => {
      cancelled = true;
    };
  }, [effectiveUpsellVariantId]);

  async function runAction(fn, okMessage, errorPrefix = "Action failed") {
    setLoading(true);
    setStatusMessage("");
    try {
      await fn();
      setStatusMessage(okMessage);
    } catch (error) {
      setStatusMessage(`${errorPrefix}: ${String(error)}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <s-box padding="base" border="base" borderRadius="base">
      <s-stack gap="base">
        <s-heading>Edit your checkout</s-heading>

        <s-details summary="Edit shipping address">
          <s-stack gap="small">
            <s-text-field
              label="ZIP / Postal code"
              value={zip}
              onChange={(e) => setZip(e.currentTarget.value)}
            />
            <s-text-field
              label="City"
              value={city}
              onChange={(e) => setCity(e.currentTarget.value)}
            />
            <s-text-field
              label="Country code (ISO2)"
              value={countryCode}
              onChange={(e) => setCountryCode(e.currentTarget.value.toUpperCase())}
            />
            <s-button
              variant="secondary"
              disabled={!instructions.delivery.canSelectCustomAddress || loading}
              onClick={() =>
                runAction(async () => {
                  const result = await shopify.applyShippingAddressChange({
                    type: "updateShippingAddress",
                    address: {
                      zip: zip || undefined,
                      city: city || undefined,
                      countryCode: normalizedCountryCode || undefined,
                    },
                  });
                  if (result.type === "error") {
                    throw new Error(result.errors.map((e) => e.message).join(", "));
                  }
                }, "Shipping address updated")
              }
            >
              Save shipping address
            </s-button>
            {shippingValidationError && (
              <s-banner tone="warning">{shippingValidationError}</s-banner>
            )}
            {!instructions.delivery.canSelectCustomAddress && (
              <s-banner tone="warning">Shipping address changes are not available for this checkout.</s-banner>
            )}
          </s-stack>
        </s-details>

        <s-details summary="Apply a discount code">
          <s-stack gap="small">
            <s-text-field
              label="Discount code"
              value={discountCode}
              onChange={(e) => setDiscountCode(e.currentTarget.value)}
            />
            <s-stack direction="inline" gap="small">
              <s-button
                variant="secondary"
                disabled={
                  !instructions.discounts.canUpdateDiscountCodes ||
                  !discountCode.trim() ||
                  Boolean(discountValidationError) ||
                  loading
                }
                onClick={() =>
                  runAction(async () => {
                    const result = await shopify.applyDiscountCodeChange({
                      type: "addDiscountCode",
                      code: discountCode.trim(),
                    });
                    if (result.type === "error") throw new Error(result.message);
                  }, "Discount code applied")
                }
              >
                Apply code
              </s-button>
              <s-button
                variant="secondary"
                disabled={!instructions.discounts.canUpdateDiscountCodes || discountCodes.length === 0 || loading}
                onClick={() =>
                  runAction(async () => {
                    const lastCode = discountCodes[discountCodes.length - 1]?.code;
                    if (!lastCode) throw new Error("No discount code found");
                    const result = await shopify.applyDiscountCodeChange({
                      type: "removeDiscountCode",
                      code: lastCode,
                    });
                    if (result.type === "error") throw new Error(result.message);
                  }, "Last discount code removed")
                }
              >
                Remove last code
              </s-button>
            </s-stack>
            {discountValidationError && (
              <s-banner tone="warning">{discountValidationError}</s-banner>
            )}
          </s-stack>
        </s-details>

        <s-details summary="Apply a gift card">
          <s-stack gap="small">
            <s-text-field
              label="Gift card code"
              value={giftCardCode}
              onChange={(e) => setGiftCardCode(e.currentTarget.value)}
            />
            <s-button
              variant="secondary"
              disabled={!giftCardCode.trim() || Boolean(giftCardValidationError) || loading}
              onClick={() =>
                runAction(async () => {
                  const result = await shopify.applyGiftCardChange({
                    type: "addGiftCard",
                    code: giftCardCode.trim(),
                  });
                  if (result.type === "error") throw new Error(result.message);
                }, "Gift card applied")
              }
            >
              Apply gift card
            </s-button>
            {giftCardValidationError && (
              <s-banner tone="warning">{giftCardValidationError}</s-banner>
            )}
          </s-stack>
        </s-details>

        <s-details summary="Update order note">
          <s-stack gap="small">
            <s-text-area
              label="Order note"
              value={orderNote}
              onChange={(e) => setOrderNote(e.currentTarget.value)}
            />
            <s-button
              variant="secondary"
              disabled={!notesEnabled || Boolean(noteValidationError) || loading}
              onClick={() =>
                runAction(async () => {
                  const result = await shopify.applyNoteChange({
                    type: "updateNote",
                    note: orderNote,
                  });
                  if (result.type === "error") throw new Error(result.message);
                }, "Order note updated")
              }
            >
              Save note
            </s-button>
            {noteValidationError && (
              <s-banner tone="warning">{noteValidationError}</s-banner>
            )}
            {!notesEnabled && <s-banner tone="warning">Order notes cannot be edited in this checkout.</s-banner>}
          </s-stack>
        </s-details>

        <s-details summary="Add a product to your order">
          <s-stack gap="small">
            <s-text tone="neutral">
              Configure `upsell_variant_id` in settings, or this uses the first cart line variant.
            </s-text>
            <s-text tone="neutral">
              Effective variant: {effectiveUpsellVariantId || "none"}
            </s-text>
            <s-number-field
              label="Quantity"
              value={addQty}
              min="1"
              onChange={(e) => setAddQty(e.currentTarget.value)}
            />
            <s-button
              variant="secondary"
              disabled={
                !canAddLines ||
                !effectiveUpsellVariantId ||
                Boolean(addQtyValidationError) ||
                loading
              }
              onClick={() =>
                runAction(async () => {
                  const result = await shopify.applyCartLinesChange({
                    type: "addCartLine",
                    merchandiseId: effectiveUpsellVariantId,
                    quantity: addQtyNumber,
                  });
                  if (result.type === "error") throw new Error(result.message);
                }, "Product added to checkout")
              }
            >
              Add configured upsell product
            </s-button>
            {addQtyValidationError && (
              <s-banner tone="warning">{addQtyValidationError}</s-banner>
            )}
          </s-stack>
        </s-details>

        <s-box border="base" borderRadius="base" padding="base">
          <s-stack gap="base">
            <s-heading>Add the finishing touch</s-heading>
            <s-stack direction="inline" gap="base">
              {variantImageUrl || upsellImage ? (
                <s-box border="base" borderRadius="small" padding="small">
                  <s-image src={variantImageUrl || upsellImage} />
                </s-box>
              ) : (
                <s-box border="base" borderRadius="small" padding="base">
                  <s-text tone="neutral">Image</s-text>
                </s-box>
              )}
              <s-stack gap="none">
                <s-text>{upsellTitle}</s-text>
                {upsellPrice ? (
                  <s-text tone="neutral">{upsellPrice}</s-text>
                ) : (
                  <s-text tone="neutral">Set `upsell_price` in extension settings</s-text>
                )}
              </s-stack>
              <s-button
                disabled={
                  !canAddLines ||
                  !effectiveUpsellVariantId ||
                  Boolean(addQtyValidationError) ||
                  loading
                }
                onClick={() => setShowOfferStep(true)}
              >
                Add
              </s-button>
            </s-stack>
            {addBlockedReason && (
              <s-banner tone="warning">{addBlockedReason}</s-banner>
            )}
          </s-stack>
        </s-box>

        {showOfferStep && (
          <s-box border="base" borderRadius="base" padding="base" background="subdued">
          <s-stack gap="base">
            <s-stack direction="inline">
              <s-heading>Add product to your order</s-heading>
              <s-button variant="secondary" onClick={() => setShowOfferStep(false)}>
                Close
              </s-button>
            </s-stack>

            <s-box border="base" borderRadius="small" padding="small">
              <s-stack direction="inline" gap="small">
                {variantImageUrl || upsellImage ? (
                  <s-image src={variantImageUrl || upsellImage} />
                ) : null}
                <s-stack gap="none">
                  <s-text>{upsellTitle}</s-text>
                  {upsellPrice ? <s-text tone="neutral">{upsellPrice}</s-text> : null}
                </s-stack>
              </s-stack>
            </s-box>

            <s-stack gap="small">
              <s-text>Size: {modalSize}</s-text>
              <s-stack direction="inline" gap="small">
                {["XXS", "XS", "S", "M", "L", "XL"].map((size) => (
                  <s-button
                    key={size}
                    variant={modalSize === size ? "primary" : "secondary"}
                    onClick={() => setModalSize(size)}
                  >
                    {size}
                  </s-button>
                ))}
              </s-stack>
            </s-stack>

            <s-number-field
              label="Quantity"
              value={modalQty}
              min="1"
              onChange={(e) => setModalQty(e.currentTarget.value)}
            />

            <s-button
              variant="primary"
              disabled={
                !canAddLines ||
                !effectiveUpsellVariantId ||
                Boolean(modalQtyValidationError) ||
                loading
              }
              onClick={() =>
                runAction(async () => {
                  const result = await shopify.applyCartLinesChange({
                    type: "addCartLine",
                    merchandiseId: effectiveUpsellVariantId,
                    quantity: modalQtyNumber,
                    attributes: [{key: "selected_size", value: modalSize}],
                  });
                  if (result.type === "error") throw new Error(result.message);
                  setShowOfferStep(false);
                }, "Product added")
              }
            >
              Yes, add to my order
            </s-button>
            {modalQtyValidationError && (
              <s-banner tone="warning">{modalQtyValidationError}</s-banner>
            )}
            <s-text tone="neutral">
              Adding this product may qualify the order for better shipping offers.
            </s-text>
          </s-stack>
          </s-box>
        )}

        <s-details summary="Update or remove a cart line">
          <s-stack gap="small">
            <s-stack gap="small">
              <s-text>
                Selected cart line: {lineId || "None"}
              </s-text>
              <s-box border="base" borderRadius="small" padding="small">
                <s-stack gap="small">
                  {cartLines.length === 0 ? (
                    <s-text tone="neutral">No cart lines found.</s-text>
                  ) : (
                    cartLines.map((line) => (
                      <s-button
                        key={line.id}
                        variant={lineId === line.id ? "primary" : "secondary"}
                        onClick={() => setLineId(line.id)}
                      >
                        {line?.merchandise?.title ?? "Cart item"}
                      </s-button>
                    ))
                  )}
                </s-stack>
              </s-box>
            </s-stack>
            <s-number-field
              label="New quantity"
              value={lineQty}
              min="0"
              onChange={(e) => setLineQty(e.currentTarget.value)}
            />
            <s-stack direction="inline" gap="small">
              <s-button
                variant="secondary"
                disabled={
                  !instructions.lines.canUpdateCartLine ||
                  !lineId ||
                  Boolean(lineQtyValidationError) ||
                  loading
                }
                onClick={() =>
                  runAction(async () => {
                    const result = await shopify.applyCartLinesChange({
                      type: "updateCartLine",
                      id: lineId,
                      quantity: lineQtyNumber,
                    });
                    if (result.type === "error") throw new Error(result.message);
                  }, "Cart line updated")
                }
              >
                Update line quantity
              </s-button>
              <s-button
                tone="critical"
                variant="secondary"
                disabled={!instructions.lines.canRemoveCartLine || !lineId || loading}
                onClick={() =>
                  runAction(async () => {
                    const result = await shopify.applyCartLinesChange({
                      type: "removeCartLine",
                      id: lineId,
                      quantity: 1,
                    });
                    if (result.type === "error") throw new Error(result.message);
                  }, "Cart line removed")
                }
              >
                Remove 1 quantity
              </s-button>
            </s-stack>
            {lineQtyValidationError && (
              <s-banner tone="warning">{lineQtyValidationError}</s-banner>
            )}
          </s-stack>
        </s-details>

        {statusMessage && <s-banner tone="info">{statusMessage}</s-banner>}
      </s-stack>
    </s-box>
  );
}