import db from "../db.server";

const DEFAULT_SETTINGS = {
  editWindowMinutes: 30,
  allowAddressEdit: true,
  allowProductEdit: true,
  enableUpsells: true,
  codVerification: false,
  allowDiscountCodes: true,
  upsellProductIds: [],
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
      },
    });
    return normalizeSettings(created);
  }
  return normalizeSettings(existing);
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

  return normalizeSettings(updated);
}

function normalizeSettings(settings) {
  return {
    ...settings,
    upsellProductIds: safeJsonArray(settings.upsellProductIds),
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
