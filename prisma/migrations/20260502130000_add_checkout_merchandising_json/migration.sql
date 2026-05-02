-- Banner / trust / thank-you copy for checkout UI extension (app-managed).
ALTER TABLE "AppSettings" ADD COLUMN IF NOT EXISTS "checkoutMerchandisingJson" TEXT NOT NULL DEFAULT '{}';
