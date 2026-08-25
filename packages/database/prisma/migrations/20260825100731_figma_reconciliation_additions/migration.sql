-- AlterTable
ALTER TABLE "Book" ADD COLUMN     "coverPalette" TEXT;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "carrier" TEXT,
ADD COLUMN     "estimatedDeliveryMax" INTEGER,
ADD COLUMN     "estimatedDeliveryMin" INTEGER,
ADD COLUMN     "trackingUrl" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "notificationPrefs" JSONB NOT NULL DEFAULT '{}';
