const express = require("express");

const {
  checkAvailabilityController,
  createAppointmentController,
  cancelAppointmentController,
  rescheduleAppointmentController,
  updateAppointmentStatusController,
  getAppointmentsController,
  getAppointmentByIdController,
  getTimeSlotsController,
} = require("./appointmentController");
const { requireAuth } = require("../../middleware/authMiddleware");

const router = express.Router();

// Get appointments & slots
router.get("/", requireAuth, getAppointmentsController);
router.get("/slots", requireAuth, getTimeSlotsController);
router.get("/:id", requireAuth, getAppointmentByIdController);

// Create appointment
router.post("/", requireAuth, createAppointmentController);

// Check availability
router.post("/check-availability", requireAuth, checkAvailabilityController);

// Update status (e.g. COMPLETED, NO_SHOW, CONFIRMED)
router.patch("/:id/status", requireAuth, updateAppointmentStatusController);

// Cancel appointment
router.patch("/:id/cancel", requireAuth, cancelAppointmentController);

// Reschedule appointment
router.patch("/:id/reschedule", requireAuth, rescheduleAppointmentController);

module.exports = router;
