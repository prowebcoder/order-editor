import db from "../db.server";

const DEFAULT_SETTINGS = {
  editWindowMinutes: 30,
  allowAddressEdit: true,
  allowProductEdit: true,
  enableUpsells: true,
  codVerification: false,
  allowDiscountCodes: true,
  upsellProductIds: [],
  upsellCollectionIds: [],
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
        codVerification: DEFAULT_SETTINGS.codVerification,
        allowDiscountCodes: DEFAULT_SETTINGS.allowDiscountCodes,
        upsellProductIds: JSON.stringify(DEFAULT_SETTINGS.upsellProductIds),
        upsellCollectionIds: JSON.stringify(DEFAULT_SETTINGS.upsellCollectionIds),
      },
    });
    return normalizeSettings(created, DEFAULT_SETTINGS.upsellCollectionIds);
  }
  const collectionIds = await readCollectionIds(shop);
  return normalizeSettings(existing, collectionIds);
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
  };

  const updated = await db.appSettings.upsert({
    where: {shop},
    create: {
      shop,
      editWindowMinutes: merged.editWindowMinutes,
      allowAddressEdit: Boolean(merged.allowAddressEdit),
      allowProductEdit: Boolean(merged.allowProductEdit),
      enableUpsells: Boolean(merged.enableUpsells),
      codVerification: Boolean(merged.codVerification),
      allowDiscountCodes: Boolean(merged.allowDiscountCodes),
      upsellProductIds: JSON.stringify(merged.upsellProductIds),
    },
    update: {
      editWindowMinutes: merged.editWindowMinutes,
      allowAddressEdit: Boolean(merged.allowAddressEdit),
      allowProductEdit: Boolean(merged.allowProductEdit),
      enableUpsells: Boolean(merged.enableUpsells),
      codVerification: Boolean(merged.codVerification),
      allowDiscountCodes: Boolean(merged.allowDiscountCodes),
      upsellProductIds: JSON.stringify(merged.upsellProductIds),
    },
  });

  await db.$executeRaw`
    UPDATE "AppSettings"
    SET "upsellCollectionIds" = ${JSON.stringify(merged.upsellCollectionIds)}
    WHERE "shop" = ${shop}
  `;

  const collectionIds = await readCollectionIds(shop);
  return normalizeSettings(updated, collectionIds);
}

function normalizeSettings(settings, collectionIds = []) {
  return {
    ...settings,
    upsellProductIds: safeJsonArray(settings.upsellProductIds),
    upsellCollectionIds: Array.isArray(collectionIds) ? collectionIds : [],
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
