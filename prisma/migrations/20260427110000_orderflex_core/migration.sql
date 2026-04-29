-- CreateTable
CREATE TABLE "AppSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "editWindowMinutes" INTEGER NOT NULL DEFAULT 30,
    "allowAddressEdit" BOOLEAN NOT NULL DEFAULT true,
    "allowProductEdit" BOOLEAN NOT NULL DEFAULT true,
    "enableUpsells" BOOLEAN NOT NULL DEFAULT true,
    "codVerification" BOOLEAN NOT NULL DEFAULT false,
    "allowDiscountCodes" BOOLEAN NOT NULL DEFAULT true,
    "upsellProductIds" TEXT NOT NULL DEFAULT '[]',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "EditSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "customerEmail" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "paymentStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "otpRequired" BOOLEAN NOT NULL DEFAULT false,
    "otpVerified" BOOLEAN NOT NULL DEFAULT false,
    "usedAt" TIMESTAMP(3),
    "metadata" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "OrderEditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "editSessionId" TEXT,
    "changes" TEXT NOT NULL,
    "priceDelta" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "AppSettings_shop_key" ON "AppSettings"("shop");

-- CreateIndex
CREATE UNIQUE INDEX "EditSession_token_key" ON "EditSession"("token");

-- CreateIndex
CREATE INDEX "EditSession_shop_orderId_idx" ON "EditSession"("shop", "orderId");

-- CreateIndex
CREATE INDEX "EditSession_token_status_idx" ON "EditSession"("token", "status");

-- CreateIndex
CREATE INDEX "OrderEditLog_shop_orderId_createdAt_idx" ON "OrderEditLog"("shop", "orderId", "createdAt");
