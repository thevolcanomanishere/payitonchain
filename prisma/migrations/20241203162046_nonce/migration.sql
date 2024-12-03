-- CreateTable
CREATE TABLE "nonce" (
    "id" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "used" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "nonce_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "nonce_nonce_key" ON "nonce"("nonce");
