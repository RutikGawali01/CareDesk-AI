CREATE TABLE "AppointmentConfirmation" (
    "id" TEXT NOT NULL,
    "actorKey" TEXT NOT NULL,
    "clinicId" INTEGER NOT NULL,
    "patientId" INTEGER,
    "actionType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AppointmentConfirmation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AppointmentConfirmation_actorKey_key"
ON "AppointmentConfirmation"("actorKey");

CREATE INDEX "AppointmentConfirmation_status_expiresAt_idx"
ON "AppointmentConfirmation"("status", "expiresAt");
