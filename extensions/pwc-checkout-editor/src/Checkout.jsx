import '@shopify/ui-extensions/preact';
import {render} from "preact";
import {useEffect, useRef, useState} from "preact/hooks";

export default async () => {
  render(<Extension />, document.body);
};

function Extension() {
  const instructions = shopify.instructions.value;
  const cartLineSignal = shopify.lines?.value ?? shopify.lines?.current ?? shopify.lines ?? shopify.cartLines?.value ?? [];
  const cartLines = Array.isArray(cartLineSignal) ? cartLineSignal : [];
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [offersLoading, setOffersLoading] = useState(false);
  const [offers, setOffers] = useState([]);
  const [visibleOfferCount, setVisibleOfferCount] = useState(2);
  const [offersEnabled, setOffersEnabled] = useState(true);
  const [offersError, setOffersError] = useState("");
  const [offerHeading, setOfferHeading] = useState("Add the finishing touch");
  const [shopDomain, setShopDomain] = useState("");
  const [modalProduct, setModalProduct] = useState(null);
  const [modalQty, setModalQty] = useState("1");
  const [selectedVariantId, setSelectedVariantId] = useState("");
  const modalRef = useRef(null);
  const canAddLines = instructions?.lines?.canAddCartLine === true;
  const modalQtyNumber = Number(modalQty || 0);
  const modalQtyValidationError =
    !Number.isInteger(modalQtyNumber) || modalQtyNumber < 1 || modalQtyNumber > 10
      ? "Quantity must be a whole number between 1 and 10."
      : "";

  useEffect(() => {
    const s = shopify.shop?.value ?? shopify.shop?.current ?? shopify.shop;
    const domain =
      s?.myshopifyDomain ||
      (s?.storefrontUrl ? String(s.storefrontUrl).replace(/^https?:\/\//, "").replace(/\/$/, "") : "");
    setShopDomain(domain || "");
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadOffers() {
      const rawBase = (shopify.settings?.current?.portal_base_url || "").trim();
      const appBase = rawBase.replace(/\/order-edit\/?$/, "").replace(/\/$/, "");
      if (!appBase || !shopDomain) return;
      setOffersLoading(true);
      setOffersError("");
      try {
        const response = await fetch(
          `${appBase}/api/checkout-offers?shop=${encodeURIComponent(shopDomain)}`,
        );
        const data = await response.json();
        if (!response.ok || !data?.ok) {
          throw new Error(data?.message || `Request failed (${response.status})`);
        }
        if (!cancelled) {
          setOffersEnabled(Boolean(data.settings?.enableUpsells) && Boolean(data.settings?.allowProductEdit));
          setOfferHeading(String(data.settings?.checkoutOfferHeading || "Add the finishing touch"));
          setOffers(Array.isArray(data.products) ? data.products : []);
          setVisibleOfferCount(2);
        }
      } catch (error) {
        if (!cancelled) {
          const msg = String(error || "");
          if (/failed to fetch|networkerror|load failed/i.test(msg)) {
            setOffersError(
              "Could not reach app API. Update checkout block setting `portal_base_url` to your current app URL, then refresh checkout.",
            );
          } else {
            setOffersError(msg);
          }
          setOffers([]);
        }
      } finally {
        if (!cancelled) setOffersLoading(false);
      }
    }
    loadOffers();
    return () => {
      cancelled = true;
    };
  }, [shopDomain]);

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

  const cartVariantIds = new Set(
    cartLines.map((line) => String(line?.merchandise?.id || "")).filter(Boolean),
  );
  const displayedOffers = offers.slice(0, visibleOfferCount);
  const canShowMore = visibleOfferCount < offers.length;

  async function addVariantToCart(variantId) {
    await runAction(async () => {
      const result = await shopify.applyCartLinesChange({
        type: "addCartLine",
        merchandiseId: variantId,
        quantity: modalQtyNumber,
      });
      if (result.type === "error") throw new Error(result.message);
    }, "Product added");
  }

  async function removeCartLine(lineId, quantity) {
    await runAction(async () => {
      const result = await shopify.applyCartLinesChange({
        type: "removeCartLine",
        id: lineId,
        quantity: Number(quantity || 1),
      });
      if (result.type === "error") throw new Error(result.message);
    }, "Product removed");
  }

  function formatPrice(rawPrice) {
    const amount = Number(rawPrice || 0);
    if (!Number.isFinite(amount)) return String(rawPrice || "");
    if (shopify.i18n && typeof shopify.i18n.formatCurrency === "function") {
      return shopify.i18n.formatCurrency(amount);
    }
    return `$${amount.toFixed(2)}`;
  }

  function truncateTitle(title, max = 22) {
    const text = String(title || "");
    return text.length > max ? `${text.slice(0, max - 1)}...` : text;
  }

  return (
   
      <s-stack gap="base">
       

       
          <s-stack gap="base">
            <s-heading >{offerHeading}</s-heading>
            {offersLoading ? <s-text tone="neutral">Loading products…</s-text> : null}
            {offersError ? <s-banner tone="warning">{offersError}</s-banner> : null}
            {!offersLoading && !offersError && !offersEnabled ? (
              <s-text tone="neutral">Upsell offers are disabled in OrderFlex settings.</s-text>
            ) : null}
            {!offersLoading && !offersError && offersEnabled && offers.length === 0 ? (
              <s-text tone="neutral">No eligible products available from configured collections/products.</s-text>
            ) : null}

            {displayedOffers.length ? (
              <s-grid gap="base" gridTemplateColumns="1fr 1fr">
                {displayedOffers.map((product) => {
                  const firstVariant = product.variants[0];
                  const hasMultiple = product.variants.length > 1;
                  return (
                    <s-box key={product.id} border="base" borderRadius="base" padding="small">
                      <s-stack gap="small">
                        {product.image ? (
                          <s-image
                            borderWidth="base"
                            borderRadius="small"
                            src={product.image}
                            alt={product.title}
                            aspectRatio="1"
                          />
                        ) : (
                          <s-box border="base" borderRadius="small" padding="small">
                            <s-text tone="neutral">Image</s-text>
                          </s-box>
                        )}
                        <s-text>{truncateTitle(product.title)}</s-text>
                        <s-text tone="neutral">{formatPrice(firstVariant?.price)}</s-text>
                        {hasMultiple ? (
                          <s-button
                            inlineSize="fill"
                            disabled={!canAddLines || loading}
                            command="--show"
                            commandFor="variant-picker-modal"
                            onClick={() => {
                              setModalQty("1");
                              setModalProduct(product);
                              setSelectedVariantId(firstVariant?.id || "");
                            }}
                          >
                            Add
                          </s-button>
                        ) : (
                          <s-button
                            inlineSize="fill"
                            disabled={!canAddLines || loading}
                            onClick={async () => {
                              setModalQty("1");
                              if (firstVariant?.id) {
                                await addVariantToCart(firstVariant.id);
                              }
                            }}
                          >
                            Add
                          </s-button>
                        )}
                      </s-stack>
                    </s-box>
                  );
                })}
              </s-grid>
            ) : null}
            {canShowMore ? (
              <s-grid gridTemplateColumns="1fr auto 1fr" alignItems="center">
                <s-box />
                <s-button variant="secondary" onClick={() => setVisibleOfferCount((count) => count + 2)}>
                  Show more products
                </s-button>
                <s-box />
              </s-grid>
            ) : null}
          </s-stack>
       

        <s-modal ref={modalRef} id="variant-picker-modal" heading="Select variant" size="base">
          <s-stack gap="base">
            {modalProduct ? (
              <>
                <s-box border="base" borderRadius="small" padding="small">
                  <s-stack gap="none">
                    <s-text>{modalProduct.title}</s-text>
                    <s-select
                      label="Variant"
                      value={selectedVariantId}
                      onChange={(e) => setSelectedVariantId(e.currentTarget.value)}
                    >
                      {modalProduct.variants.map((variant) => (
                        <s-option key={variant.id} value={variant.id}>
                          {variant.title} ({variant.price})
                        </s-option>
                      ))}
                    </s-select>
                  </s-stack>
                </s-box>
                <s-number-field
                  label="Quantity"
                  value={modalQty}
                  min={1}
                  onChange={(e) => setModalQty(e.currentTarget.value)}
                />
                {modalQtyValidationError ? <s-banner tone="warning">{modalQtyValidationError}</s-banner> : null}
              </>
            ) : (
              <s-text tone="neutral">Select a product first.</s-text>
            )}
          </s-stack>
          <s-button
            slot="secondary-actions"
            variant="secondary"
            command="--hide"
            commandFor="variant-picker-modal"
            onClick={() => setModalProduct(null)}
          >
            Close
          </s-button>
          <s-button
            slot="primary-action"
            variant="primary"
            command="--hide"
            commandFor="variant-picker-modal"
            disabled={!canAddLines || !selectedVariantId || Boolean(modalQtyValidationError) || loading || !modalProduct}
            onClick={async () => {
              await addVariantToCart(selectedVariantId);
              setModalProduct(null);
            }}
          >
            Add product
          </s-button>
        </s-modal>

        {cartLines.length ? (
          <s-box border="base" borderRadius="base" padding="base">
            <s-stack gap="base">
              <s-heading>Remove items</s-heading>
              {cartLines.length <= 1 ? (
                <s-banner tone="warning">
                  At least 1 product must remain in checkout. Add another product before removing this one.
                </s-banner>
              ) : null}
              {cartLines.map((line) => (
                <s-grid key={line.id} gridTemplateColumns="1fr auto" gap="small" alignItems="center">
                  <s-text>
                    {(line?.merchandise?.title || line?.merchandise?.product?.title || "Cart item")} x
                    {Number(line?.quantity || 1)}
                  </s-text>
                  <s-button
                    variant="secondary"
                    tone="critical"
                    disabled={loading || cartLines.length <= 1}
                    onClick={async () => {
                      await removeCartLine(line.id, line.quantity || 1);
                    }}
                  >
                    Remove
                  </s-button>
                </s-grid>
              ))}
            </s-stack>
          </s-box>
        ) : null}

        {statusMessage && <s-banner tone="info">{statusMessage}</s-banner>}
      </s-stack>
  
  );
}