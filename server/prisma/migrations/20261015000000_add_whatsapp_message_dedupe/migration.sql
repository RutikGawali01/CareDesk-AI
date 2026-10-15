CREATE TABLE "WhatsAppProcessedMessage" (
    "messageId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PROCESSING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WhatsAppProcessedMessage_pkey" PRIMARY KEY ("messageId")
);
