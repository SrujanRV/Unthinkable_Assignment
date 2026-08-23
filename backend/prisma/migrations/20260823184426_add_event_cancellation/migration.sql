-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "cancellationReason" TEXT;

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "isCancelled" BOOLEAN NOT NULL DEFAULT false;
