import {useEffect, useRef} from "react";
import {useFetcher} from "react-router";

/**
 * Image URL bound to merchandising JSON, with optional upload to Shopify Files (same mechanism as Content → Files).
 */
export function MerchShopifyImageField({label, details, value, disabled, patchMerch, section, urlKey}) {
  const fetcher = useFetcher();
  const inputRef = useRef(null);
  const nonceRef = useRef(0);
  const lastAppliedSig = useRef(null);

  const busy = fetcher.state !== "idle";
  const err =
    fetcher.state === "idle" && fetcher.data && typeof fetcher.data === "object" && fetcher.data.ok === false
      ? String(fetcher.data.message || "Upload failed")
      : "";

  useEffect(() => {
    if (fetcher.state !== "idle") return;
    const d = fetcher.data;
    if (!d || typeof d !== "object" || !d.ok || !d.url) return;
    const sig = `${String(d.clientNonce)}|${d.url}`;
    if (lastAppliedSig.current === sig) return;
    lastAppliedSig.current = sig;
    patchMerch(section, urlKey, d.url);
    // Patch only when fetcher settles with a success payload we have not applied yet.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher.state, fetcher.data, section, urlKey]);

  function openPicker() {
    inputRef.current?.click?.();
  }

  function onFileChange(ev) {
    const file = ev.currentTarget.files?.[0];
    ev.currentTarget.value = "";
    if (!file) return;
    nonceRef.current += 1;
    const n = nonceRef.current;
    const fd = new FormData();
    fd.set("file", file);
    fd.set("clientNonce", String(n));
    fetcher.submit(fd, {
      method: "POST",
      encType: "multipart/form-data",
      action: "/api/shopify-upload-image",
    });
  }

  return (
    <s-stack direction="block" gap="small">
      <s-text-field
        label={label}
        value={String(value || "")}
        disabled={disabled || busy}
        details={details}
        onInput={(e) => patchMerch(section, urlKey, e?.currentTarget?.value ?? "")}
      />
      <s-stack direction="inline" gap="small" wrap alignItems="center">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          style={{display: "none"}}
          disabled={disabled || busy}
          onChange={onFileChange}
        />
        <s-button type="button" variant="secondary" loading={busy} disabled={disabled} onClick={openPicker}>
          Upload to store Files
        </s-button>
      </s-stack>
      {err ? (
        <s-banner tone="critical">
          <s-text variant="bodySm">{err}</s-text>
        </s-banner>
      ) : null}
    </s-stack>
  );
}
