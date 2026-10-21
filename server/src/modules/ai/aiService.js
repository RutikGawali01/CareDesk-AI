require("dotenv").config();

const OpenAI = require("openai");

const {
  checkAvailabilityTool,
  bookAppointmentTool,
  cancelAppointmentTool,
  rescheduleAppointmentTool,
  findPatientAppointmentTool,
} = require("../../tools/appointmentTools");

const {
  findPatientTool,
  createPatientTool,
} = require("../../tools/patientTools");

const {
  findDoctorTool,
  listDoctorsTool,
} = require("../../tools/doctorTools");

const {
  isExplicitConfirmation,
  getActorKey,
  createPendingConfirmation,
  getPendingConfirmation,
  consumePendingConfirmation,
  executeConfirmedAppointmentMutation,
} = require("../appointments/appointmentConfirmation");

function getPrisma() {
  return require("../../db");
}

// ============================================================
// DATE HELPERS
// ============================================================

function getIndiaDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  return Object.fromEntries(parts.map(({ type, value }) => [type, value]));
}

function getTodayDate() {
  const { year, month, day } = getIndiaDateParts();
  return `${year}-${month}-${day}`;
}

function getTomorrowDate() {
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const { year, month, day } = getIndiaDateParts(tomorrow);
  return `${year}-${month}-${day}`;
}

// ============================================================
// OPENROUTER CLIENT
// ============================================================

const openRouterClient = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY || "missing-openrouter-key",
});

const groqClient = process.env.GROQ_API_KEY
  ? new OpenAI({
      baseURL: "https://api.groq.com/openai/v1",
      apiKey: process.env.GROQ_API_KEY,
    })
  : null;

const PRIMARY_MODEL = process.env.OPENROUTER_MODEL || "openrouter/free";
const FALLBACK_MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-20b";

function isProviderCapacityError(error) {
  const status = error?.status || error?.statusCode;
  const message = String(error?.message || "").toLowerCase();
  return (
    [401, 402, 403, 408, 429, 500, 502, 503, 504].includes(status) ||
    /quota|rate.?limit|too many requests|insufficient credits|temporarily unavailable|provider.*(busy|unavailable)/i.test(message)
  );
}

async function createChatCompletion(messages, tools) {
  if (!process.env.OPENROUTER_API_KEY) {
    if (!groqClient) {
      throw new Error("Configure OPENROUTER_API_KEY or GROQ_API_KEY in the server environment.");
    }
    console.warn("[AI] OPENROUTER_API_KEY missing; using Groq fallback.");
    return groqClient.chat.completions.create({
      model: FALLBACK_MODEL,
      messages,
      tools,
      tool_choice: "auto",
    });
  }

  try {
    return await openRouterClient.chat.completions.create({
      model: PRIMARY_MODEL,
      messages,
      tools,
      tool_choice: "auto",
    });
  } catch (primaryError) {
    if (!groqClient || !isProviderCapacityError(primaryError)) {
      throw primaryError;
    }

    console.warn(
      `[AI] OpenRouter request failed (status ${primaryError.status || "unknown"}); retrying with Groq model ${FALLBACK_MODEL}.`
    );

    try {
      return await groqClient.chat.completions.create({
        model: FALLBACK_MODEL,
        messages,
        tools,
        tool_choice: "auto",
      });
    } catch (fallbackError) {
      console.error(
        `[AI] Both providers failed. OpenRouter status: ${primaryError.status || "unknown"}; Groq status: ${fallbackError.status || "unknown"}.`
      );
      throw new Error("AI providers are temporarily unavailable. Please try again shortly.");
    }
  }
}

// ============================================================
// TOOL DEFINITIONS
// ============================================================

// ============================================================
// CHECK AVAILABILITY
// ============================================================

const checkAvailabilityFunction = {
  type: "function",

  function: {
    name: "check_availability",

    description:
      "Check whether a specific doctor has an appointment slot available. Use this ONLY when the patient explicitly asks whether a slot is free without wanting to book or reschedule yet. Do NOT use this for new bookings or rescheduling — call book_appointment or reschedule_appointment directly instead. Calling this tool does NOT stage any booking or rescheduling action and you MUST NOT ask the patient to confirm an appointment change after calling this tool alone.",

    parameters: {
      type: "object",

      properties: {
        doctorId: {
          type: "integer",
          description:
            "Internal doctor ID obtained from find_doctor. Never invent this ID.",
        },

        appointmentDate: {
          type: "string",
          description:
            "Appointment date in YYYY-MM-DD format.",
        },

        startTime: {
          type: "string",
          description:
            "Appointment start time in HH:MM 24-hour format. Example: 10:00, 12:30, 16:00, 20:30.",
        },
      },

      required: [
        "doctorId",
        "appointmentDate",
        "startTime",
      ],
    },
  },
};

// ============================================================
// FIND PATIENT
// ============================================================

const findPatientFunction = {
  type: "function",

  function: {
    name: "find_patient",

    description:
      "Find an existing patient in the current hospital using the patient's name or phone number. Never invent a patient ID.",

    parameters: {
      type: "object",

      properties: {
        name: {
          type: "string",
          description:
            "Patient's name if known.",
        },

        phone: {
          type: "string",
          description:
            "Patient's phone number if known.",
        },
      },

      required: [],
    },
  },
};

// ============================================================
// FIND DOCTOR
// ============================================================

const findDoctorFunction = {
  type: "function",

  function: {
    name: "find_doctor",

    description:
      "Find doctors in the current hospital by doctor name or medical specialization. Use this when the patient names a doctor or asks for a specialist such as cardiologist, dentist, dermatologist, orthopedic doctor, neurologist, etc. Never guess or invent doctor IDs.",

    parameters: {
      type: "object",

      properties: {
        name: {
          type: "string",
          description:
            "Doctor name OR medical specialization provided by the patient. Examples: 'Amit Sharma', 'Dr Sharma', 'cardiologist', 'dentist', 'orthopedic'.",
        },
      },

      required: ["name"],
    },
  },
};

// ============================================================
// LIST DOCTORS
// ============================================================

const listDoctorsFunction = {
  type: "function",

  function: {
    name: "list_doctors",

    description:
      "List all doctors currently available at the hospital. Use this when the patient asks for a full list of doctors, wants to know which doctors are at the hospital, or asks 'who are your doctors'. This does not require any search input.",

    parameters: {
      type: "object",

      properties: {},

      required: [],
    },
  },
};

// ============================================================
// CREATE PATIENT
// ============================================================

const createPatientFunction = {
  type: "function",

  function: {
    name: "create_patient",

    description:
      "Register a new patient in the current hospital after required patient information has been collected.",

    parameters: {
      type: "object",

      properties: {
        name: {
          type: "string",
          description:
            "Patient's full name.",
        },

        phone: {
          type: "string",
          description:
            "Patient's phone number.",
        },

        email: {
          type: "string",
          description:
            "Patient's email address if provided.",
        },
      },

      required: [
        "name",
        "phone",
      ],
    },
  },
};

// ============================================================
// BOOK APPOINTMENT
// ============================================================

const bookAppointmentFunction = {
  type: "function",

  function: {
    name: "book_appointment",

    description:
      "Stage a booking confirmation for an appointment. Call this when you know the doctor, patient, preferred date, and preferred time. The server will check availability and stage a pending confirmation record. The tool returns the exact details to show the patient before they confirm. Do NOT call check_availability before this — book_appointment handles availability internally. Do NOT ask the patient to confirm before calling this tool.",

    parameters: {
      type: "object",

      properties: {
        patientId: {
          type: "integer",
          description:
            "Internal patient ID obtained from find_patient or create_patient. Never ask the patient for this ID.",
        },

        doctorId: {
          type: "integer",
          description:
            "Internal doctor ID obtained from find_doctor. Never invent this ID.",
        },

        appointmentDate: {
          type: "string",
          description:
            "Appointment date in YYYY-MM-DD format.",
        },

        startTime: {
          type: "string",
          description:
            "Appointment start time in HH:MM 24-hour format.",
        },

        reason: {
          type: "string",
          description:
            "Optional reason for the appointment.",
        },
      },

      required: [
        "patientId",
        "doctorId",
        "appointmentDate",
        "startTime",
      ],
    },
  },
};

// ============================================================
// FIND PATIENT APPOINTMENT
// ============================================================

const findPatientAppointmentFunction = {
  type: "function",

  function: {
    name: "find_patient_appointment",

    description:
      "Find an existing booked appointment belonging to the current patient in the current hospital. Use this before cancellation or rescheduling.",

    parameters: {
      type: "object",

      properties: {
        patientId: {
          type: "integer",
          description:
            "Internal patient ID obtained from find_patient. Never ask the patient for this ID.",
        },

        doctorId: {
          type: "integer",
          description:
            "Optional doctor ID if known.",
        },

        appointmentDate: {
          type: "string",
          description:
            "Optional appointment date in YYYY-MM-DD format.",
        },

        startTime: {
          type: "string",
          description:
            "Optional appointment start time in HH:MM format.",
        },

        appointmentId: {
          type: "integer",
          description:
            "Optional exact appointment ID when verifying a specific appointment.",
        },
      },

      required: ["patientId"],
    },
  },
};

// ============================================================
// CANCEL APPOINTMENT
// ============================================================

const cancelAppointmentFunction = {
  type: "function",

  function: {
    name: "cancel_appointment",

    description:
      "Stage a cancellation confirmation for an existing appointment. Call this when you know the appointmentId from find_patient_appointment. The server will validate appointment ownership and stage a pending cancellation record. Do NOT ask the patient to confirm before calling this tool.",

    parameters: {
      type: "object",

      properties: {
        appointmentId: {
          type: "integer",
          description:
            "Internal appointment ID obtained from find_patient_appointment. Never invent this ID.",
        },

        patientId: {
          type: "integer",
          description:
            "Optional internal patient ID obtained from find_patient.",
        },
      },

      required: ["appointmentId"],
    },
  },
};

// ============================================================
// RESCHEDULE APPOINTMENT
// ============================================================

const rescheduleAppointmentFunction = {
  type: "function",

  function: {
    name: "reschedule_appointment",

    description:
      "Stage a reschedule confirmation for an existing appointment. Call this when you know the appointmentId, newDate, and newTime. The server will check availability for the new slot, validate appointment ownership, and stage a pending confirmation record. The tool returns the exact details to show the patient before they confirm. Do NOT call check_availability before this — reschedule_appointment handles availability internally. Do NOT ask the patient to confirm before calling this tool.",

    parameters: {
      type: "object",

      properties: {
        appointmentId: {
          type: "integer",
          description:
            "Internal appointment ID obtained from find_patient_appointment.",
        },

        newDate: {
          type: "string",
          description:
            "New appointment date in YYYY-MM-DD format.",
        },

        newTime: {
          type: "string",
          description:
            "New appointment start time in HH:MM 24-hour format.",
        },

        patientId: {
          type: "integer",
          description:
            "Optional internal patient ID obtained from find_patient.",
        },
      },

      required: [
        "appointmentId",
        "newDate",
        "newTime",
      ],
    },
  },
};

// ============================================================
// ALL TOOLS
// ============================================================

const tools = [
  checkAvailabilityFunction,

  findPatientFunction,

  findDoctorFunction,

  listDoctorsFunction,

  createPatientFunction,

  bookAppointmentFunction,

  findPatientAppointmentFunction,

  cancelAppointmentFunction,

  rescheduleAppointmentFunction,
];

// ============================================================
// AI SERVICE
// ============================================================

async function getVerifiedPatientForPhone(phone, clinicId, db) {
  if (db?.patient?.findFirst) {
    try {
      const p = await db.patient.findFirst({
        where: {
          phone: String(phone),
          clinicId: Number(clinicId),
        },
      });
      if (p) {
        return { found: true, patient: p };
      }
    } catch {}
  }
  try {
    return await findPatientTool({ phone, clinicId });
  } catch {
    return null;
  }
}

async function askAI(
  message,
  previousMessages = [],
  allowBooking = false,
  clinicId,
  {
    callerPhone,
    adminId,
    preserveToolHistory = false,
    allowAppointmentChanges = allowBooking,
    db = getPrisma(),
    chatCompletionFn = createChatCompletion,
    confirmationServices = {},
  } = {}
) {
  const checkAvailability = confirmationServices.checkAvailability
    ? async ({ doctorId, appointmentDate, startTime, clinicId, excludeAppointmentId }) => {
        return await confirmationServices.checkAvailability(
          Number(doctorId),
          appointmentDate,
          startTime,
          Number(clinicId),
          excludeAppointmentId ? Number(excludeAppointmentId) : null
        );
      }
    : checkAvailabilityTool;
  // ==========================================================
  // BASIC VALIDATION
  // ==========================================================

  if (!clinicId) {
    throw new Error(
      "Hospital context is missing. Please authenticate again."
    );
  }

  if (!message || typeof message !== "string") {
    throw new Error("A valid message is required.");
  }

  // ==========================================================
  // RESOLVE ACTOR KEY FOR CONFIRMATIONS
  // ==========================================================

  let actorKey = null;
  try {
    actorKey = getActorKey({ clinicId, callerPhone, adminId });
  } catch {
    // If context lacks trusted identity, actorKey remains null.
  }

  // ==========================================================
  // SERVER-SIDE CONFIRMATION EXECUTION
  // ==========================================================
  // A standalone explicit confirmation is handled strictly server-side.
  // It MUST NOT continue into the LLM/tool loop under any circumstances.
  if (isExplicitConfirmation(message)) {
    if (!actorKey) {
      const reply =
        "A trusted confirmation identity is required to confirm appointments. Please authenticate or contact the hospital.";
      return {
        response: reply,
        messages: [
          ...previousMessages,
          { role: "user", content: message },
          { role: "assistant", content: reply },
        ],
      };
    }

    const pending = await getPendingConfirmation(actorKey, db);
    if (pending) {
      const claimed = await consumePendingConfirmation(pending.id, actorKey, db);
      if (!claimed) {
        const reply =
          "This confirmation request has already been processed or expired. Please let me know what you would like to do.";
        return {
          response: reply,
          messages: [
            ...previousMessages,
            { role: "user", content: message },
            { role: "assistant", content: reply },
          ],
        };
      }

      let patientId = pending.patientId;
      if (callerPhone) {
        try {
          const verifiedPatient = await getVerifiedPatientForPhone(callerPhone, clinicId, db);
          if (verifiedPatient?.found && verifiedPatient?.patient?.id) {
            patientId = verifiedPatient.patient.id;
          }
        } catch {
          // If patient lookup tool throws (e.g. offline mock db), keep pending.patientId
        }
      }

      const execution = await executeConfirmedAppointmentMutation({
        pending,
        clinicId,
        patientId,
        allowBooking,
        allowAppointmentChanges,
        services: confirmationServices,
      });

      return {
        response: execution.message,
        messages: [
          ...previousMessages,
          { role: "user", content: message },
          { role: "assistant", content: execution.message },
        ],
      };
    } else {
      // Check if there was an expired or consumed record to give immediate clear feedback
      try {
        const recent = await db.appointmentConfirmation.findUnique({
          where: { actorKey },
        });
        if (recent && recent.status === "CONSUMED") {
          const reply = "This appointment confirmation has already been processed.";
          return {
            response: reply,
            messages: [
              ...previousMessages,
              { role: "user", content: message },
              { role: "assistant", content: reply },
            ],
          };
        }
        if (recent && recent.status === "EXPIRED") {
          const reply =
            "Your confirmation window has expired. Confirmations are valid for 5 minutes. Please let me know which appointment you would like to book.";
          return {
            response: reply,
            messages: [
              ...previousMessages,
              { role: "user", content: message },
              { role: "assistant", content: reply },
            ],
          };
        }
      } catch (err) {
        console.error("[AI] Error querying recent confirmation status:", err?.message);
      }

      // Standalone confirmation with no active, consumed, or expired pending record.
      // Return a clean response and NEVER fall through into the LLM/tool loop.
      const reply =
        "There is no pending appointment awaiting confirmation. How can I help you today?";
      return {
        response: reply,
        messages: [
          ...previousMessages,
          { role: "user", content: message },
          { role: "assistant", content: reply },
        ],
      };
    }
  }

  // ==========================================================
  // NORMALIZE HISTORY
  // ==========================================================

  if (!Array.isArray(previousMessages)) {
    previousMessages = [];
  }

  /*
   * Do not allow the frontend to inject arbitrary system
   * messages into the conversation.
   *
   * Only keep normal conversation messages.
   */

  previousMessages = previousMessages.filter((msg) => {
    if (!msg || typeof msg !== "object") {
      return false;
    }

    // WhatsApp history is kept by the server and may include assistant
    // tool-call messages plus matching tool results. Preserve these only
    // for that trusted server-side conversation, never for dashboard input.
    if (preserveToolHistory) {
      if (msg.role === "user") {
        return typeof msg.content === "string" && msg.content.trim().length > 0;
      }

      if (msg.role === "assistant") {
        const hasText =
          typeof msg.content === "string" && msg.content.trim().length > 0;
        const hasToolCalls =
          Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0;
        return hasText || hasToolCalls;
      }

      if (msg.role === "tool") {
        return (
          typeof msg.tool_call_id === "string" &&
          typeof msg.content === "string"
        );
      }

      return false;
    }

    // Dashboard history is client-provided, so accept only plain text
    // user/assistant messages and never trust client-supplied tool results.
    if (!["user", "assistant"].includes(msg.role)) {
      return false;
    }

    return (
      typeof msg.content === "string" &&
      msg.content.trim().length > 0
    );
  });

  // ==========================================================
  // DATES
  // ==========================================================

  const today = getTodayDate();
  const tomorrow = getTomorrowDate();

  // ==========================================================
  // SYSTEM PROMPT
  // ==========================================================

  // ==========================================================
  // CALLER PHONE CONTEXT
  // ==========================================================

  /*
   * When callerPhone is available (WhatsApp / voice), inject it
   * into the system prompt so the AI can look up the patient
   * automatically without asking for a phone number.
   */

  const callerPhoneBlock = callerPhone
    ? `
============================================================
VERIFIED CALLER PHONE
============================================================

The caller's verified phone number is: ${callerPhone}

This phone number comes from the platform (WhatsApp or voice). It is trusted.

Use this phone number when calling find_patient or create_patient.

Never ask the patient for their phone number — you already have it.

Never invent or change this phone number.
`
    : "";

  const systemMessage = {
    role: "system",

    content: `
You are Riya, the AI receptionist for a hospital.

You help patients book, cancel, reschedule, and check appointments. You also help them find doctors.

============================================================
CONVERSATION STYLE
============================================================

Keep replies to 1–3 short sentences.
Ask only one question per message.
Use simple, friendly language.
Do not repeat information the patient already gave.
Do not list hospital rules or schedules unless the patient asks.
Do not start every reply with a greeting.

============================================================
BACKEND AUTHORITY
============================================================

The backend is authoritative. Never claim a booking, cancellation, or reschedule succeeded unless the tool confirms it. Never invent patients, doctors, IDs, times, or availability.

Internal IDs are for tool use only. Never ask the patient for any ID.
${callerPhoneBlock}
============================================================
PATIENT IDENTIFICATION
============================================================

Do NOT ask the patient whether they are new or existing.

If you have the caller's verified phone number:
- Call find_patient with that phone number first.
- If a patient record is found, greet them by name and continue.
- If no patient is found, ask for their name. When they reply, call create_patient with their name and the verified phone number. Email is optional — do not ask unless needed.

If you do NOT have a verified phone number (dashboard chat):
- Ask: "May I know your name?"
- Then call find_patient with the name.
- If not found, ask for their phone number, then call create_patient.

Never create duplicate patient records. Never search across other clinics.

============================================================
CURRENT DATE
============================================================

Today: ${today}
Tomorrow: ${tomorrow}

Resolve natural expressions (today, tomorrow, next Monday, etc.) into YYYY-MM-DD internally. Never ask the patient to give a date in YYYY-MM-DD.

============================================================
BOOKING WINDOW
============================================================

Appointments can be booked up to 7 days ahead. Never allow past dates.

============================================================
HOSPITAL SCHEDULE
============================================================

Open: Monday – Saturday. Sunday is closed.

Morning session: 10:00 AM – 2:00 PM
Evening session: 4:00 PM – 8:00 PM

Appointments are 30 minutes long.

Valid morning start times: 10:00, 10:30, 11:00, 11:30, 12:00, 12:30, 13:00, 13:30
The 13:30 appointment ends at 14:00.

Valid evening start times: 16:00, 16:30, 17:00, 17:30, 18:00, 18:30, 19:00, 19:30
The 19:30 appointment ends at 20:00.

Invalid times: Sunday, 14:00–16:00 gap, anything after 19:30.
The backend remains authoritative.

============================================================
DOCTOR SEARCH
============================================================

When the patient names a doctor or specialization, call find_doctor.
If the patient asks for the full doctor list, call list_doctors.

Never guess or invent a doctor ID.

If find_doctor returns one doctor, use that doctor internally.
If multiple doctors match, list them briefly and ask the patient to choose.
If none match, say so.

============================================================
BOOKING FLOW
============================================================

1. Identify the patient (call find_patient using their verified phone number if available, or ask for name).
2. Ask which doctor or specialization they want (only if not already stated).
3. Ask for the preferred date (only if not given). Convert natural dates internally to YYYY-MM-DD.
4. Ask for the preferred time (only if not given). Convert to HH:MM 24-hour format.
5. Once you have patient ID, doctor ID, date, and time — call book_appointment. The server will check availability and stage a pending confirmation record.
6. Read the tool result:
   a. If success: true and status: PENDING_CONFIRMATION — present the exact doctor name, date, and time from the tool result to the patient and ask: "Would you like me to confirm this booking?"
   b. If success: false — share the tool-provided error message (e.g. slot unavailable) and alternatives. Do not fabricate alternatives.
7. Wait for the patient to say "yes" (or equivalent). The server handles execution automatically.
8. Do NOT call check_availability before book_appointment for new bookings — book_appointment handles availability internally.

NEVER ask the patient for confirmation before calling book_appointment. Call book_appointment first; it stages the action safely.

Ask only for missing information. Do not repeat steps the patient already completed.

============================================================
AVAILABILITY
============================================================

Do NOT call check_availability for new bookings or rescheduling — use book_appointment or reschedule_appointment instead. Both tools check availability internally.

Only call check_availability when the patient explicitly asks whether a slot or doctor is free without wanting to book or reschedule yet.
Convert times to 24-hour HH:MM format internally (e.g. 5 PM → 17:00).

If a slot is unavailable, share only the backend-provided alternatives. Never invent alternatives.

============================================================
DOCTOR SPECIALIZATION TRANSPARENCY
============================================================

When reporting a doctor to the patient, always use the doctor's actual specialization field from the database, not the patient's query term.

For example: if the patient asks for a "cardiologist" and the database returns Dr. Sharma with specialization "Heart", say: "Dr. Sharma (specialization: Heart) is available..."

Do NOT call Dr. Sharma a "cardiologist" unless the stored specialization field says "cardiologist".

============================================================
EXPLICIT CONFIRMATION & STAGING
============================================================

All appointment mutations (booking, cancellation, and rescheduling) follow server-side staging:
1. For booking: call book_appointment. It checks availability and stages the pending booking.
2. For cancellation: call cancel_appointment. It validates ownership and stages the pending cancellation.
3. For rescheduling: call reschedule_appointment. It validates ownership, checks availability of the new slot, and stages the pending reschedule.

Read the tool result:
- If success: true and status: PENDING_CONFIRMATION — present the exact details from the tool result to the patient and ask for confirmation.
- If success: false — explain the error to the patient. NEVER ask for confirmation if staging failed.

NEVER ask the patient for confirmation before calling book_appointment, cancel_appointment, or reschedule_appointment. Call the tool first; it stages the action safely.

Examples of confirmation: "yes", "confirm", "proceed", "go ahead".
Wait for the patient's explicit reply before the server executes the mutation automatically.

============================================================
CANCELLATION & RESCHEDULING FLOW
============================================================

Cancellation: identify patient → find appointment using find_patient_appointment → call cancel_appointment to stage → ask patient to confirm → wait for patient reply.
Rescheduling: identify patient → find appointment using find_patient_appointment → get preferred new date/time → call reschedule_appointment to stage → ask patient to confirm → wait for patient reply.

Do NOT call check_availability before reschedule_appointment — reschedule_appointment handles availability internally.
If multiple appointments exist, ask which one. Never guess.

============================================================
BOOKING PERMISSION
============================================================

Booking permission: ${allowBooking ? "ENABLED" : "DISABLED"}.
Cancellation/rescheduling permission: ${allowAppointmentChanges ? "ENABLED" : "DISABLED"}.
Never call book_appointment unless booking is enabled. Never call cancel_appointment or reschedule_appointment unless cancellation/rescheduling is enabled. If a requested action is disabled, explain that clearly and do not suggest a workaround that could create an unintended booking.

============================================================
TOOL FAILURE
============================================================

If a tool returns success: false, do not pretend it succeeded. Say there's a temporary issue. Never expose stack traces, database errors, internal IDs, or tool names.

============================================================
DATE SAFETY
============================================================

Never silently change the patient's requested date. If a date is invalid (e.g. Sunday), explain why and suggest the next valid day. Wait for the patient's agreement before proceeding.

Use the actual calendar. Never guess weekdays or invent dates.

============================================================
GENERAL RULES
============================================================

Be polite, concise, and natural.
Do not call the hospital a "clinic" unless that's its actual name.
Reason for appointment is optional — never force it.
Email is optional.
`,
  };

  // ==========================================================
  // CONVERSATION
  // ==========================================================

  let messages = [
    systemMessage,

    ...previousMessages,

    {
      role: "user",
      content: message,
    },
  ];

  // ==========================================================
  // TOOL LOOP
  // ==========================================================

  let stagedConfirmationInTurn = false;
  let stagedRescheduleInTurn = false;
  let stagedBookingInTurn = false;
  let stagedCancelInTurn = false;
  let lastMutationError = null;

  while (true) {
    const response = await chatCompletionFn(messages, tools);

    const assistantMessage = response.choices[0].message;

    console.log("\nAI MESSAGE:");
    console.log(assistantMessage.content);

    // ========================================================
    // NO TOOL CALL
    // ========================================================

    if (!assistantMessage.tool_calls?.length) {
      let finalReply =
        assistantMessage.content ||
        "I'm sorry, I couldn't generate a response.";

      // Guardrail: Ensure a reschedule confirmation question can only be sent
      // after a fresh RESCHEDULE action has been staged successfully.
      const asksRescheduleConfirmation =
        /(?:reschedule|confirm this change|confirm the change).*(?:confirm|would you like|do you want|shall I|should I)/i.test(finalReply) ||
        /(?:would you like|do you want|shall I|should I|can I).*(?:reschedule|confirm this change|confirm the change)/i.test(finalReply);

      if (asksRescheduleConfirmation && !stagedRescheduleInTurn) {
        if (lastMutationError) {
          finalReply = `I cannot reschedule your appointment: ${lastMutationError}`;
        } else {
          finalReply = "I was unable to stage your appointment reschedule. Please provide your appointment details and preferred new date and time.";
        }
      }

      // Guardrail: Ensure a booking confirmation question can only be sent
      // after a fresh BOOK action has been staged successfully.
      const asksBookingConfirmation =
        /(?:would you like|do you want|shall I|should I|can I).*(?:book|confirm this booking)/i.test(finalReply) ||
        /(?:book|booking).*(?:would you like|do you want|shall I|should I|confirm)/i.test(finalReply);

      if (asksBookingConfirmation && !stagedBookingInTurn && !stagedConfirmationInTurn) {
        if (lastMutationError) {
          finalReply = `I cannot book your appointment: ${lastMutationError}`;
        }
      }

      return {
        response: finalReply,
        messages: [
          ...messages,
          { role: "assistant", content: finalReply },
        ],
      };
    }

    // ========================================================
    // SAVE ASSISTANT TOOL REQUEST
    // ========================================================

    messages.push(assistantMessage);

    // ========================================================
    // EXECUTE EACH TOOL
    // ========================================================

    for (const toolCall of assistantMessage.tool_calls) {
      const toolName = toolCall.function.name;

      let args;

      // ------------------------------------------------------
      // PARSE TOOL ARGUMENTS
      // ------------------------------------------------------

      try {
        args = JSON.parse(
          toolCall.function.arguments || "{}"
        );
      } catch (error) {
        console.error(
          "Invalid tool arguments:",
          toolCall.function.arguments
        );

        messages.push({
          role: "tool",

          tool_call_id: toolCall.id,

          content: JSON.stringify({
            success: false,
            error: "Invalid tool arguments.",
          }),
        });

        continue;
      }

      console.log(
        "\nAI WANTS TO CALL:",
        toolName
      );

      console.log(
        "Arguments:",
        args
      );

      let result;

      // ======================================================
      // TOOL EXECUTION
      // ======================================================

      try {
        // ====================================================
        // CHECK AVAILABILITY
        // ====================================================

        if (toolName === "check_availability") {
          const availResult = await checkAvailability({
            ...args,

            /*
             * IMPORTANT:
             *
             * clinicId comes from authenticated backend
             * context, NOT from the AI.
             */
            clinicId,
          });

          // Append an explicit instruction so the LLM cannot mistake an
          // availability result for a staged booking or rescheduling confirmation.
          result = {
            ...availResult,
            staging_note:
              "This result does NOT stage any booking action or rescheduling action. To create a pending confirmation that the patient can confirm, call book_appointment or reschedule_appointment.",
          };
        }

        // ====================================================
        // FIND PATIENT
        // ====================================================

        else if (toolName === "find_patient") {
          // For WhatsApp/voice, the platform-provided caller number is
          // authoritative. Never let the model substitute another number.
          const patientLookupArgs = callerPhone
            ? { phone: callerPhone }
            : args;

          result = await findPatientTool({
            ...patientLookupArgs,
            clinicId,
          });
        }

        // ====================================================
        // FIND DOCTOR
        // ====================================================

        else if (toolName === "find_doctor") {
          result = await findDoctorTool({
            ...args,

            clinicId,
          });
        }

        // ====================================================
        // LIST DOCTORS
        // ====================================================

        else if (toolName === "list_doctors") {
          result = await listDoctorsTool({
            clinicId,
          });
        }

        // ====================================================
        // CREATE PATIENT
        // ====================================================

        else if (toolName === "create_patient") {
          // For WhatsApp/voice, always persist the trusted caller number,
          // not a phone number generated or supplied by the model.
          const patientCreateArgs = callerPhone
            ? { ...args, phone: callerPhone }
            : args;

          result = await createPatientTool({
            ...patientCreateArgs,
            clinicId,
          });
        }

        // ====================================================
        // FIND PATIENT APPOINTMENT
        // ====================================================

        else if (
          toolName === "find_patient_appointment"
        ) {
          const appointmentLookupArgs = { ...args };
          if (callerPhone) {
            const verifiedPatient = await getVerifiedPatientForPhone(callerPhone, clinicId, db);
            if (!verifiedPatient?.found || !verifiedPatient?.patient?.id) {
              result = { found: false, message: "Your patient record could not be verified." };
            } else {
              appointmentLookupArgs.patientId = verifiedPatient.patient.id;
              result = await findPatientAppointmentTool({
                ...appointmentLookupArgs,
                clinicId,
              });
            }
          } else {
            result = await findPatientAppointmentTool({
              ...appointmentLookupArgs,
              clinicId,
            });
          }
        }

        // ====================================================
        // BOOK APPOINTMENT (STAGING ONLY)
        // ====================================================

        else if (toolName === "book_appointment") {
          if (!allowBooking) {
            result = {
              success: false,
              error: "Appointment booking is currently disabled.",
            };
            lastMutationError = result.error;
          } else if (!actorKey) {
            result = {
              success: false,
              error: "Trusted confirmation identity is required to book an appointment.",
            };
            lastMutationError = result.error;
          } else if (stagedConfirmationInTurn) {
            result = {
              success: false,
              error: "A confirmation request is already pending. Additional mutation tool calls in the same conversation turn are blocked.",
            };
            lastMutationError = result.error;
          } else {
            let bookingPatientId;
            let bookingPatientName;

            if (callerPhone) {
              const verifiedPatient = await getVerifiedPatientForPhone(callerPhone, clinicId, db);

              if (!verifiedPatient?.found || !verifiedPatient?.patient?.id) {
                result = {
                  success: false,
                  error: "Your patient record could not be verified. Please register first.",
                };
                lastMutationError = result.error;
              } else {
                bookingPatientId = verifiedPatient.patient.id;
                bookingPatientName = verifiedPatient.patient.name;
              }
            } else if (args.patientId) {
              const patient = await db.patient.findFirst({
                where: {
                  id: Number(args.patientId),
                  clinicId: Number(clinicId),
                },
              });
              if (!patient) {
                result = {
                  success: false,
                  error: "Patient not found in this hospital.",
                };
                lastMutationError = result.error;
              } else {
                bookingPatientId = patient.id;
                bookingPatientName = patient.name;
              }
            } else {
              result = {
                success: false,
                error: "patientId is required to book an appointment.",
              };
              lastMutationError = result.error;
            }

            if (!result) {
              const doctor = await db.doctor.findFirst({
                where: {
                  id: Number(args.doctorId),
                  clinicId: Number(clinicId),
                },
              });

              if (!doctor) {
                result = {
                  success: false,
                  error: "Doctor not found in this hospital.",
                };
                lastMutationError = result.error;
              } else {
                const availability = await checkAvailability({
                  doctorId: Number(doctor.id),
                  appointmentDate: args.appointmentDate,
                  startTime: args.startTime,
                  clinicId,
                });

                if (!availability.available) {
                  result = {
                    success: false,
                    error:
                      availability.message ||
                      "That appointment slot is not available.",
                    alternatives: availability.alternatives,
                  };
                  lastMutationError = result.error;
                } else {
                  const payload = {
                    clinicId: Number(clinicId),
                    patientId: Number(bookingPatientId),
                    doctorId: Number(doctor.id),
                    doctorName: doctor.name,
                    doctorSpecialization: doctor.specialization,
                    appointmentDate: args.appointmentDate,
                    startTime: args.startTime,
                    reason: args.reason || null,
                  };

                  await createPendingConfirmation(
                    {
                      actorKey,
                      clinicId: Number(clinicId),
                      patientId: Number(bookingPatientId),
                      actionType: "BOOK",
                      payload,
                    },
                    db
                  );

                  stagedConfirmationInTurn = true;
                  stagedBookingInTurn = true;

                  result = {
                    success: true,
                    status: "PENDING_CONFIRMATION",
                    requiresConfirmation: true,
                    actionType: "BOOK",
                    details: {
                      doctorName: doctor.name,
                      doctorSpecialization: doctor.specialization,
                      appointmentDate: args.appointmentDate,
                      startTime: args.startTime,
                    },
                    message: `Appointment details are staged and held. You MUST ask the patient to confirm using the EXACT details from the 'details' field: "Would you like me to book your appointment with ${doctor.name} (${doctor.specialization}) on ${args.appointmentDate} at ${args.startTime}?" Do not say it is booked yet. Always use the doctor's actual specialization from 'details.doctorSpecialization', not the patient's query term.`,
                  };
                }
              }
            }
          }
        }

        // ====================================================
        // CANCEL APPOINTMENT (STAGING ONLY)
        // ====================================================

        else if (toolName === "cancel_appointment") {
          if (!allowAppointmentChanges) {
            result = {
              success: false,
              error: "Appointment cancellation is currently disabled.",
            };
            lastMutationError = result.error;
          } else if (!actorKey) {
            result = {
              success: false,
              error: "Trusted confirmation identity is required.",
            };
            lastMutationError = result.error;
          } else if (stagedConfirmationInTurn) {
            result = {
              success: false,
              error: "A confirmation request is already pending. Additional mutation tool calls in the same conversation turn are blocked.",
            };
            lastMutationError = result.error;
          } else {
            let verifiedPatientId;

            if (callerPhone) {
              const verifiedPatient = await getVerifiedPatientForPhone(callerPhone, clinicId, db);
              if (!verifiedPatient?.found || !verifiedPatient?.patient?.id) {
                result = {
                  success: false,
                  error: "Your patient record could not be verified for your WhatsApp number.",
                };
                lastMutationError = result.error;
              } else {
                verifiedPatientId = verifiedPatient.patient.id;
              }
            } else if (args.patientId) {
              verifiedPatientId = Number(args.patientId);
            }

            if (!result) {
              const appointment = await db.appointment.findFirst({
                where: {
                  id: Number(args.appointmentId),
                  clinicId: Number(clinicId),
                  ...(verifiedPatientId ? { patientId: Number(verifiedPatientId) } : {}),
                  status: "BOOKED",
                },
                include: {
                  doctor: true,
                },
              });

              if (!appointment) {
                result = {
                  success: false,
                  error: "No active appointment found matching that ID for this patient.",
                };
                lastMutationError = result.error;
              } else {
                const dateStr = appointment.appointmentDate
                  ? appointment.appointmentDate.toISOString().slice(0, 10)
                  : undefined;

                const payload = {
                  clinicId: Number(clinicId),
                  patientId: Number(appointment.patientId),
                  appointmentId: Number(appointment.id),
                  doctorName: appointment.doctor?.name,
                  appointmentDate: dateStr,
                  startTime: appointment.startTime,
                };

                await createPendingConfirmation(
                  {
                    actorKey,
                    clinicId: Number(clinicId),
                    patientId: Number(appointment.patientId),
                    actionType: "CANCEL",
                    payload,
                  },
                  db
                );

                stagedConfirmationInTurn = true;
                stagedCancelInTurn = true;

                result = {
                  success: true,
                  status: "PENDING_CONFIRMATION",
                  requiresConfirmation: true,
                  actionType: "CANCEL",
                  message: `Cancellation is staged. You MUST ask the patient to confirm: "Are you sure you want to cancel your appointment with ${appointment.doctor?.name || "the doctor"} on ${dateStr} at ${appointment.startTime}?" Do not say it is cancelled yet.`,
                };
              }
            }
          }
        }

        // ====================================================
        // RESCHEDULE APPOINTMENT (STAGING ONLY)
        // ====================================================

        else if (toolName === "reschedule_appointment") {
          if (!allowAppointmentChanges) {
            result = {
              success: false,
              error: "Appointment rescheduling is currently disabled.",
            };
            lastMutationError = result.error;
          } else if (!actorKey) {
            result = {
              success: false,
              error: "Trusted confirmation identity is required to reschedule an appointment.",
            };
            lastMutationError = result.error;
          } else if (stagedConfirmationInTurn) {
            result = {
              success: false,
              error: "A confirmation request is already pending. Additional mutation tool calls in the same conversation turn are blocked.",
            };
            lastMutationError = result.error;
          } else if (!args.appointmentId || !args.newDate || !args.newTime) {
            result = {
              success: false,
              error: "appointmentId, newDate, and newTime are required to reschedule an appointment.",
            };
            lastMutationError = result.error;
          } else {
            let verifiedPatientId;

            if (callerPhone) {
              const verifiedPatient = await getVerifiedPatientForPhone(callerPhone, clinicId, db);
              if (!verifiedPatient?.found || !verifiedPatient?.patient?.id) {
                result = {
                  success: false,
                  error: "That appointment could not be verified for your WhatsApp number.",
                };
                lastMutationError = result.error;
              } else {
                verifiedPatientId = verifiedPatient.patient.id;
              }
            } else if (args.patientId) {
              verifiedPatientId = Number(args.patientId);
            }

            if (!result) {
              const appointment = await db.appointment.findFirst({
                where: {
                  id: Number(args.appointmentId),
                  clinicId: Number(clinicId),
                  ...(verifiedPatientId ? { patientId: Number(verifiedPatientId) } : {}),
                  status: "BOOKED",
                },
                include: {
                  doctor: true,
                },
              });

              if (!appointment || Number(appointment.clinicId) !== Number(clinicId) || (verifiedPatientId && Number(appointment.patientId) !== Number(verifiedPatientId))) {
                result = {
                  success: false,
                  error: "No active appointment found to reschedule for your account in this hospital.",
                };
                lastMutationError = result.error;
              } else {
                const availability = await checkAvailability({
                  doctorId: Number(appointment.doctorId),
                  appointmentDate: args.newDate,
                  startTime: args.newTime,
                  clinicId,
                  excludeAppointmentId: Number(appointment.id),
                });

                if (!availability.available) {
                  result = {
                    success: false,
                    error:
                      availability.message ||
                      "That new appointment slot is not available.",
                    alternatives: availability.alternatives,
                  };
                  lastMutationError = result.error;
                } else {
                  const payload = {
                    clinicId: Number(clinicId),
                    patientId: Number(appointment.patientId),
                    appointmentId: Number(appointment.id),
                    doctorId: Number(appointment.doctorId),
                    doctorName: appointment.doctor?.name,
                    doctorSpecialization: appointment.doctor?.specialization,
                    newDate: args.newDate,
                    newTime: args.newTime,
                  };

                  await createPendingConfirmation(
                    {
                      actorKey,
                      clinicId: Number(clinicId),
                      patientId: Number(appointment.patientId),
                      actionType: "RESCHEDULE",
                      payload,
                    },
                    db
                  );

                  stagedConfirmationInTurn = true;
                  stagedRescheduleInTurn = true;

                  const doctorSpecialization = appointment.doctor?.specialization;
                  const docSpecStr = doctorSpecialization ? ` (${doctorSpecialization})` : "";
                  const oldDateStr = appointment.appointmentDate
                    ? (typeof appointment.appointmentDate === "string"
                        ? appointment.appointmentDate.slice(0, 10)
                        : appointment.appointmentDate.toISOString().slice(0, 10))
                    : undefined;

                  result = {
                    success: true,
                    status: "PENDING_CONFIRMATION",
                    requiresConfirmation: true,
                    actionType: "RESCHEDULE",
                    details: {
                      appointmentId: Number(appointment.id),
                      doctorName: appointment.doctor?.name,
                      doctorSpecialization: appointment.doctor?.specialization,
                      oldDate: oldDateStr,
                      oldTime: appointment.startTime,
                      newDate: args.newDate,
                      newTime: args.newTime,
                    },
                    message: `Rescheduling is staged. You MUST ask the patient to confirm using the EXACT details from the 'details' field: "Would you like me to reschedule your appointment with Dr. ${appointment.doctor?.name || "the doctor"}${docSpecStr} from ${appointment.startTime} to ${args.newTime} on ${args.newDate}?" Do not say it is rescheduled yet. Always use the doctor's actual specialization from 'details.doctorSpecialization', not the patient's query term.`,
                  };
                }
              }
            }
          }
        }

        // ====================================================
        // UNKNOWN TOOL
        // ====================================================

        else {
          result = {
            success: false,

            error:
              `Unknown tool: ${toolName}`,
          };
        }
      } catch (error) {
        // ====================================================
        // TOOL ERROR
        // ====================================================

        console.error(
          `Tool ${toolName} failed:`,
          error
        );

        result = {
          success: false,

          error:
            error.message ||
            "An internal error occurred.",
        };

        // Preserve backend alternatives
        if (error.alternatives) {
          result.alternatives =
            error.alternatives;
        }
      }

      console.log(
        "TOOL RESULT:",
        result
      );

      // ======================================================
      // SEND TOOL RESULT BACK TO AI
      // ======================================================

      messages.push({
        role: "tool",

        tool_call_id: toolCall.id,

        content: JSON.stringify(result),
      });
    }
  }
}

// ============================================================
// EXPORT
// ============================================================

module.exports = {
  askAI,
};