/**
 * Normalizes doctor names to prevent duplicate titles like "Dr. Dr. Rahul Sharma".
 * Ensures standard, professional "Dr. Name" representation across all screens.
 */
export function formatDoctorName(name) {
  if (!name || typeof name !== "string") return "";

  let cleaned = name.trim();

  // Recursively remove any repeated leading "Dr.", "Dr", or "Doctor" variations
  while (/^(dr\.|dr\b|doctor\b)/i.test(cleaned)) {
    cleaned = cleaned.replace(/^(dr\.|dr\b|doctor\b)\s*/i, "").trim();
  }

  return cleaned ? `Dr. ${cleaned}` : "";
}

/**
 * Format date consistently across the dashboard (e.g., "Oct 24, 2026").
 */
export function formatDate(dateString) {
  if (!dateString) return "N/A";
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return dateString;
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return dateString;
  }
}

/**
 * Format 24-hour time "14:00" or "09:30" to friendly "2:00 PM" or "9:30 AM".
 */
export function formatTime(timeString) {
  if (!timeString || typeof timeString !== "string") return timeString || "";
  const parts = timeString.split(":");
  if (parts.length < 2) return timeString;

  const hours = parseInt(parts[0], 10);
  const minutes = parts[1].padStart(2, "0");
  if (isNaN(hours)) return timeString;

  const period = hours >= 12 ? "PM" : "AM";
  const displayHours = hours % 12 || 12;

  return `${displayHours}:${minutes} ${period}`;
}

/**
 * Normalizes appointment status with accessible labels and UI badge styles.
 */
export function getStatusConfig(status) {
  const normalized = (status || "").toUpperCase();

  switch (normalized) {
    case "BOOKED":
      return {
        label: "Scheduled",
        bg: "bg-blue-50 text-blue-700 border-blue-200",
        dot: "bg-blue-500",
      };
    case "CONFIRMED":
      return {
        label: "Confirmed",
        bg: "bg-teal-50 text-teal-700 border-teal-200",
        dot: "bg-teal-500",
      };
    case "COMPLETED":
      return {
        label: "Completed",
        bg: "bg-emerald-50 text-emerald-700 border-emerald-200",
        dot: "bg-emerald-500",
      };
    case "NO_SHOW":
      return {
        label: "No-Show",
        bg: "bg-amber-50 text-amber-700 border-amber-200",
        dot: "bg-amber-500",
      };
    case "CANCELLED":
      return {
        label: "Cancelled",
        bg: "bg-rose-50 text-rose-700 border-rose-200",
        dot: "bg-rose-500",
      };
    default:
      return {
        label: status || "Unknown",
        bg: "bg-slate-50 text-slate-700 border-slate-200",
        dot: "bg-slate-400",
      };
  }
}

/**
 * Determines whether an appointment has passed its scheduled date/time
 * but remains in an unresolved state (BOOKED or CONFIRMED).
 */
export function isAppointmentAttendancePending(appointment) {
  if (!appointment) return false;
  if (appointment.status !== "BOOKED" && appointment.status !== "CONFIRMED") {
    return false;
  }

  try {
    const apptDate = new Date(appointment.appointmentDate);
    const now = new Date();
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);

    const checkDate = new Date(apptDate);
    checkDate.setHours(0, 0, 0, 0);

    // If scheduled for a past day, it's pending review
    if (checkDate < today) return true;

    // If scheduled for today, check if the start time has passed
    if (checkDate.getTime() === today.getTime() && appointment.startTime) {
      const [hours, minutes] = appointment.startTime.split(":").map(Number);
      const apptDateTime = new Date(now);
      apptDateTime.setHours(hours || 0, minutes || 0, 0, 0);
      return now > apptDateTime;
    }

    return false;
  } catch {
    return false;
  }
}
