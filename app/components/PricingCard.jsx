/**
 * Pricing tier card — aligns visually with `pwc-upsell-badges-timer/app/routes/app.pricing.jsx`.
 */
export function PricingCard({
  title,
  description,
  headlinePrice,
  strikethroughPrice,
  frequency,
  priceHint,
  features,
  featuredText,
  button,
  isCurrentPlan = false,
}) {
  const freqLabel =
    frequency === "year" ? "year" : frequency === "month" ? "month" : frequency || "";

  return (
    <div
      style={{
        width: "100%",
        minWidth: 0,
        height: "100%",
        boxShadow: featuredText
          ? "0px 0px 15px 4px #CDFEE1"
          : isCurrentPlan
            ? "0px 0px 15px 4px #e3f2ff"
            : "none",
        borderRadius: ".75rem",
        position: "relative",
        backgroundColor: "#FFFFFF",
        padding: "24px",
        zIndex: "0",
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-start",
        border: isCurrentPlan
          ? "2px solid #0B69FF"
          : featuredText
            ? "2px solid #CDFEE1"
            : "1px solid #E1E3E5",
      }}
    >
      {featuredText && (
        <div
          style={{
            position: "absolute",
            top: "-15px",
            right: "6px",
            zIndex: "100",
          }}
        >
          <s-badge size="large" tone="success">
            {featuredText}
          </s-badge>
        </div>
      )}
      {isCurrentPlan && (
        <div
          style={{
            position: "absolute",
            top: "-15px",
            left: "6px",
            zIndex: "100",
          }}
        >
          <s-badge size="large" tone="info">
            Active subscription
          </s-badge>
        </div>
      )}

      <div style={{flex: "1 1 auto", display: "flex", flexDirection: "column", minHeight: 0}}>
        <s-stack direction="block" gap="large">
          <s-stack direction="block" gap="base" alignItems="start">
            <h2 style={{ fontSize: "20px", fontWeight: "bold", margin: 0 }}>{title}</h2>
            {description?.trim?.() ? <s-text tone="subdued">{description}</s-text> : null}
          </s-stack>
          <s-stack direction="block" gap="small-400">
            <s-stack direction="inline" gap="small-400" alignItems="baseline" wrap>
              {strikethroughPrice ? (
                <span
                  style={{
                    textDecoration: "line-through",
                    color: "#6D7175",
                    fontSize: "16px",
                    fontWeight: "600",
                  }}
                >
                  {strikethroughPrice}
                </span>
              ) : null}
              <span style={{ fontSize: "28px", fontWeight: "bold", margin: 0 }}>{headlinePrice}</span>
              {freqLabel ? (
                <s-text tone="subdued">
                  {" "}
                  / {freqLabel}
                </s-text>
              ) : null}
            </s-stack>
            {priceHint ? (
              <s-text tone={priceHint.includes("Save") ? "success" : "subdued"} variant="bodySm">
                {priceHint}
              </s-text>
            ) : null}
          </s-stack>
          {features?.length ? (
            <ul
              style={{
                margin: "8px 0 0",
                paddingLeft: "1.25rem",
                listStyleType: "disc",
                listStylePosition: "outside",
                fontSize: "13px",
                lineHeight: 1.45,
                color: isCurrentPlan ? "#202223" : "#616A70",
              }}
            >
              {features.map((feature, id) => (
                <li key={String(id)} style={{ marginBottom: "0.4rem", paddingLeft: "2px" }}>
                  {feature}
                </li>
              ))}
            </ul>
          ) : null}
        </s-stack>
      </div>

      <div style={{marginTop: "auto", paddingTop: "20px", width: "100%", boxSizing: "border-box"}}>
        <s-button
          href={button?.href}
          onClick={button?.onClick}
          variant={button?.variant || "secondary"}
          disabled={button?.disabled}
          loading={button?.loading}
          style={{ width: "100%" }}
        >
          {button?.content}
        </s-button>
      </div>
    </div>
  );
}
