import db from "../db.server";

const DEFAULT_SETTINGS = {
  editWindowMinutes: 30,
  allowAddressEdit: true,
  allowProductEdit: true,
  enableUpsells: true,
  allowDiscountCodes: true,
  upsellProductIds: [],
  upsellCollectionIds: [],
  checkoutOfferHeading: "Add the finishing touch",
};

export async function getSettings(shop) {
  const existing = await db.appSettings.findUnique({where: {shop}});
  if (!existing) {
    const created = await db.appSettings.create({
      data: {
        shop,
        editWindowMinutes: DEFAULT_SETTINGS.editWindowMinutes,
        allowAddressEdit: DEFAULT_SETTINGS.allowAddressEdit,
        allowProductEdit: DEFAULT_SETTINGS.allowProductEdit,
        enableUpsells: DEFAULT_SETTINGS.enableUpsells,
        allowDiscountCodes: DEFAULT_SETTINGS.allowDiscountCodes,
        upsellProductIds: JSON.stringify(DEFAULT_SETTINGS.upsellProductIds),
        upsellCollectionIds: JSON.stringify(DEFAULT_SETTINGS.upsellCollectionIds),
      },
    });
    return normalizeSettings(
      created,
      DEFAULT_SETTINGS.upsellCollectionIds,
      DEFAULT_SETTINGS.checkoutOfferHeading,
    );
  }
  const collectionIds = await readCollectionIds(shop);
  const checkoutOfferHeading = await readCheckoutOfferHeading(shop);
  return normalizeSettings(existing, collectionIds, checkoutOfferHeading);
}

export async function updateSettings(shop, payload) {
  const current = await getSettings(shop);
  const merged = {
    ...current,
    ...payload,
    editWindowMinutes: Number(payload.editWindowMinutes ?? current.editWindowMinutes),
    upsellProductIds: Array.isArray(payload.upsellProductIds)
      ? payload.upsellProductIds
      : current.upsellProductIds,
    upsellCollectionIds: Array.isArray(payload.upsellCollectionIds)
      ? payload.upsellCollectionIds
      : current.upsellCollectionIds,
    checkoutOfferHeading: String(
      payload.checkoutOfferHeading ?? current.checkoutOfferHeading ?? DEFAULT_SETTINGS.checkoutOfferHeading,
    ).trim() || DEFAULT_SETTINGS.checkoutOfferHeading,
  };

  const updated = await db.appSettings.upsert({
    where: {shop},
    create: {
      shop,
      editWindowMinutes: merged.editWindowMinutes,
      allowAddressEdit: Boolean(merged.allowAddressEdit),
      allowProductEdit: Boolean(merged.allowProductEdit),
      enableUpsells: Boolean(merged.enableUpsells),
      allowDiscountCodes: Boolean(merged.allowDiscountCodes),
      upsellProductIds: JSON.stringify(merged.upsellProductIds),
    },
    update: {
      editWindowMinutes: merged.editWindowMinutes,
      allowAddressEdit: Boolean(merged.allowAddressEdit),
      allowProductEdit: Boolean(merged.allowProductEdit),
      enableUpsells: Boolean(merged.enableUpsells),
      allowDiscountCodes: Boolean(merged.allowDiscountCodes),
      upsellProductIds: JSON.stringify(merged.upsellProductIds),
    },
  });

  try {
    await db.$executeRaw`
      UPDATE "AppSettings"
      SET "upsellCollectionIds" = ${JSON.stringify(merged.upsellCollectionIds)},
          "checkoutOfferHeading" = ${merged.checkoutOfferHeading}
      WHERE "shop" = ${shop}
    `;
  } catch (error) {
    if (!isMissingColumnError(error)) throw error;
    // Migration not applied yet: keep app usable with defaults.
    await db.$executeRaw`
      UPDATE "AppSettings"
      SET "upsellCollectionIds" = ${JSON.stringify(merged.upsellCollectionIds)}
      WHERE "shop" = ${shop}
    `;
  }

  const collectionIds = await readCollectionIds(shop);
  const checkoutOfferHeading = await readCheckoutOfferHeading(shop);
  return normalizeSettings(updated, collectionIds, checkoutOfferHeading);
}

function normalizeSettings(settings, collectionIds = [], checkoutOfferHeading = DEFAULT_SETTINGS.checkoutOfferHeading) {
  return {
    ...settings,
    upsellProductIds: safeJsonArray(settings.upsellProductIds),
    upsellCollectionIds: Array.isArray(collectionIds) ? collectionIds : [],
    checkoutOfferHeading: String(checkoutOfferHeading || DEFAULT_SETTINGS.checkoutOfferHeading),
  };
}

function safeJsonArray(value) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function readCollectionIds(shop) {
  const rows = await db.$queryRaw`
    SELECT "upsellCollectionIds"
    FROM "AppSettings"
    WHERE "shop" = ${shop}
    LIMIT 1
  `;
  const value = rows?.[0]?.upsellCollectionIds ?? "[]";
  return safeJsonArray(value);
}

async function readCheckoutOfferHeading(shop) {
  try {
    const rows = await db.$queryRaw`
      SELECT "checkoutOfferHeading"
      FROM "AppSettings"
      WHERE "shop" = ${shop}
      LIMIT 1
    `;
    return String(rows?.[0]?.checkoutOfferHeading || DEFAULT_SETTINGS.checkoutOfferHeading);
  } catch (error) {
    if (!isMissingColumnError(error)) throw error;
    return DEFAULT_SETTINGS.checkoutOfferHeading;
  }
}

function isMissingColumnError(error) {
  const message = String(error?.message || "");
  return message.includes("42703") || /column .* does not exist/i.test(message);
}
