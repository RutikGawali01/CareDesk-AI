const prisma = require("../../db");

const {
  generateSlots,
  checkAvailability,
  createAppointment,
  cancelAppointment,
  rescheduleAppointment,
} = require("./appointmentService");

async function checkAvailabilityController(req, res) {
  try {
    const { doctorId, appointmentDate, startTime } = req.body;

    if (!doctorId || !appointmentDate || !startTime) {
      return res.status(400).json({
        success: false,
        message: "doctorId, appointmentDate and startTime are required",
      });
    }

    const doctor = await prisma.doctor.findFirst({
      where: {
        id: Number(doctorId),
        clinicId: req.clinicId,
      },
    });

    if (!doctor) {
      return res.status(404).json({
        success: false,
        message: "Doctor not found",
      });
    }

    const result = await checkAvailability(
      Number(doctorId),
      appointmentDate,
      startTime,
      req.clinicId
    );

    return res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error("Check availability error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to check availability",
    });
  }
}

async function createAppointmentController(req, res) {
  try {
    const {
      patientId,
      doctorId,
      appointmentDate,
      startTime,
    } = req.body;

    if (!patientId || !doctorId || !appointmentDate || !startTime) {
      return res.status(400).json({
        success: false,
        message:
          "patientId, doctorId, appointmentDate and startTime are required",
      });
    }

    const parsedPatientId = Number(patientId);
    const parsedDoctorId = Number(doctorId);

    if (
      !Number.isInteger(parsedPatientId) ||
      !Number.isInteger(parsedDoctorId)
    ) {
      return res.status(400).json({
        success: false,
        message: "Patient ID and Doctor ID must be valid numbers",
      });
    }

    // Verify that the patient belongs to the logged-in admin's clinic.
    const patient = await prisma.patient.findFirst({
      where: {
        id: parsedPatientId,
        clinicId: req.clinicId,
      },
    });

    if (!patient) {
      return res.status(404).json({
        success: false,
        message: "Patient not found",
      });
    }

    // Verify that the doctor belongs to the logged-in admin's clinic.
    const doctor = await prisma.doctor.findFirst({
      where: {
        id: parsedDoctorId,
        clinicId: req.clinicId,
      },
    });

    if (!doctor) {
      return res.status(404).json({
        success: false,
        message: "Doctor not found",
      });
    }

    // Never trust clinicId sent from the frontend.
    const appointmentData = {
      ...req.body,
      patientId: parsedPatientId,
      doctorId: parsedDoctorId,
      clinicId: req.clinicId,
    };

    const appointment = await createAppointment(appointmentData);

    return res.status(201).json({
      success: true,
      message: "Appointment booked successfully",
      appointment,
    });
  } catch (error) {
    console.error("Create appointment error:", error);

    if (
      error.message === "Patient not found" ||
      error.message === "Doctor not found"
    ) {
      return res.status(404).json({
        success: false,
        message: error.message,
      });
    }

    if (error.message === "Clinic is closed on Sundays") {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    if (
      error.message ===
        "patientId, doctorId, appointmentDate and startTime are required" ||
      error.message === "Patient ID and Doctor ID must be valid numbers" ||
      error.message === "Invalid appointment date" ||
      error.message === "Invalid appointment time"
    ) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    if (
      error.message === "This appointment slot is already booked" ||
      error.code === "P2002"
    ) {
      return res.status(409).json({
        success: false,
        message: error.message,
      });
    }

    return res.status(500).json({
      success: false,
      message: "Failed to create appointment",
    });
  }
}

async function cancelAppointmentController(req, res) {
  try {
    const appointmentId = Number(req.params.id);

    if (!Number.isInteger(appointmentId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid appointment ID",
      });
    }

    // Check both appointment ID and clinic ID.
    const existingAppointment = await prisma.appointment.findFirst({
      where: {
        id: appointmentId,
        clinicId: req.clinicId,
      },
    });

    if (!existingAppointment) {
      return res.status(404).json({
        success: false,
        message: "Appointment not found",
      });
    }

    const appointment = await cancelAppointment(appointmentId, req.clinicId);

    return res.json({
      success: true,
      message: "Appointment cancelled successfully",
      appointment,
    });
  } catch (error) {
    console.error("Cancel appointment error:", error);

    if (error.message === "Appointment not found") {
      return res.status(404).json({
        success: false,
        message: error.message,
      });
    }

    if (error.message === "Appointment is already cancelled") {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    return res.status(500).json({
      success: false,
      message: "Failed to cancel appointment",
    });
  }
}

async function rescheduleAppointmentController(req, res) {
  try {
    const appointmentId = Number(req.params.id);

    const { newDate, newTime } = req.body;

    if (!Number.isInteger(appointmentId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid appointment ID",
      });
    }

    if (!newDate || !newTime) {
      return res.status(400).json({
        success: false,
        message: "newDate and newTime are required",
      });
    }

    // Check both appointment ID and clinic ID.
    const existingAppointment = await prisma.appointment.findFirst({
      where: {
        id: appointmentId,
        clinicId: req.clinicId,
      },
    });

    if (!existingAppointment) {
      return res.status(404).json({
        success: false,
        message: "Appointment not found",
      });
    }

    const appointment = await rescheduleAppointment(
      appointmentId,
      newDate,
      newTime,
      req.clinicId
    );

    return res.json({
      success: true,
      message: "Appointment rescheduled successfully",
      appointment,
    });
  } catch (error) {
    console.error("Reschedule appointment error:", error);

    if (error.message === "Appointment not found") {
      return res.status(404).json({
        success: false,
        message: error.message,
      });
    }

    if (
      error.message === "Only booked appointments can be rescheduled"
    ) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    if (error.message === "New slot is not available") {
      return res.status(409).json({
        success: false,
        message: error.message,
        alternatives: error.alternatives,
      });
    }

    return res.status(500).json({
      success: false,
      message: "Failed to reschedule appointment",
    });
  }
}

async function getAppointmentsController(req, res) {
  try {
    const appointments = await prisma.appointment.findMany({
      where: {
        clinicId: req.clinicId,
      },
      include: {
        patient: true,
        doctor: true,
      },
      orderBy: [
        {
          appointmentDate: "asc",
        },
        {
          startTime: "asc",
        },
      ],
    });

    return res.json({
      success: true,
      appointments,
    });
  } catch (error) {
    console.error("Get appointments error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch appointments",
    });
  }
}

async function getAppointmentByIdController(req, res) {
  try {
    const appointmentId = Number(req.params.id);

    if (!Number.isInteger(appointmentId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid appointment ID",
      });
    }

    const appointment = await prisma.appointment.findFirst({
      where: {
        id: appointmentId,
        clinicId: req.clinicId,
      },
      include: {
        patient: true,
        doctor: true,
      },
    });

    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: "Appointment not found",
      });
    }

    return res.json({
      success: true,
      appointment,
    });
  } catch (error) {
    console.error("Get appointment by ID error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch appointment",
    });
  }
}

function getTimeSlotsController(req, res) {
  try {
    const slots = generateSlots();

    return res.json({
      success: true,
      slots,
    });
  } catch (error) {
    console.error("Get time slots error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch time slots",
    });
  }
}

module.exports = {
  checkAvailabilityController,
  createAppointmentController,
  cancelAppointmentController,
  rescheduleAppointmentController,
  getAppointmentsController,
  getAppointmentByIdController,
  getTimeSlotsController,
};