/*
  Warnings:

  - Added the required column `merchantId` to the `payment_intent` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "payment_intent" ADD COLUMN     "merchantId" TEXT NOT NULL;

-- AddForeignKey
ALTER TABLE "payment_intent" ADD CONSTRAINT "payment_intent_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
