const prisma = require("../../db");

async function getDashboard(req, res) {
  try {
    const clinicId = req.clinicId;

    // Get today's date in hospital timezone (Asia/Kolkata)
    const now = new Date();
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(now);
    const dateMap = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
    const todayStr = `${dateMap.year}-${dateMap.month}-${dateMap.day}`;

    const today = new Date(`${todayStr}T00:00:00.000Z`);
    const tomorrow = new Date(today);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);

    const currentHours = `${dateMap.hour}:${dateMap.minute}`;

    const [
      totalPatients,
      totalDoctors,
      totalAppointments,
      bookedAppointments,
      confirmedAppointments,
      completedAppointments,
      noShowAppointments,
      cancelledAppointments,
      todayCount,
      upcomingCount,
      allAppointmentsForAttendance,
      todaysAppointments,
    ] = await Promise.all([
      // Total patients for this clinic
      prisma.patient.count({
        where: {
          clinicId,
        },
      }),

      // Total doctors for this clinic
      prisma.doctor.count({
        where: {
          clinicId,
        },
      }),

      // Total appointments for this clinic
      prisma.appointment.count({
        where: {
          clinicId,
        },
      }),

      // Booked appointments for this clinic
      prisma.appointment.count({
        where: {
          clinicId,
          status: "BOOKED",
        },
      }),

      // Confirmed appointments for this clinic
      prisma.appointment.count({
        where: {
          clinicId,
          status: "CONFIRMED",
        },
      }),

      // Completed appointments for this clinic
      prisma.appointment.count({
        where: {
          clinicId,
          status: "COMPLETED",
        },
      }),

      // No-show appointments for this clinic
      prisma.appointment.count({
        where: {
          clinicId,
          status: "NO_SHOW",
        },
      }),

      // Cancelled appointments for this clinic
      prisma.appointment.count({
        where: {
          clinicId,
          status: "CANCELLED",
        },
      }),

      // Today's appointments count
      prisma.appointment.count({
        where: {
          clinicId,
          appointmentDate: {
            gte: today,
            lt: tomorrow,
          },
        },
      }),

      // Upcoming count (scheduled from today onwards, BOOKED or CONFIRMED)
      prisma.appointment.count({
        where: {
          clinicId,
          appointmentDate: {
            gte: today,
          },
          status: {
            in: ["BOOKED", "CONFIRMED"],
          },
        },
      }),

      // Active appointments up to tomorrow to calculate attendance pending
      prisma.appointment.findMany({
        where: {
          clinicId,
          appointmentDate: {
            lt: tomorrow,
          },
          status: {
            in: ["BOOKED", "CONFIRMED"],
          },
        },
        select: {
          id: true,
          appointmentDate: true,
          startTime: true,
        },
      }),

      // Today's appointments (all statuses, ordered by startTime)
      prisma.appointment.findMany({
        where: {
          clinicId,
          appointmentDate: {
            gte: today,
            lt: tomorrow,
          },
        },
        include: {
          patient: true,
          doctor: true,
        },
        orderBy: {
          startTime: "asc",
        },
      }),
    ]);

    // Calculate attendancePendingCount:
    // Past appointments (< today) that are still BOOKED or CONFIRMED,
    // plus today's appointments whose scheduled startTime has passed.
    const attendancePendingCount = allAppointmentsForAttendance.filter((appt) => {
      const apptDate = new Date(appt.appointmentDate);
      if (apptDate < today) return true;
      return appt.startTime <= currentHours;
    }).length;

    // Attach isAttendancePending flag to today's appointments for clear UI badging
    const enrichedTodaysAppointments = todaysAppointments.map((appt) => {
      const isPending =
        (appt.status === "BOOKED" || appt.status === "CONFIRMED") &&
        (new Date(appt.appointmentDate) < today || appt.startTime <= currentHours);
      return {
        ...appt,
        isAttendancePending: isPending,
      };
    });

    return res.json({
      success: true,
      stats: {
        totalPatients,
        totalDoctors,
        totalAppointments,
        bookedAppointments,
        confirmedAppointments,
        completedAppointments,
        noShowAppointments,
        cancelledAppointments,
        todayCount,
        upcomingCount,
        attendancePendingCount,
        todayDate: todayStr,
      },
      todaysAppointments: enrichedTodaysAppointments,
    });
  } catch (error) {
    console.error("Dashboard error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch dashboard data",
    });
  }
}

module.exports = {
  getDashboard,
};