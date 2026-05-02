import {useEffect, useState} from "preact/hooks";
import {appOriginFromPortalSetting} from "./apiBase.js";

/**
 * Load banner/trust config from app API (Settings → Checkout display).
 */
export function usePublicMerchConfig(portalBaseUrl, shopDomain) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const origin = appOriginFromPortalSetting(portalBaseUrl);

  useEffect(() => {
    let cancelled = false;

    if (!origin || !shopDomain) {
      setLoading(false);
      setData(null);
      setError(!origin ? "Set App public URL on this block." : "");
      return () => {
        cancelled = true;
      };
    }

    setLoading(true);
    setError("");

    const url = `${origin}/api/checkout-banners-config?shop=${encodeURIComponent(shopDomain)}`;

    fetch(url)
      .then((r) => r.json())
      .then((payload) => {
        if (cancelled) return;
        if (!payload?.ok) throw new Error(payload?.message || "Config request failed");
        setData(payload);
      })
      .catch((e) => {
        if (cancelled) return;
        setData(null);
        setError(String(e?.message || e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [origin, shopDomain]);

  return {data, loading, error, origin};
}
