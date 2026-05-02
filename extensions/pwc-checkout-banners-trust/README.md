# PWC — Checkout banners & trust

**Separate** extension from `pwc-checkout-editor` (which stays focused on order editing + upsells).

## Customize checkout designer → App URL only

In Shopify Checkout Customize → apps → **pwc-checkout-banners-trust**:

- Set **App public URL** exactly like the Order Editor checkout block (`https://your-app.vercel.app`, no trailing path needed).

Everything else—banner modes, thank-you headline, trust row, image URLs—is loaded from your embedded app via:

`GET /api/checkout-banners-config?shop=YOURSHOP.myshopify.com`

## Embedded app → Settings → Checkout display

Merchants configure banners, thank-you messaging, trust row, and CDN image URLs in **Settings → Checkout display**. Images: upload under **Admin → Content → Files**, paste the HTTPS URL into the matching field.

Deploy / run migrations so `AppSettings.checkoutMerchandisingJson` exists (see root Prisma migrations).
