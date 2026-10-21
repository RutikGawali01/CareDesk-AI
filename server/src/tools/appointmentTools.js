const {
  checkAvailability,
  createAppointment,
  cancelAppointment,
  rescheduleAppointment,
  findPatientAppointment,
} = require("../modules/appointments/appointmentService");

async function checkAvailabilityTool({
  clinicId,
  doctorId,
  appointmentDate,
  startTime,
  excludeAppointmentId,
}) {
  return await checkAvailability(
    doctorId,
    appointmentDate,
    startTime,
    clinicId,
    excludeAppointmentId
  );
}

async function bookAppointmentTool({
  clinicId,
  patientId,
  doctorId,
  appointmentDate,
  startTime,
  reason,
}) {
  const availability = await checkAvailability(
    doctorId,
    appointmentDate,
    startTime,
    clinicId
  );

  if (!availability.available) {
    return {
      success: false,
      message: availability.message,
      alternatives: availability.alternatives,
    };
  }

  const appointment = await createAppointment({
    clinicId,
    patientId,
    doctorId,
    appointmentDate,
    startTime,
    reason,
  });

  return {
    success: true,
    message: "Appointment booked successfully",
    appointment,
  };
}

async function cancelAppointmentTool({
  clinicId,
  patientId,
  appointmentId,
}) {
  try {
    const appointment = await cancelAppointment(
      appointmentId,
      clinicId,
      patientId
    );
    return {
      success: true,
      message: "Appointment cancelled successfully",
      appointment,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message || "Cancellation failed",
      message: error.message || "Cancellation failed",
    };
  }
}

async function rescheduleAppointmentTool({
  clinicId,
  patientId,
  appointmentId,
  newDate,
  newTime,
}) {
  try {
    const appointment = await rescheduleAppointment(
      appointmentId,
      newDate,
      newTime,
      clinicId,
      patientId
    );
    return {
      success: true,
      message: "Appointment rescheduled successfully",
      appointment,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message || "Rescheduling failed",
      message: error.message || "Rescheduling failed",
      alternatives: error.alternatives,
    };
  }
}

async function findPatientAppointmentTool({
  clinicId,
  patientId,
  doctorId,
  appointmentDate,
  startTime,
  appointmentId,
}) {
  return await findPatientAppointment({
    clinicId,
    patientId,
    doctorId,
    appointmentDate,
    startTime,
    appointmentId,
  });
}

module.exports = {
  checkAvailabilityTool,
  bookAppointmentTool,
  cancelAppointmentTool,
  rescheduleAppointmentTool,
  findPatientAppointmentTool,
};