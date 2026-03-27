import '@shopify/ui-extensions/preact';
import {render} from "preact";
import {useEffect, useMemo, useState} from "preact/hooks";

export default async () => {
  render(<Extension />, document.body);
};

function Extension() {
  const instructions = shopify.instructions.value;
  const cartLines = shopify.cartLines?.value ?? [];
  const discountCodes = shopify.discountCodes?.value ?? [];
  const shippingAddress = shopify.shippingAddress?.value;
  const notesEnabled = instructions?.notes?.canUpdateNote === true;

  const [timeLeftSeconds, setTimeLeftSeconds] = useState(30 * 60);
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

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeftSeconds((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const timeText = useMemo(() => {
    const minutes = Math.floor(timeLeftSeconds / 60)
      .toString()
      .padStart(2, "0");
    const seconds = (timeLeftSeconds % 60).toString().padStart(2, "0");
    return `${minutes}:${seconds}`;
  }, [timeLeftSeconds]);

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
        <s-stack direction="inline" inlineAlignment="space-between">
          <s-heading>Edit your checkout</s-heading>
          <s-text tone={timeLeftSeconds < 120 ? "critical" : "subdued"}>
            {timeText} left to edit
          </s-text>
        </s-stack>

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
                      countryCode: countryCode || undefined,
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
                disabled={!instructions.discounts.canUpdateDiscountCodes || !discountCode || loading}
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
              disabled={!giftCardCode || loading}
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
              disabled={!notesEnabled || loading}
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
            {!notesEnabled && <s-banner tone="warning">Order notes cannot be edited in this checkout.</s-banner>}
          </s-stack>
        </s-details>

        <s-details summary="Add a product to your order">
          <s-stack gap="small">
            <s-text tone="subdued">
              Configure `upsell_variant_id` in settings, or this uses the first cart line variant.
            </s-text>
            <s-text tone="subdued">
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
              disabled={!canAddLines || !effectiveUpsellVariantId || loading}
              onClick={() =>
                runAction(async () => {
                  const result = await shopify.applyCartLinesChange({
                    type: "addCartLine",
                    merchandiseId: effectiveUpsellVariantId,
                    quantity: Math.max(1, Number(addQty || 1)),
                  });
                  if (result.type === "error") throw new Error(result.message);
                }, "Product added to checkout")
              }
            >
              Add configured upsell product
            </s-button>
          </s-stack>
        </s-details>

        <s-box border="base" borderRadius="base" padding="base">
          <s-stack gap="base">
            <s-heading>Add the finishing touch</s-heading>
            <s-stack direction="inline" gap="base" blockAlignment="center">
              {upsellImage ? (
                <s-image source={upsellImage} />
              ) : (
                <s-box border="base" borderRadius="small" padding="base">
                  <s-text tone="subdued">Image</s-text>
                </s-box>
              )}
              <s-stack gap="none">
                <s-text>{upsellTitle}</s-text>
                {upsellPrice ? (
                  <s-text tone="subdued">{upsellPrice}</s-text>
                ) : (
                  <s-text tone="subdued">Set `upsell_price` in extension settings</s-text>
                )}
              </s-stack>
              <s-button
                disabled={!canAddLines || !effectiveUpsellVariantId || loading}
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
          <s-box border="base" borderRadius="base" padding="base">
          <s-stack gap="base">
            <s-stack direction="inline" inlineAlignment="space-between">
              <s-heading>Add product to your order</s-heading>
              <s-button variant="secondary" onClick={() => setShowOfferStep(false)}>
                Close
              </s-button>
            </s-stack>

            <s-box border="base" borderRadius="small" padding="small">
              <s-stack direction="inline" gap="small" blockAlignment="center">
                {upsellImage ? (
                  <s-image source={upsellImage} />
                ) : null}
                <s-stack gap="none">
                  <s-text>{upsellTitle}</s-text>
                  {upsellPrice ? <s-text tone="subdued">{upsellPrice}</s-text> : null}
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
              disabled={!canAddLines || !effectiveUpsellVariantId || loading}
              onClick={() =>
                runAction(async () => {
                  const result = await shopify.applyCartLinesChange({
                    type: "addCartLine",
                    merchandiseId: effectiveUpsellVariantId,
                    quantity: Math.max(1, Number(modalQty || 1)),
                    attributes: [{key: "selected_size", value: modalSize}],
                  });
                  if (result.type === "error") throw new Error(result.message);
                  setShowOfferStep(false);
                }, "Product added")
              }
            >
              Yes, add to my order
            </s-button>
            <s-text tone="subdued">
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
                    <s-text tone="subdued">No cart lines found.</s-text>
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
                disabled={!instructions.lines.canUpdateCartLine || !lineId || loading}
                onClick={() =>
                  runAction(async () => {
                    const result = await shopify.applyCartLinesChange({
                      type: "updateCartLine",
                      id: lineId,
                      quantity: Math.max(0, Number(lineQty || 0)),
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
          </s-stack>
        </s-details>

        {statusMessage && <s-banner tone="info">{statusMessage}</s-banner>}
      </s-stack>
    </s-box>
  );
}