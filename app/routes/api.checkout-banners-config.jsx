import {unauthenticated} from "../shopify.server";
import {getSettings} from "../services/orderflex-settings.server";

/**
 * Public storefront config for `pwc-checkout-banners-trust` extension.
 * Managed in app Settings → Checkout display. Block in customize only needs App public URL.
 */
export const loader = async ({request}) => {
  const url = new URL(request.url);
  const shop = String(url.searchParams.get("shop") || "").trim();
  if (!shop) {
    return toJson({ok: false, message: "Missing shop"}, 400);
  }

  try {
    const {admin} = await unauthenticated.admin(shop);
    void admin;
    const settings = await getSettings(shop);
    const {merchandising} = settings;

    return toJson({
      ok: true,
      editWindowMinutes: settings.editWindowMinutes,
      checkout: merchandising.checkout,
      thankyou: merchandising.thankyou,
      trust: merchandising.trust,
    });
  } catch (error) {
    return toJson({ok: false, message: String(error)}, 500);
  }
};

function toJson(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

export function options() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
