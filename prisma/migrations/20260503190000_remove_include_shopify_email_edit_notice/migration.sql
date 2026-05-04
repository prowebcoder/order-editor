-- Order confirmation copy is static Liquid in the admin; no app setting or metafields needed.
ALTER TABLE "AppSettings" DROP COLUMN "includeShopifyEmailEditNotice";
