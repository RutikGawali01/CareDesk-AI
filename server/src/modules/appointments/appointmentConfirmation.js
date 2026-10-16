function getPrisma() { return require("../../db"); }

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

async function createPendingConfirmation(
  { actorKey, clinicId, patientId = null, actionType, payload },
  db = getPrisma()
) {
  if (!["BOOK", "CANCEL", "RESCHEDULE"].includes(actionType)) {
    throw new Error("Unsupported appointment action.");
  }
  const now = new Date();
  return db.appointmentConfirmation.upsert({
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

async function getPendingConfirmation(actorKey, db = getPrisma()) {
  const pending = await db.appointmentConfirmation.findUnique({
    where: { actorKey },
  });
  if (!pending || pending.status !== "PENDING") return null;
  if (pending.expiresAt <= new Date()) {
    await db.appointmentConfirmation.updateMany({
      where: { id: pending.id, status: "PENDING" },
      data: { status: "EXPIRED" },
    });
    return null;
  }
  return pending;
}

// Atomic one-time claim. Only one concurrent confirmation request can win.
async function consumePendingConfirmation(id, actorKey, db = getPrisma()) {
  const claimed = await db.appointmentConfirmation.updateMany({
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

function validatePendingConfirmationScope({ pending, clinicId, patientId = null }) {
  if (!pending) {
    throw new Error("Pending confirmation record is required.");
  }
  if (
    Number(pending.clinicId) !== Number(clinicId) ||
    Number(pending.payload?.clinicId) !== Number(clinicId)
  ) {
    throw new Error("Cross-clinic access denied.");
  }
  if (
    patientId !== null &&
    (Number(pending.patientId) !== Number(patientId) ||
      Number(pending.payload?.patientId) !== Number(patientId))
  ) {
    throw new Error("Unauthorized patient access denied.");
  }
  return true;
}

async function executeConfirmedAppointmentMutation({
  pending,
  clinicId,
  patientId = null,
  allowBooking = true,
  allowAppointmentChanges = true,
  services = {},
}) {
  validatePendingConfirmationScope({ pending, clinicId, patientId });

  const checkAvailability =
    services.checkAvailability ||
    require("./appointmentService").checkAvailability;
  const bookAppointment =
    services.bookAppointment ||
    require("../../tools/appointmentTools").bookAppointmentTool;
  const cancelAppointment =
    services.cancelAppointment ||
    require("../../tools/appointmentTools").cancelAppointmentTool;
  const rescheduleAppointment =
    services.rescheduleAppointment ||
    require("../../tools/appointmentTools").rescheduleAppointmentTool;

  if (pending.actionType === "BOOK") {
    if (!allowBooking) {
      return {
        success: false,
        error: "Appointment booking is currently disabled.",
        message: "Appointment booking is currently disabled.",
      };
    }

    // Revalidate slot availability immediately before execution
    const availability = await checkAvailability(
      Number(pending.payload.doctorId),
      pending.payload.appointmentDate,
      pending.payload.startTime,
      Number(clinicId)
    );

    if (!availability.available) {
      return {
        success: false,
        error: "Slot no longer available",
        message:
          availability.message ||
          "That appointment slot is no longer available. Please select another time.",
      };
    }

    const bookingResult = await bookAppointment({
      ...pending.payload,
      clinicId: Number(clinicId),
    });

    if (!bookingResult.success) {
      return {
        success: false,
        error: bookingResult.error || "Booking failed",
        message:
          bookingResult.error ||
          "Could not complete the booking. Please choose another time.",
      };
    }

    const docName = pending.payload.doctorName || "your doctor";
    return {
      success: true,
      actionType: "BOOK",
      appointment: bookingResult.appointment,
      message: `Your appointment with Dr. ${docName} on ${pending.payload.appointmentDate} at ${pending.payload.startTime} has been successfully confirmed and booked.`,
    };
  }

  if (pending.actionType === "CANCEL") {
    if (!allowAppointmentChanges) {
      return {
        success: false,
        error: "Appointment cancellation is currently disabled.",
        message: "Appointment cancellation is currently disabled.",
      };
    }

    const cancelResult = await cancelAppointment({
      appointmentId: Number(pending.payload.appointmentId),
      clinicId: Number(clinicId),
      patientId: pending.payload.patientId != null ? Number(pending.payload.patientId) : undefined,
    });

    if (!cancelResult.success) {
      return {
        success: false,
        error: cancelResult.error || "Cancellation failed",
        message:
          cancelResult.error ||
          "Could not cancel the appointment. Please contact the hospital.",
      };
    }

    return {
      success: true,
      actionType: "CANCEL",
      message: "Your appointment has been successfully cancelled.",
    };
  }

  if (pending.actionType === "RESCHEDULE") {
    if (!allowAppointmentChanges) {
      return {
        success: false,
        error: "Appointment rescheduling is currently disabled.",
        message: "Appointment rescheduling is currently disabled.",
      };
    }

    // Revalidate slot availability for the new date and time
    const availability = await checkAvailability(
      Number(pending.payload.doctorId),
      pending.payload.newDate,
      pending.payload.newTime,
      Number(clinicId),
      Number(pending.payload.appointmentId)
    );

    if (!availability.available) {
      return {
        success: false,
        error: "New slot no longer available",
        message:
          availability.message ||
          "That new appointment slot is no longer available. Please select another time.",
      };
    }

    const rescheduleResult = await rescheduleAppointment({
      appointmentId: Number(pending.payload.appointmentId),
      newDate: pending.payload.newDate,
      newTime: pending.payload.newTime,
      clinicId: Number(clinicId),
      patientId: pending.payload.patientId != null ? Number(pending.payload.patientId) : undefined,
    });

    if (!rescheduleResult.success) {
      return {
        success: false,
        error: rescheduleResult.error || "Rescheduling failed",
        message:
          rescheduleResult.error ||
          "Could not reschedule the appointment. Please choose another time.",
      };
    }

    return {
      success: true,
      actionType: "RESCHEDULE",
      message: `Your appointment has been successfully rescheduled to ${pending.payload.newDate} at ${pending.payload.newTime}.`,
    };
  }

  throw new Error(`Unsupported appointment action: ${pending.actionType}`);
}

module.exports = {
  CONFIRMATION_TTL_MS,
  isExplicitConfirmation,
  getActorKey,
  createPendingConfirmation,
  getPendingConfirmation,
  consumePendingConfirmation,
  validatePendingConfirmationScope,
  executeConfirmedAppointmentMutation,
};
