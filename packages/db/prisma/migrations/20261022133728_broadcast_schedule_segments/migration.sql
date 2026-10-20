-- AlterEnum
ALTER TYPE "BroadcastStatus" ADD VALUE 'SCHEDULED';

-- AlterTable
ALTER TABLE "Broadcast" ADD COLUMN     "scheduledAt" TIMESTAMP(3),
ADD COLUMN     "segment" JSONB;

-- CreateIndex
CREATE INDEX "Broadcast_status_scheduledAt_idx" ON "Broadcast"("status", "scheduledAt");
