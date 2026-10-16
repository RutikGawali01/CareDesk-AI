const prisma = require("../../db");

const CONFIRMATION_TTL_MS = 5 * 60 * 1000;
const AFFIRMATIVE_CONFIRMATION = /^(yes|yes please|confirm|confirmed|book it|go ahead|proceed|cancel it|reschedule it|that's correct|that is correct)[.!\s]*$/i;

function isExplicitConfirmation(message) {
  return typeof message === "string" &&
    AFFIRMATIVE_CONFIRMATION.test(message.trim());
}

function getActorKey({ clinicId, callerPhone, adminId }) {
  if (!clinicId) throw new Error("Clinic context is required.");
  if (callerPhone) return `whatsapp:${Number(clinicId)}:${String(callerPhone)}`;
  if (adminId) return `admin:${Number(clinicId)}:${Number(adminId)}`;
  throw new Error("Trusted confirmation identity is required.");
}

async function createPendingConfirmation({ actorKey, clinicId, patientId = null, actionType, payload }) {
  if (!["BOOK", "CANCEL", "RESCHEDULE"].includes(actionType)) {
    throw new Error("Unsupported appointment action.");
  }
  const now = new Date();
  return prisma.appointmentConfirmation.upsert({
    where: { actorKey },
    create: {
      actorKey,
      clinicId: Number(clinicId),
      patientId: patientId == null ? null : Number(patientId),
      actionType,
      payload,
      status: "PENDING",
      expiresAt: new Date(now.getTime() + CONFIRMATION_TTL_MS),
    },
    update: {
      clinicId: Number(clinicId),
      patientId: patientId == null ? null : Number(patientId),
      actionType,
      payload,
      status: "PENDING",
      expiresAt: new Date(now.getTime() + CONFIRMATION_TTL_MS),
    },
  });
}

async function getPendingConfirmation(actorKey) {
  const pending = await prisma.appointmentConfirmation.findUnique({
    where: { actorKey },
  });
  if (!pending || pending.status !== "PENDING") return null;
  if (pending.expiresAt <= new Date()) {
    await prisma.appointmentConfirmation.updateMany({
      where: { id: pending.id, status: "PENDING" },
      data: { status: "EXPIRED" },
    });
    return null;
  }
  return pending;
}

// Atomic one-time claim. Only one concurrent confirmation request can win.
async function consumePendingConfirmation(id, actorKey) {
  const claimed = await prisma.appointmentConfirmation.updateMany({
    where: {
      id,
      actorKey,
      status: "PENDING",
      expiresAt: { gt: new Date() },
    },
    data: { status: "CONSUMED" },
  });
  return claimed.count === 1;
}

module.exports = {
  CONFIRMATION_TTL_MS,
  isExplicitConfirmation,
  getActorKey,
  createPendingConfirmation,
  getPendingConfirmation,
  consumePendingConfirmation,
};
