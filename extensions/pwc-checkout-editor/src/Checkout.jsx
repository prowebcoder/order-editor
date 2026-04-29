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
  const [showOfferStep, setShowOfferStep] = useState(false);
  const [variantImageUrl, setVariantImageUrl] = useState("");
  const [variantList, setVariantList] = useState([]);
  const [optionSelections, setOptionSelections] = useState({});

  const configuredUpsellVariantId = shopify.settings?.current?.upsell_variant_id ?? "";
  const upsellTitle = shopify.settings?.current?.upsell_title ?? "Featured item";
  const upsellPrice = shopify.settings?.current?.upsell_price ?? "";
  const upsellImage = shopify.settings?.current?.upsell_image_url ?? "";
  const fallbackVariantId = cartLines[0]?.merchandise?.id ?? "";
  const variantFromOptions = variantList.find((variant) =>
    (variant.selectedOptions ?? []).every(
      (opt) => !optionSelections[opt.name] || optionSelections[opt.name] === opt.value,
    ),
  );
  const effectiveUpsellVariantId =
    variantFromOptions?.id ||
    variantList[0]?.id ||
    configuredUpsellVariantId ||
    fallbackVariantId;
  const canAddLines = instructions?.lines?.canAddCartLine === true;
  const addBlockedReason = !effectiveUpsellVariantId
    ? "No variant available. Configure `upsell_variant_id` or ensure cart has at least one line."
    : !canAddLines
      ? "This checkout does not allow cart line additions at this step."
      : "";
  const optionMap = variantList.reduce((acc, variant) => {
    for (const option of variant.selectedOptions ?? []) {
      if (!acc[option.name]) acc[option.name] = new Set();
      acc[option.name].add(option.value);
    }
    return acc;
  }, {});
  const optionGroups = Object.entries(optionMap).map(([name, valuesSet]) => ({
    name,
    values: Array.from(valuesSet),
  }));
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

    async function loadProductData() {
      if (!configuredUpsellVariantId) {
        setVariantList([]);
        setVariantImageUrl("");
        return;
      }

      try {
        const response = await shopify.query(
          `#graphql
            query ProductVariants($id: ID!) {
              node(id: $id) {
                ... on ProductVariant {
                  image {
                    url
                  }
                  product {
                    featuredImage {
                      url
                    }
                    variants(first: 50) {
                      nodes {
                        id
                        title
                        selectedOptions {
                          name
                          value
                        }
                        image {
                          url
                        }
                        price
                      }
                    }
                  }
                }
              }
            }`,
          {variables: {id: configuredUpsellVariantId}},
        );
        const data = /** @type {any} */ (response?.data);
        const variants = data?.node?.product?.variants?.nodes ?? [];
        const image =
          data?.node?.image?.url ??
          variants?.[0]?.image?.url ??
          data?.node?.product?.featuredImage?.url ??
          "";
        const defaultSelections = {};
        for (const option of variants?.[0]?.selectedOptions ?? []) {
          defaultSelections[option.name] = option.value;
        }
        if (!cancelled) {
          setVariantList(variants);
          setOptionSelections(defaultSelections);
          setVariantImageUrl(image);
        }
      } catch {
        if (!cancelled) {
          setVariantList([]);
          setVariantImageUrl("");
        }
      }
    }

    loadProductData();
    return () => {
      cancelled = true;
    };
  }, [configuredUpsellVariantId]);

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
                  {variantFromOptions?.title ? <s-text tone="neutral">{variantFromOptions.title}</s-text> : null}
                </s-stack>
              </s-stack>
            </s-box>

            {optionGroups.map((group) => (
              <s-stack key={group.name} gap="small">
                <s-text>{group.name}: {optionSelections[group.name] || "-"}</s-text>
                <s-stack direction="inline" gap="small">
                  {group.values.map((value) => (
                    <s-button
                      key={`${group.name}-${value}`}
                      variant={optionSelections[group.name] === value ? "primary" : "secondary"}
                      onClick={() =>
                        setOptionSelections((prev) => ({
                          ...prev,
                          [group.name]: value,
                        }))
                      }
                    >
                      {value}
                    </s-button>
                  ))}
                </s-stack>
              </s-stack>
            ))}

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
                    attributes: Object.entries(optionSelections).map(([key, value]) => ({
                      key: `selected_${key.toLowerCase()}`,
                      value: String(value),
                    })),
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

        {statusMessage && <s-banner tone="info">{statusMessage}</s-banner>}
      </s-stack>
    </s-box>
  );
}