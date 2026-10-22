
const API_BASE_URL = `${
  import.meta.env.VITE_API_URL || "http://localhost:5001"
}/api`;

async function request(endpoint, options = {}) {
  const url = `${API_BASE_URL}${endpoint}`;

  const headers = {
    "Content-Type": "application/json",
    ...options.headers,
  };

  const response = await fetch(url, {
    ...options,

    // Important:
    // Allows the browser to send/receive the HTTP-only JWT cookie.
    credentials: "include",

    headers,
  });

  const data = await response.json();

  if (!response.ok || data.success === false) {
    const errorMsg = data.message || "An API error occurred";

    const err = new Error(errorMsg);

    if (data.alternatives) {
      err.alternatives = data.alternatives;
    }

    // Useful later for handling authentication errors
    err.status = response.status;

    throw err;
  }

  return data;
}

export const api = {
  // ==========================================
  // AUTHENTICATION
  // ==========================================

  signup: (payload) =>
    request("/auth/signup", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  login: (payload) =>
    request("/auth/login", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  getCurrentAdmin: () => request("/auth/me"),

  logout: () =>
    request("/auth/logout", {
      method: "POST",
    }),

  // ==========================================
  // DASHBOARD
  // ==========================================

  getDashboardStats: () => request("/dashboard"),

  // ==========================================
  // APPOINTMENTS
  // ==========================================

  getAppointments: () => request("/appointments"),

  getTimeSlots: () => request("/appointments/slots"),

  getAppointmentById: (id) =>
    request(`/appointments/${id}`),

  createAppointment: (payload) =>
    request("/appointments", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  checkAvailability: (payload) =>
    request("/appointments/check-availability", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  cancelAppointment: (id) =>
    request(`/appointments/${id}/cancel`, {
      method: "PATCH",
    }),

  rescheduleAppointment: (id, payload) =>
    request(`/appointments/${id}/reschedule`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),

  // ==========================================
  // DOCTORS
  // ==========================================

  getDoctors: () => request("/doctors"),

  getDoctorById: (id) =>
    request(`/doctors/${id}`),

  createDoctor: (payload) =>
    request("/doctors", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  // ==========================================
  // PATIENTS
  // ==========================================

  getPatients: () => request("/patients"),

  getPatientById: (id) =>
    request(`/patients/${id}`),

  createPatient: (payload) =>
    request("/patients", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  // ==========================================
  // AI ASSISTANT
  // ==========================================

  sendAIChat: (
    message,
    previousMessages = [],
    allowBooking = true
  ) =>
    request("/ai/chat", {
      method: "POST",
      body: JSON.stringify({
        message,
        previousMessages,
        allowBooking,
      }),
    }),
};