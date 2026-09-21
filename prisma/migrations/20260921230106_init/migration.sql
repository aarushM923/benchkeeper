-- CreateTable
CREATE TABLE "Bench" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "zone" TEXT NOT NULL,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "material" TEXT,
    "installedYear" INTEGER,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Bench_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Donor" (
    "id" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Donor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Adoption" (
    "id" TEXT NOT NULL,
    "benchId" TEXT NOT NULL,
    "donorId" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "dedication" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelledAt" TIMESTAMP(3),

    CONSTRAINT "Adoption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Bench_code_key" ON "Bench"("code");

-- CreateIndex
CREATE INDEX "Bench_zone_idx" ON "Bench"("zone");

-- CreateIndex
CREATE UNIQUE INDEX "Donor_email_key" ON "Donor"("email");

-- CreateIndex
CREATE INDEX "Adoption_benchId_endDate_idx" ON "Adoption"("benchId", "endDate");

-- CreateIndex
CREATE INDEX "Adoption_donorId_idx" ON "Adoption"("donorId");

-- AddForeignKey
ALTER TABLE "Adoption" ADD CONSTRAINT "Adoption_benchId_fkey" FOREIGN KEY ("benchId") REFERENCES "Bench"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Adoption" ADD CONSTRAINT "Adoption_donorId_fkey" FOREIGN KEY ("donorId") REFERENCES "Donor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Hand-written: Prisma's schema language can't express these.
-- ---------------------------------------------------------------------------

-- A range must be non-empty.
ALTER TABLE "Adoption"
  ADD CONSTRAINT "Adoption_range_valid" CHECK ("startDate" < "endDate");

-- No two live adoptions of the same bench may overlap. Ranges are half-open
-- '[)', so an adoption ending on day D and one starting on day D are fine.
-- This is the concurrency-safe backstop for the app-level check in
-- src/lib/adopt.ts: two simultaneous submissions can both pass that check,
-- but Postgres will only let one insert commit (error 23P01 for the other).
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "Adoption"
  ADD CONSTRAINT "Adoption_no_overlap"
  EXCLUDE USING gist (
    "benchId" WITH =,
    daterange("startDate", "endDate", '[)') WITH &&
  ) WHERE ("cancelledAt" IS NULL);
