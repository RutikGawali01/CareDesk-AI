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

// Atomic claim transitioning PENDING -> PROCESSING
async function claimPendingConfirmation(id, actorKey, db = getPrisma()) {
  const claimed = await db.appointmentConfirmation.updateMany({
    where: {
      id,
      actorKey,
      status: "PENDING",
      expiresAt: { gt: new Date() },
    },
    data: { status: "PROCESSING" },
  });
  return claimed.count === 1;
}

// Atomic one-time claim. Backward-compatible direct claim to CONSUMED.
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

async function markConfirmationConsumed(id, actorKey, db = getPrisma()) {
  return db.appointmentConfirmation.updateMany({
    where: { id, actorKey },
    data: { status: "CONSUMED" },
  });
}

async function markConfirmationFailed(id, actorKey, failureReason, db = getPrisma()) {
  const record = await db.appointmentConfirmation.findUnique({ where: { actorKey } }).catch(() => null);
  const payload =
    record?.payload && typeof record.payload === "object"
      ? { ...record.payload, failureReason }
      : { failureReason };
  return db.appointmentConfirmation.updateMany({
    where: { id, actorKey },
    data: { status: "FAILED", payload },
  });
}

async function markConfirmationUncertain(id, actorKey, failureReason, db = getPrisma()) {
  const record = await db.appointmentConfirmation.findUnique({ where: { actorKey } }).catch(() => null);
  const payload =
    record?.payload && typeof record.payload === "object"
      ? { ...record.payload, failureReason, uncertainAt: new Date().toISOString() }
      : { failureReason, uncertainAt: new Date().toISOString() };
  return db.appointmentConfirmation.updateMany({
    where: { id, actorKey },
    data: { status: "UNCERTAIN", payload },
  });
}

async function releasePendingConfirmation(id, actorKey, db = getPrisma()) {
  const record = await db.appointmentConfirmation.findUnique({ where: { actorKey } }).catch(() => null);
  if (!record || record.id !== id) return false;
  const isExpired = new Date(record.expiresAt) <= new Date();
  const nextStatus = isExpired ? "EXPIRED" : "PENDING";
  const updated = await db.appointmentConfirmation.updateMany({
    where: { id, actorKey, status: "PROCESSING" },
    data: { status: nextStatus },
  });
  return updated.count === 1;
}

async function verifyAppointmentCommitted({ pending, clinicId, patientId, db = getPrisma() }) {
  if (!pending || !pending.actionType || !db?.appointment?.findFirst) {
    return false;
  }
  try {
    if (pending.actionType === "BOOK") {
      const match = await db.appointment.findFirst({
        where: {
          clinicId: Number(clinicId),
          doctorId: Number(pending.payload.doctorId),
          appointmentDate: new Date(pending.payload.appointmentDate),
          startTime: pending.payload.startTime,
          patientId: patientId != null ? Number(patientId) : Number(pending.payload.patientId),
          status: "BOOKED",
        },
      });
      return !!match;
    }
    if (pending.actionType === "RESCHEDULE") {
      const match = await db.appointment.findFirst({
        where: {
          id: Number(pending.payload.appointmentId),
          clinicId: Number(clinicId),
          appointmentDate: new Date(pending.payload.newDate),
          startTime: pending.payload.newTime,
        },
      });
      return !!match;
    }
    if (pending.actionType === "CANCEL") {
      const match = await db.appointment.findFirst({
        where: {
          id: Number(pending.payload.appointmentId),
          clinicId: Number(clinicId),
          status: "CANCELLED",
        },
      });
      return !!match;
    }
  } catch {
    return false;
  }
  return false;
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
        failureType: "MUTATION_DISABLED",
        error: "Appointment booking is currently disabled.",
        message: "Appointment booking is currently disabled.",
      };
    }

    // Revalidate slot availability immediately before execution
    let availability;
    try {
      availability = await checkAvailability(
        Number(pending.payload.doctorId),
        pending.payload.appointmentDate,
        pending.payload.startTime,
        Number(clinicId)
      );
    } catch (availErr) {
      return {
        success: false,
        preMutationException: true,
        error: availErr.message || "Availability check failed",
        message:
          "A temporary system issue occurred while checking appointment availability. Please reply 'yes' to try again.",
      };
    }

    if (!availability.available) {
      return {
        success: false,
        availabilityFailed: true,
        error: "Slot no longer available",
        message:
          availability.message ||
          "That appointment slot is no longer available. Please select another time.",
      };
    }

    let bookingResult;
    try {
      bookingResult = await bookAppointment({
        ...pending.payload,
        clinicId: Number(clinicId),
      });
    } catch (mutationErr) {
      return {
        success: false,
        mutationException: true,
        error: mutationErr.message || "Booking exception",
        message:
          "There was a system interruption while finalizing your appointment. To prevent duplicate bookings, please check your appointment status or contact the clinic before trying again.",
      };
    }

    if (!bookingResult.success) {
      return {
        success: false,
        mutationFailed: true,
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
        failureType: "MUTATION_DISABLED",
        error: "Appointment cancellation is currently disabled.",
        message: "Appointment cancellation is currently disabled.",
      };
    }

    let cancelResult;
    try {
      cancelResult = await cancelAppointment({
        appointmentId: Number(pending.payload.appointmentId),
        clinicId: Number(clinicId),
        patientId:
          pending.payload.patientId != null
            ? Number(pending.payload.patientId)
            : patientId != null
            ? Number(patientId)
            : undefined,
      });
    } catch (err) {
      return {
        success: false,
        mutationException: true,
        error: err.message || "Cancellation failed",
        message:
          "There was a system interruption while cancelling your appointment. To prevent duplicate actions, please check your appointment status or contact the clinic.",
      };
    }

    if (cancelResult && cancelResult.success === false) {
      return {
        success: false,
        mutationFailed: true,
        error: cancelResult.error || "Cancellation failed",
        message:
          cancelResult.error ||
          cancelResult.message ||
          "Could not cancel the appointment. Please contact the hospital.",
      };
    }

    return {
      success: true,
      actionType: "CANCEL",
      appointment: cancelResult?.appointment || cancelResult,
      message: "Your appointment has been successfully cancelled.",
    };
  }

  if (pending.actionType === "RESCHEDULE") {
    if (!allowAppointmentChanges) {
      return {
        success: false,
        failureType: "MUTATION_DISABLED",
        error: "Appointment rescheduling is currently disabled.",
        message: "Appointment rescheduling is currently disabled.",
      };
    }

    // Revalidate slot availability for the new date and time
    let availability;
    try {
      availability = await checkAvailability(
        Number(pending.payload.doctorId),
        pending.payload.newDate,
        pending.payload.newTime,
        Number(clinicId),
        Number(pending.payload.appointmentId)
      );
    } catch (availErr) {
      return {
        success: false,
        preMutationException: true,
        error: availErr.message || "Availability check failed",
        message:
          "A temporary system issue occurred while checking appointment availability. Please reply 'yes' to try again.",
      };
    }

    if (!availability.available) {
      return {
        success: false,
        availabilityFailed: true,
        error: "New slot no longer available",
        message:
          availability.message ||
          "That new appointment slot is no longer available. Please select another time.",
      };
    }

    let rescheduleResult;
    try {
      rescheduleResult = await rescheduleAppointment({
        appointmentId: Number(pending.payload.appointmentId),
        newDate: pending.payload.newDate,
        newTime: pending.payload.newTime,
        clinicId: Number(clinicId),
        patientId:
          pending.payload.patientId != null
            ? Number(pending.payload.patientId)
            : patientId != null
            ? Number(patientId)
            : undefined,
      });
    } catch (err) {
      return {
        success: false,
        mutationException: true,
        error: err.message || "Rescheduling failed",
        message:
          "There was a system interruption while finalizing your appointment. To prevent duplicate bookings, please check your appointment status or contact the clinic before trying again.",
      };
    }

    if (rescheduleResult && rescheduleResult.success === false) {
      return {
        success: false,
        mutationFailed: true,
        error: rescheduleResult.error || "Rescheduling failed",
        message:
          rescheduleResult.error ||
          rescheduleResult.message ||
          "Could not reschedule the appointment. Please choose another time.",
      };
    }

    const updatedAppt = rescheduleResult?.appointment || rescheduleResult;

    return {
      success: true,
      actionType: "RESCHEDULE",
      appointment: updatedAppt,
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
  claimPendingConfirmation,
  consumePendingConfirmation,
  markConfirmationConsumed,
  markConfirmationFailed,
  markConfirmationUncertain,
  releasePendingConfirmation,
  verifyAppointmentCommitted,
  validatePendingConfirmationScope,
  executeConfirmedAppointmentMutation,
};
