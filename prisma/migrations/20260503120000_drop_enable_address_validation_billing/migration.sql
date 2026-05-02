-- Usage billing is tied to the subscription plan, not a merchant toggle.
ALTER TABLE "AppSettings" DROP COLUMN IF EXISTS "enableAddressValidationBilling";
