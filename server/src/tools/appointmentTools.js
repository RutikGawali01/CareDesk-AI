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
  appointmentId,
}) {
  return await cancelAppointment(
    appointmentId,
    clinicId
  );
}

async function rescheduleAppointmentTool({
  clinicId,
  appointmentId,
  newDate,
  newTime,
}) {
  return await rescheduleAppointment(
    appointmentId,
    newDate,
    newTime,
    clinicId
  );
}

async function findPatientAppointmentTool({
  clinicId,
  patientId,
  doctorId,
  appointmentDate,
  startTime,
}) {
  return await findPatientAppointment({
    clinicId,
    patientId,
    doctorId,
    appointmentDate,
    startTime,
  });
}

module.exports = {
  checkAvailabilityTool,
  bookAppointmentTool,
  cancelAppointmentTool,
  rescheduleAppointmentTool,
  findPatientAppointmentTool,
};