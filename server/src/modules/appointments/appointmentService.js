const prisma = require("../../db");

// --------------------------------------------------
// GENERATE TIME SLOTS
// --------------------------------------------------

function generateSlots() {
  const slots = [];

  // Morning: 10:00 AM - 2:00 PM
  // Last appointment starts at 13:30, ends at 14:00.
  for (
    let minutes = 10 * 60;
    minutes < 14 * 60;
    minutes += 30
  ) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;

    slots.push(
      `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`
    );
  }

  // Evening: 4:00 PM - 8:00 PM
  // Last appointment starts at 19:30, ends at 20:00.
  for (
    let minutes = 16 * 60;
    minutes < 20 * 60;
    minutes += 30
  ) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;

    slots.push(
      `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`
    );
  }

  return slots;
}

// Hospital operates in India Standard Time, regardless of server timezone.
function getIndiaDateTimeParts() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  return Object.fromEntries(parts.map(({ type, value }) => [type, value]));
}

function validateSlotIsNotInPast(appointmentDate, startTime) {
  const now = getIndiaDateTimeParts();
  const today = `${now.year}-${now.month}-${now.day}`;
  if (appointmentDate < today) {
    throw new Error("Appointments cannot be booked for a past date");
  }
  if (appointmentDate === today) {
    const currentMinutes = Number(now.hour) * 60 + Number(now.minute);
    const [hour, minute] = startTime.split(":").map(Number);
    if (hour * 60 + minute <= currentMinutes) {
      throw new Error("This time has already passed. Please choose a future slot.");
    }
  }
}

// --------------------------------------------------
// DATE VALIDATION
// --------------------------------------------------

function validateAppointmentDate(appointmentDate) {
  if (typeof appointmentDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(appointmentDate)) {
    throw new Error("Invalid appointment date. Use YYYY-MM-DD.");
  }

  const requestedDate = new Date(`${appointmentDate}T00:00:00.000Z`);
  if (isNaN(requestedDate.getTime()) || requestedDate.toISOString().slice(0, 10) !== appointmentDate) {
    throw new Error("Invalid appointment date");
  }

  const now = getIndiaDateTimeParts();
  const todayString = `${now.year}-${now.month}-${now.day}`;
  const today = new Date(`${todayString}T00:00:00.000Z`);
  const maxDate = new Date(today);
  maxDate.setUTCDate(maxDate.getUTCDate() + 7);

  if (appointmentDate < todayString) {
    throw new Error("Appointments cannot be booked for a past date");
  }
  if (requestedDate > maxDate) {
    throw new Error("Appointments can only be booked up to 7 days ahead");
  }
  return requestedDate;
}

// --------------------------------------------------
// CHECK AVAILABILITY
// --------------------------------------------------

async function checkAvailability(
  doctorId,
  appointmentDate,
  startTime,
  clinicId,
  excludeAppointmentId = null
) {
  // Make sure doctor belongs to current clinic
  const doctor = await prisma.doctor.findFirst({
    where: {
      id: Number(doctorId),
      clinicId: Number(clinicId),
    },
  });

  if (!doctor) {
    return {
      available: false,
      message: "Doctor not found",
      alternatives: [],
    };
  }

  // Validate date + 7-day booking window
  let date;

  try {
    date = validateAppointmentDate(appointmentDate);
  } catch (error) {
    return {
      available: false,
      message: error.message,
      alternatives: [],
    };
  }

  // Sunday
  if (date.getUTCDay() === 0) {
    return {
      available: false,
      message: "Clinic is closed on Sundays",
      alternatives: [],
    };
  }

  // Validate time and reject slots that have already passed in India time.
  const allSlots = generateSlots();

  if (!allSlots.includes(startTime)) {
    return {
      available: false,
      message: "This is not a valid appointment slot",
      alternatives: [],
    };
  }

  try {
    validateSlotIsNotInPast(appointmentDate, startTime);
  } catch (error) {
    return { available: false, message: error.message, alternatives: [] };
  }

  // Get booked appointments for this clinic + doctor
  const bookedAppointments =
    await prisma.appointment.findMany({
      where: {
        clinicId: Number(clinicId),
        doctorId: Number(doctorId),
        appointmentDate: date,
        status: "BOOKED",
        ...(excludeAppointmentId ? { id: { not: Number(excludeAppointmentId) } } : {}),
      },
      select: {
        startTime: true,
      },
    });

  const bookedTimes = bookedAppointments.map(
    (appointment) => appointment.startTime
  );

  // Requested slot available
  if (!bookedTimes.includes(startTime)) {
    return {
      available: true,
      message: "This slot is available",
      alternatives: [],
    };
  }

  // Requested slot already booked
  const requestedIndex = allSlots.indexOf(startTime);

  const alternatives = [];

  for (
    let distance = 1;
    distance < allSlots.length;
    distance++
  ) {
    const beforeIndex = requestedIndex - distance;
    const afterIndex = requestedIndex + distance;

    if (beforeIndex >= 0) {
      const candidate = allSlots[beforeIndex];
      let candidateIsFuture = true;
      try {
        validateSlotIsNotInPast(appointmentDate, candidate);
      } catch {
        candidateIsFuture = false;
      }
      if (candidateIsFuture && !bookedTimes.includes(candidate)) {
        alternatives.push(candidate);
      }
    }

    if (afterIndex < allSlots.length) {
      const candidate = allSlots[afterIndex];
      let candidateIsFuture = true;
      try {
        validateSlotIsNotInPast(appointmentDate, candidate);
      } catch {
        candidateIsFuture = false;
      }
      if (candidateIsFuture && !bookedTimes.includes(candidate)) {
        alternatives.push(candidate);
      }
    }

    if (alternatives.length >= 2) {
      break;
    }
  }

  return {
    available: false,
    message: "This slot is already booked",
    alternatives: alternatives.slice(0, 2),
  };
}

// --------------------------------------------------
// CREATE APPOINTMENT
// --------------------------------------------------

async function createAppointment({
  clinicId,
  patientId,
  doctorId,
  appointmentDate,
  startTime,
  reason,
}) {
  // Required fields
  if (
    !clinicId ||
    !patientId ||
    !doctorId ||
    !appointmentDate ||
    !startTime
  ) {
    throw new Error(
      "clinicId, patientId, doctorId, appointmentDate and startTime are required"
    );
  }

  // Validate IDs
  if (
    !Number.isInteger(Number(clinicId)) ||
    !Number.isInteger(Number(patientId)) ||
    !Number.isInteger(Number(doctorId))
  ) {
    throw new Error(
      "Clinic ID, Patient ID and Doctor ID must be valid numbers"
    );
  }

  // Validate date + booking window
  const date = validateAppointmentDate(appointmentDate);

  // Sunday
  if (date.getUTCDay() === 0) {
    throw new Error(
      "Clinic is closed on Sundays"
    );
  }

  // Validate time
  const allSlots = generateSlots();

  if (!allSlots.includes(startTime)) {
    throw new Error("Invalid appointment time");
  }
  validateSlotIsNotInPast(appointmentDate, startTime);

  // Check patient belongs to clinic
  const patient = await prisma.patient.findFirst({
    where: {
      id: Number(patientId),
      clinicId: Number(clinicId),
    },
  });

  if (!patient) {
    throw new Error("Patient not found");
  }

  // Check doctor belongs to clinic
  const doctor = await prisma.doctor.findFirst({
    where: {
      id: Number(doctorId),
      clinicId: Number(clinicId),
    },
  });

  if (!doctor) {
    throw new Error("Doctor not found");
  }

  // Check existing appointment
  const existingAppointment =
    await prisma.appointment.findFirst({
      where: {
        clinicId: Number(clinicId),
        doctorId: Number(doctorId),
        appointmentDate: date,
        startTime,
      },
    });

  // Active booking exists
  if (
    existingAppointment &&
    existingAppointment.status === "BOOKED"
  ) {
    throw new Error(
      "This appointment slot is already booked"
    );
  }

  // Reuse cancelled appointment record
  if (
    existingAppointment &&
    existingAppointment.status === "CANCELLED"
  ) {
    return prisma.appointment.update({
      where: {
        id: existingAppointment.id,
      },

      data: {
        patientId: Number(patientId),
        status: "BOOKED",
        reason,
      },
    });
  }

  // Create new appointment
  return prisma.appointment.create({
    data: {
      clinicId: Number(clinicId),
      patientId: Number(patientId),
      doctorId: Number(doctorId),
      appointmentDate: date,
      startTime,
      reason,
      status: "BOOKED",
    },
  });
}

// --------------------------------------------------
// CANCEL APPOINTMENT
// --------------------------------------------------

async function cancelAppointment(
  appointmentId,
  clinicId,
  patientId = null
) {
  const appointment =
    await prisma.appointment.findFirst({
      where: {
        id: Number(appointmentId),
        clinicId: Number(clinicId),
        ...(patientId !== null && { patientId: Number(patientId) }),
      },
    });

  if (!appointment) {
    throw new Error("Appointment not found");
  }

  if (
    appointment.status === "CANCELLED"
  ) {
    throw new Error(
      "Appointment is already cancelled"
    );
  }

  return prisma.appointment.update({
    where: {
      id: Number(appointmentId),
    },

    data: {
      status: "CANCELLED",
    },
  });
}

// --------------------------------------------------
// RESCHEDULE APPOINTMENT
// --------------------------------------------------

async function rescheduleAppointment(
  appointmentId,
  newDate,
  newTime,
  clinicId,
  patientId = null
) {
  const appointment =
    await prisma.appointment.findFirst({
      where: {
        id: Number(appointmentId),
        clinicId: Number(clinicId),
        ...(patientId !== null && { patientId: Number(patientId) }),
      },
    });

  if (!appointment) {
    throw new Error("Appointment not found");
  }

  if (
    appointment.status !== "BOOKED"
  ) {
    throw new Error(
      "Only booked appointments can be rescheduled"
    );
  }

  // Check new slot
  const availability =
    await checkAvailability(
      appointment.doctorId,
      newDate,
      newTime,
      clinicId,
      Number(appointmentId)
    );

  if (!availability.available) {
    const error = new Error(
      "New slot is not available"
    );

    error.alternatives =
      availability.alternatives;

    throw error;
  }

  // Validate new date
  const date =
    validateAppointmentDate(newDate);

  return prisma.appointment.update({
    where: {
      id: Number(appointmentId),
    },

    data: {
      appointmentDate: date,
      startTime: newTime,
    },
  });
}

// --------------------------------------------------
// FIND PATIENT APPOINTMENT
// --------------------------------------------------

async function findPatientAppointment({
  clinicId,
  patientId,
  doctorId,
  appointmentDate,
  startTime,
  appointmentId,
}) {
  const where = {
    clinicId: Number(clinicId),
    patientId: Number(patientId),
    status: "BOOKED",
  };

  if (appointmentId) {
    where.id = Number(appointmentId);
  }

  if (doctorId) {
    where.doctorId = Number(doctorId);
  }

  if (appointmentDate) {
    where.appointmentDate =
      new Date(
        `${appointmentDate}T00:00:00.000Z`
      );
  }

  if (startTime) {
    where.startTime = startTime;
  }

  const appointment =
    await prisma.appointment.findFirst({
      where,

      orderBy: {
        startTime: "asc",
      },
    });

  if (!appointment) {
    return {
      found: false,
      message:
        "No matching booked appointment was found.",
    };
  }

  return {
    found: true,
    message: "Appointment found.",
    appointment,
  };
}

// --------------------------------------------------
// EXPORTS
// --------------------------------------------------

module.exports = {
  generateSlots,
  checkAvailability,
  createAppointment,
  cancelAppointment,
  rescheduleAppointment,
  findPatientAppointment,
};