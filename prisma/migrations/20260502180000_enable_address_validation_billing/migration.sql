-- Optional usage billing after customer saves shipping (merchant opt-in).
ALTER TABLE "AppSettings" ADD COLUMN "enableAddressValidationBilling" BOOLEAN NOT NULL DEFAULT false;
