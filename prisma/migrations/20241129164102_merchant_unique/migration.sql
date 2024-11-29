/*
  Warnings:

  - A unique constraint covering the columns `[address]` on the table `merchant` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "merchant_address_key" ON "merchant"("address");
