/*
  Warnings:

  - The `chains` column on the `merchant` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - Changed the type of `chainId` on the `payment_intent` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- AlterTable
ALTER TABLE "merchant" DROP COLUMN "chains",
ADD COLUMN     "chains" INTEGER[];

-- AlterTable
ALTER TABLE "payment_intent" ALTER COLUMN "amount" SET DATA TYPE DECIMAL(65,30),
DROP COLUMN "chainId",
ADD COLUMN     "chainId" INTEGER NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "payment_intent_from_to_amount_token_chainId_status_key" ON "payment_intent"("from", "to", "amount", "token", "chainId", "status");
