/**
 * whatsappRescheduleFlow.test.js
 *
 * Regression tests for WhatsApp appointment rescheduling flow:
 *   1. Full flow: BOOK -> confirm -> RESCHEDULE -> confirm:
 *      Existing appointment's time changes, and NO duplicate appointment is created.
 *   2. Replay prevention: A consumed reschedule confirmation cannot be consumed again.
 *   3. Expiry: Expired reschedule confirmation cannot be consumed after 5-min TTL.
 *   4. Availability revalidation: Unavailable slot during confirmation execution rejects cleanly.
 *   5. Unavailable slot during staging: Fails cleanly and does NOT ask for confirmation.
 *   6. Unauthorized patient: Cannot stage or confirm rescheduling for another patient's appointment.
 *   7. Cross-clinic access: Cannot stage or confirm rescheduling across clinic boundaries.
 *   8. Stale prompt prevention: Unstaged confirmation prompt is blocked if reschedule_appointment was not called.
 *   9. Disabled rescheduling: Returns disabled error without staging.
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const { askAI } = require("../src/modules/ai/aiService");
const {
  getActorKey,
  createPendingConfirmation,
  getPendingConfirmation,
  consumePendingConfirmation,
  validatePendingConfirmationScope,
  executeConfirmedAppointmentMutation,
} = require("../src/modules/appointments/appointmentConfirmation");

// ============================================================
// IN-MEMORY MOCK DATABASE FACTORY
// ============================================================

function createMockDb({
  initialAppointments = [],
  initialPatients = [],
  initialDoctors = [],
} = {}) {
  const confirmations = new Map();
  const processedMessages = new Map();
  const appointments = new Map();
  const patients = new Map();
  const doctors = new Map();

  for (const a of initialAppointments) {
    appointments.set(a.id, { ...a });
  }
  for (const p of initialPatients) {
    patients.set(p.id, { ...p });
  }
  for (const d of initialDoctors) {
    doctors.set(d.id, { ...d });
  }

  return {
    _stores: { confirmations, processedMessages, appointments, patients, doctors },

    appointmentConfirmation: {
      async upsert({ where, create, update }) {
        const existing = [...confirmations.values()].find(
          (r) => r.actorKey === where.actorKey
        );
        if (existing) {
          const updated = { ...existing, ...update, updatedAt: new Date() };
          confirmations.set(existing.id, updated);
          return updated;
        }
        const created = {
          id: "conf_" + Math.random().toString(36).slice(2),
          ...create,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        confirmations.set(created.id, created);
        return created;
      },
      async findUnique({ where }) {
        return (
          [...confirmations.values()].find(
            (r) => r.actorKey === where.actorKey
          ) || null
        );
      },
      async updateMany({ where, data }) {
        let count = 0;
        for (const [id, record] of confirmations.entries()) {
          if (where.id && record.id !== where.id) continue;
          if (where.actorKey && record.actorKey !== where.actorKey) continue;
          if (where.status && record.status !== where.status) continue;
          if (
            where.expiresAt?.gt &&
            !(new Date(record.expiresAt) > where.expiresAt.gt)
          ) {
            continue;
          }
          confirmations.set(id, { ...record, ...data, updatedAt: new Date() });
          count++;
        }
        return { count };
      },
    },

    appointment: {
      async findFirst({ where, include }) {
        for (const a of appointments.values()) {
          if (where.id && a.id !== where.id) continue;
          if (where.clinicId && a.clinicId !== where.clinicId) continue;
          if (where.patientId && a.patientId !== where.patientId) continue;
          if (where.doctorId && a.doctorId !== where.doctorId) continue;
          if (where.status && a.status !== where.status) continue;
          if (where.appointmentDate) {
            const expectedDate = new Date(where.appointmentDate).toISOString().slice(0, 10);
            const actualDate = new Date(a.appointmentDate).toISOString().slice(0, 10);
            if (expectedDate !== actualDate) continue;
          }
          if (where.startTime && a.startTime !== where.startTime) continue;

          let res = { ...a };
          if (include?.doctor) {
            const doc = doctors.get(a.doctorId);
            res.doctor = doc || { id: a.doctorId, name: "Dr. Doctor", specialization: "General" };
          }
          return res;
        }
        return null;
      },

      async findMany({ where }) {
        const results = [];
        for (const a of appointments.values()) {
          if (where.clinicId && a.clinicId !== where.clinicId) continue;
          if (where.doctorId && a.doctorId !== where.doctorId) continue;
          if (where.status && a.status !== where.status) continue;
          if (where.id?.not && a.id === where.id.not) continue;
          if (where.appointmentDate) {
            const expectedDate = new Date(where.appointmentDate).toISOString().slice(0, 10);
            const actualDate = new Date(a.appointmentDate).toISOString().slice(0, 10);
            if (expectedDate !== actualDate) continue;
          }
          results.push({ ...a });
        }
        return results;
      },

      async create({ data }) {
        const id = data.id || (appointments.size + 1);
        const record = { id, ...data, status: data.status || "BOOKED", createdAt: new Date() };
        appointments.set(id, record);
        return record;
      },

      async update({ where, data }) {
        const existing = appointments.get(where.id);
        if (!existing) throw new Error("Appointment not found");
        const updated = { ...existing, ...data };
        appointments.set(where.id, updated);
        return updated;
      },
    },

    patient: {
      async findFirst({ where }) {
        for (const p of patients.values()) {
          if (where.id && p.id !== where.id) continue;
          if (where.clinicId && p.clinicId !== where.clinicId) continue;
          if (where.phone && p.phone !== where.phone) continue;
          return { ...p };
        }
        return null;
      },
    },

    doctor: {
      async findFirst({ where }) {
        for (const d of doctors.values()) {
          if (where.id && d.id !== where.id) continue;
          if (where.clinicId && d.clinicId !== where.clinicId) continue;
          return { ...d };
        }
        return null;
      },
    },
  };
}

// ============================================================
// FIXTURES
// ============================================================

const CLINIC_ID = 1;
const CALLER_PHONE = "919876543210";
const DOCTOR = {
  id: 2,
  clinicId: CLINIC_ID,
  name: "Amit Sharma",
  specialization: "Dentist",
};
const PATIENT = {
  id: 6,
  clinicId: CLINIC_ID,
  name: "Rahul Verma",
  phone: CALLER_PHONE,
};
const APPT_DATE = "2026-10-25";
const OLD_TIME = "17:00";
const NEW_TIME = "19:00";

// ============================================================
// TEST 1: Full Flow: BOOK -> confirm -> RESCHEDULE -> confirm
// ============================================================

test("Full Flow: BOOK -> confirm -> RESCHEDULE -> confirm updates existing appointment without duplicate", async () => {
  const db = createMockDb({
    initialDoctors: [DOCTOR],
    initialPatients: [PATIENT],
  });
  const actorKey = getActorKey({ clinicId: CLINIC_ID, callerPhone: CALLER_PHONE });

  // ----------------------------------------------------------
  // STEP 1: Stage and confirm initial booking (Appointment ID 13)
  // ----------------------------------------------------------
  await createPendingConfirmation(
    {
      actorKey,
      clinicId: CLINIC_ID,
      patientId: PATIENT.id,
      actionType: "BOOK",
      payload: {
        clinicId: CLINIC_ID,
        patientId: PATIENT.id,
        doctorId: DOCTOR.id,
        doctorName: DOCTOR.name,
        doctorSpecialization: DOCTOR.specialization,
        appointmentDate: APPT_DATE,
        startTime: OLD_TIME,
        reason: "Regular checkup",
      },
    },
    db
  );

  let bookExecuted = false;
  const mockBookingServices = {
    checkAvailability: async () => ({ available: true }),
    bookAppointment: async (payload) => {
      bookExecuted = true;
      const appt = await db.appointment.create({
        data: {
          id: 13,
          clinicId: payload.clinicId,
          patientId: payload.patientId,
          doctorId: payload.doctorId,
          appointmentDate: new Date(`${payload.appointmentDate}T00:00:00.000Z`),
          startTime: payload.startTime,
          status: "BOOKED",
        },
      });
      return { success: true, appointment: appt };
    },
  };

  // Patient confirms booking with standalone "yes"
  const bookReply = await askAI("yes", [], true, CLINIC_ID, {
    callerPhone: CALLER_PHONE,
    db,
    chatCompletionFn: async () => {
      throw new Error("LLM must not be called on standalone confirmation");
    },
    confirmationServices: mockBookingServices,
  });

  assert.equal(bookExecuted, true, "Booking must be executed");
  assert.match(bookReply.response, /successfully confirmed and booked/i);

  // Verify DB state after booking: exactly 1 appointment at 17:00
  assert.equal(db._stores.appointments.size, 1);
  const initialAppt = db._stores.appointments.get(13);
  assert.ok(initialAppt);
  assert.equal(initialAppt.startTime, OLD_TIME);
  assert.equal(initialAppt.status, "BOOKED");

  // Verify confirmation record is now CONSUMED
  const consumedBookRecord = await db.appointmentConfirmation.findUnique({ where: { actorKey } });
  assert.equal(consumedBookRecord.status, "CONSUMED");

  // ----------------------------------------------------------
  // STEP 2: Patient asks to reschedule to 19:00
  // LLM calls reschedule_appointment tool with appointmentId: 13, newDate, newTime
  // ----------------------------------------------------------
  let rescheduleServiceExecuted = false;
  const mockRescheduleServices = {
    checkAvailability: async (doctorId, date, time, clinicId, excludeId) => {
      assert.equal(Number(doctorId), DOCTOR.id);
      assert.equal(date, APPT_DATE);
      assert.equal(time, NEW_TIME);
      assert.equal(Number(excludeId), 13);
      return { available: true };
    },
    rescheduleAppointment: async ({ appointmentId, newDate, newTime, clinicId, patientId }) => {
      rescheduleServiceExecuted = true;
      assert.equal(appointmentId, 13);
      assert.equal(clinicId, CLINIC_ID);
      assert.equal(patientId, PATIENT.id);
      const updated = await db.appointment.update({
        where: { id: appointmentId },
        data: {
          appointmentDate: new Date(`${newDate}T00:00:00.000Z`),
          startTime: newTime,
        },
      });
      return { success: true, appointment: updated };
    },
  };

  let callIndex = 0;
  const mockLLM = async (messages) => {
    callIndex++;
    if (callIndex === 1) {
      // LLM decides to call reschedule_appointment
      return {
        choices: [
          {
            message: {
              role: "assistant",
              content: null,
              tool_calls: [
                {
                  id: "call_reschedule_1",
                  type: "function",
                  function: {
                    name: "reschedule_appointment",
                    arguments: JSON.stringify({
                      appointmentId: 13,
                      newDate: APPT_DATE,
                      newTime: NEW_TIME,
                    }),
                  },
                },
              ],
            },
          },
        ],
      };
    }

    // Turn 2: Assistant receives tool result with status PENDING_CONFIRMATION
    // and generates confirmation question
    return {
      choices: [
        {
          message: {
            role: "assistant",
            content: `I can reschedule your appointment with Dr. ${DOCTOR.name} (${DOCTOR.specialization}) from ${OLD_TIME} to ${NEW_TIME} on ${APPT_DATE}. Would you like me to confirm this change?`,
          },
        },
      ],
    };
  };

  const reschedulePromptReply = await askAI(
    `Please reschedule my appointment to ${NEW_TIME}`,
    [],
    true,
    CLINIC_ID,
    {
      callerPhone: CALLER_PHONE,
      db,
      chatCompletionFn: mockLLM,
      confirmationServices: mockRescheduleServices,
    }
  );

  // Verify the AI asked for confirmation
  assert.match(reschedulePromptReply.response, /Would you like me to (?:reschedule|confirm)/i);

  // CRITICAL: The older CONSUMED confirmation record did NOT block the new PENDING reschedule record!
  const stagedRecord = await getPendingConfirmation(actorKey, db);
  assert.ok(stagedRecord, "A fresh PENDING record must exist for reschedule");
  assert.equal(stagedRecord.status, "PENDING");
  assert.equal(stagedRecord.actionType, "RESCHEDULE");
  assert.equal(stagedRecord.payload.appointmentId, 13);
  assert.equal(stagedRecord.payload.patientId, PATIENT.id);
  assert.equal(stagedRecord.payload.clinicId, CLINIC_ID);
  assert.equal(stagedRecord.payload.doctorId, DOCTOR.id);
  assert.equal(stagedRecord.payload.newDate, APPT_DATE);
  assert.equal(stagedRecord.payload.newTime, NEW_TIME);

  // ----------------------------------------------------------
  // STEP 3: Patient replies "yes" to confirm the rescheduling
  // ----------------------------------------------------------
  const confirmRescheduleReply = await askAI("yes", [], true, CLINIC_ID, {
    callerPhone: CALLER_PHONE,
    db,
    chatCompletionFn: async () => {
      throw new Error("LLM must NOT be called on standalone reschedule confirmation");
    },
    confirmationServices: mockRescheduleServices,
  });

  assert.equal(rescheduleServiceExecuted, true, "rescheduleAppointment must be executed");
  assert.match(confirmRescheduleReply.response, /successfully rescheduled to 2026-10-25 at 19:00/i);

  // ----------------------------------------------------------
  // STEP 4: VERIFY POST-RESCHEDULE INTEGRITY
  // ----------------------------------------------------------
  // 1. Appointment count remains EXACTLY 1 (no duplicate appointment created!)
  assert.equal(db._stores.appointments.size, 1, "No duplicate appointment must be created");

  // 2. Existing appointment ID 13 time was updated to 19:00
  const finalAppt = db._stores.appointments.get(13);
  assert.equal(finalAppt.id, 13);
  assert.equal(finalAppt.startTime, NEW_TIME);
  assert.equal(finalAppt.patientId, PATIENT.id);
  assert.equal(finalAppt.doctorId, DOCTOR.id);

  // 3. Confirmation record transitioned to CONSUMED
  const finalConfRecord = await db.appointmentConfirmation.findUnique({ where: { actorKey } });
  assert.equal(finalConfRecord.status, "CONSUMED");
  assert.equal(finalConfRecord.actionType, "RESCHEDULE");
});

// ============================================================
// TEST 2: Replay prevention: second "yes" after CONSUMED reschedule
// ============================================================

test("Reschedule flow: second 'yes' after CONSUMED reschedule returns already-processed notice without modifying appointment", async () => {
  const db = createMockDb({
    initialDoctors: [DOCTOR],
    initialPatients: [PATIENT],
    initialAppointments: [
      {
        id: 13,
        clinicId: CLINIC_ID,
        patientId: PATIENT.id,
        doctorId: DOCTOR.id,
        appointmentDate: new Date(`${APPT_DATE}T00:00:00.000Z`),
        startTime: NEW_TIME,
        status: "BOOKED",
      },
    ],
  });
  const actorKey = getActorKey({ clinicId: CLINIC_ID, callerPhone: CALLER_PHONE });

  // Pre-seed a CONSUMED RESCHEDULE record
  await db.appointmentConfirmation.upsert({
    where: { actorKey },
    create: {
      actorKey,
      clinicId: CLINIC_ID,
      patientId: PATIENT.id,
      actionType: "RESCHEDULE",
      payload: {
        clinicId: CLINIC_ID,
        patientId: PATIENT.id,
        appointmentId: 13,
        doctorId: DOCTOR.id,
        newDate: APPT_DATE,
        newTime: NEW_TIME,
      },
      status: "CONSUMED",
      expiresAt: new Date(Date.now() + 300000),
    },
    update: {},
  });

  let rescheduleCalled = false;
  const mockServices = {
    checkAvailability: async () => ({ available: true }),
    rescheduleAppointment: async () => {
      rescheduleCalled = true;
      return { success: true };
    },
  };

  const reply = await askAI("yes", [], true, CLINIC_ID, {
    callerPhone: CALLER_PHONE,
    db,
    chatCompletionFn: async () => {
      throw new Error("LLM must not be called");
    },
    confirmationServices: mockServices,
  });

  assert.equal(
    reply.response,
    "This appointment confirmation has already been processed."
  );
  assert.equal(rescheduleCalled, false, "rescheduleAppointment must NOT be called on replay");
});

// ============================================================
// TEST 3: Expired confirmation: cannot confirm after TTL expires
// ============================================================

test("Reschedule flow: expired reschedule confirmation returns expiration notice and does not modify appointment", async () => {
  const db = createMockDb({
    initialDoctors: [DOCTOR],
    initialPatients: [PATIENT],
    initialAppointments: [
      {
        id: 13,
        clinicId: CLINIC_ID,
        patientId: PATIENT.id,
        doctorId: DOCTOR.id,
        appointmentDate: new Date(`${APPT_DATE}T00:00:00.000Z`),
        startTime: OLD_TIME,
        status: "BOOKED",
      },
    ],
  });
  const actorKey = getActorKey({ clinicId: CLINIC_ID, callerPhone: CALLER_PHONE });

  // Pre-seed a PENDING record that has expired 10 seconds ago
  await db.appointmentConfirmation.upsert({
    where: { actorKey },
    create: {
      actorKey,
      clinicId: CLINIC_ID,
      patientId: PATIENT.id,
      actionType: "RESCHEDULE",
      payload: {
        clinicId: CLINIC_ID,
        patientId: PATIENT.id,
        appointmentId: 13,
        doctorId: DOCTOR.id,
        newDate: APPT_DATE,
        newTime: NEW_TIME,
      },
      status: "PENDING",
      expiresAt: new Date(Date.now() - 10000),
    },
    update: {},
  });

  let rescheduleCalled = false;
  const mockServices = {
    checkAvailability: async () => ({ available: true }),
    rescheduleAppointment: async () => {
      rescheduleCalled = true;
      return { success: true };
    },
  };

  const reply = await askAI("yes", [], true, CLINIC_ID, {
    callerPhone: CALLER_PHONE,
    db,
    chatCompletionFn: async () => {
      throw new Error("LLM must not be called on expired confirmation");
    },
    confirmationServices: mockServices,
  });

  assert.match(reply.response, /confirmation window has expired/i);
  assert.equal(rescheduleCalled, false, "rescheduleAppointment must not be called when expired");

  // Appointment time remains unchanged
  const appt = db._stores.appointments.get(13);
  assert.equal(appt.startTime, OLD_TIME);
});

// ============================================================
// TEST 4: Unavailable slot during confirmation execution
// ============================================================

test("Reschedule flow: slot becoming unavailable before confirmation rejects cleanly and preserves original time", async () => {
  const db = createMockDb({
    initialDoctors: [DOCTOR],
    initialPatients: [PATIENT],
    initialAppointments: [
      {
        id: 13,
        clinicId: CLINIC_ID,
        patientId: PATIENT.id,
        doctorId: DOCTOR.id,
        appointmentDate: new Date(`${APPT_DATE}T00:00:00.000Z`),
        startTime: OLD_TIME,
        status: "BOOKED",
      },
    ],
  });
  const actorKey = getActorKey({ clinicId: CLINIC_ID, callerPhone: CALLER_PHONE });

  // Staged reschedule for 19:00
  await createPendingConfirmation(
    {
      actorKey,
      clinicId: CLINIC_ID,
      patientId: PATIENT.id,
      actionType: "RESCHEDULE",
      payload: {
        clinicId: CLINIC_ID,
        patientId: PATIENT.id,
        appointmentId: 13,
        doctorId: DOCTOR.id,
        newDate: APPT_DATE,
        newTime: NEW_TIME,
      },
    },
    db
  );

  let rescheduleCalled = false;
  const mockServices = {
    // Slot availability check fails (slot was taken in the meantime)
    checkAvailability: async () => ({
      available: false,
      message: "That appointment slot is no longer available. Please select another time.",
    }),
    rescheduleAppointment: async () => {
      rescheduleCalled = true;
      return { success: true };
    },
  };

  const reply = await askAI("yes", [], true, CLINIC_ID, {
    callerPhone: CALLER_PHONE,
    db,
    chatCompletionFn: async () => {
      throw new Error("LLM must not be called");
    },
    confirmationServices: mockServices,
  });

  assert.match(reply.response, /no longer available/i);
  assert.equal(rescheduleCalled, false, "rescheduleAppointment must not be called when slot is unavailable");

  // Original appointment time is preserved
  const appt = db._stores.appointments.get(13);
  assert.equal(appt.startTime, OLD_TIME);
});

// ============================================================
// TEST 5: Unavailable slot during staging: fails and does NOT ask for confirmation
// ============================================================

test("Reschedule flow: unavailable slot during staging returns error and never asks for confirmation", async () => {
  const db = createMockDb({
    initialDoctors: [DOCTOR],
    initialPatients: [PATIENT],
    initialAppointments: [
      {
        id: 13,
        clinicId: CLINIC_ID,
        patientId: PATIENT.id,
        doctorId: DOCTOR.id,
        appointmentDate: new Date(`${APPT_DATE}T00:00:00.000Z`),
        startTime: OLD_TIME,
        status: "BOOKED",
      },
      // Another appointment already occupies 19:00
      {
        id: 20,
        clinicId: CLINIC_ID,
        patientId: 99,
        doctorId: DOCTOR.id,
        appointmentDate: new Date(`${APPT_DATE}T00:00:00.000Z`),
        startTime: NEW_TIME,
        status: "BOOKED",
      },
    ],
  });
  const actorKey = getActorKey({ clinicId: CLINIC_ID, callerPhone: CALLER_PHONE });

  // Simulate LLM calling reschedule_appointment for 19:00
  let callIndex = 0;
  const mockLLM = async () => {
    callIndex++;
    if (callIndex === 1) {
      return {
        choices: [
          {
            message: {
              role: "assistant",
              content: null,
              tool_calls: [
                {
                  id: "call_reschedule_unavailable",
                  type: "function",
                  function: {
                    name: "reschedule_appointment",
                    arguments: JSON.stringify({
                      appointmentId: 13,
                      newDate: APPT_DATE,
                      newTime: NEW_TIME,
                    }),
                  },
                },
              ],
            },
          },
        ],
      };
    }

    // In turn 2, assistant tries to ask for confirmation anyway despite failure
    return {
      choices: [
        {
          message: {
            role: "assistant",
            content: "Would you like me to confirm this change?",
          },
        },
      ],
    };
  };

  const reply = await askAI(
    `Reschedule appointment 13 to ${NEW_TIME}`,
    [],
    true,
    CLINIC_ID,
    {
      callerPhone: CALLER_PHONE,
      db,
      chatCompletionFn: mockLLM,
      confirmationServices: {
        checkAvailability: async () => ({
          available: false,
          message: "That new appointment slot is not available.",
        }),
      },
    }
  );

  // The guardrail intercepts the unstaged confirmation question and reports error
  assert.match(reply.response, /cannot reschedule|not available/i);
  assert.equal(reply.response.includes("Would you like me to confirm"), false);

  // No pending record was created
  const pending = await getPendingConfirmation(actorKey, db);
  assert.equal(pending, null, "No pending record must exist when staging fails");
});

// ============================================================
// TEST 6: Unauthorized patient access: cannot reschedule another patient's appointment
// ============================================================

test("Reschedule flow: unauthorized patient access is rejected during staging and execution", async () => {
  const db = createMockDb({
    initialDoctors: [DOCTOR],
    initialPatients: [
      PATIENT, // Patient 6 (919876543210)
      { id: 99, clinicId: CLINIC_ID, name: "Other Patient", phone: "919999999999" },
    ],
    initialAppointments: [
      // Appointment 13 belongs to Patient 6
      {
        id: 13,
        clinicId: CLINIC_ID,
        patientId: PATIENT.id,
        doctorId: DOCTOR.id,
        appointmentDate: new Date(`${APPT_DATE}T00:00:00.000Z`),
        startTime: OLD_TIME,
        status: "BOOKED",
      },
    ],
  });

  // Patient 99 calls in and tries to reschedule appointment 13 (belongs to patient 6)
  const callerPhoneOther = "919999999999";
  const actorKeyOther = getActorKey({ clinicId: CLINIC_ID, callerPhone: callerPhoneOther });

  let callIndex = 0;
  const mockLLM = async () => {
    callIndex++;
    if (callIndex === 1) {
      return {
        choices: [
          {
            message: {
              role: "assistant",
              content: null,
              tool_calls: [
                {
                  id: "call_attack",
                  type: "function",
                  function: {
                    name: "reschedule_appointment",
                    arguments: JSON.stringify({
                      appointmentId: 13,
                      newDate: APPT_DATE,
                      newTime: NEW_TIME,
                    }),
                  },
                },
              ],
            },
          },
        ],
      };
    }
    return {
      choices: [{ message: { role: "assistant", content: "I cannot reschedule that appointment." } }],
    };
  };

  await askAI(
    `Reschedule appointment 13 to ${NEW_TIME}`,
    [],
    true,
    CLINIC_ID,
    {
      callerPhone: callerPhoneOther,
      db,
      chatCompletionFn: mockLLM,
    }
  );

  // Staging was rejected; no pending record for callerOther
  const pendingOther = await getPendingConfirmation(actorKeyOther, db);
  assert.equal(pendingOther, null, "Patient 99 must not be able to stage appointment 13");

  // Also verify executeConfirmedAppointmentMutation rejects mismatched patientId
  const forgedPending = {
    clinicId: CLINIC_ID,
    patientId: PATIENT.id, // belongs to 6
    actionType: "RESCHEDULE",
    payload: {
      clinicId: CLINIC_ID,
      patientId: PATIENT.id,
      appointmentId: 13,
      doctorId: DOCTOR.id,
      newDate: APPT_DATE,
      newTime: NEW_TIME,
    },
  };

  await assert.rejects(
    async () =>
      executeConfirmedAppointmentMutation({
        pending: forgedPending,
        clinicId: CLINIC_ID,
        patientId: 99, // attacker is 99
        services: {
          checkAvailability: async () => ({ available: true }),
          rescheduleAppointment: async () => ({ success: true }),
        },
      }),
    /Unauthorized patient access denied/
  );
});

// ============================================================
// TEST 7: Cross-clinic access: cannot reschedule across clinic boundaries
// ============================================================

test("Reschedule flow: cross-clinic access is rejected during staging and execution", async () => {
  const OTHER_CLINIC_ID = 2;
  const db = createMockDb({
    initialDoctors: [DOCTOR],
    initialPatients: [PATIENT],
    initialAppointments: [
      // Appointment 13 belongs to Clinic 1
      {
        id: 13,
        clinicId: CLINIC_ID,
        patientId: PATIENT.id,
        doctorId: DOCTOR.id,
        appointmentDate: new Date(`${APPT_DATE}T00:00:00.000Z`),
        startTime: OLD_TIME,
        status: "BOOKED",
      },
    ],
  });

  const actorKeyClinic2 = getActorKey({ clinicId: OTHER_CLINIC_ID, callerPhone: CALLER_PHONE });

  // Caller is authenticated under Clinic 2, tries to reschedule appointment 13 (Clinic 1)
  let callIndex = 0;
  const mockLLM = async () => {
    callIndex++;
    if (callIndex === 1) {
      return {
        choices: [
          {
            message: {
              role: "assistant",
              content: null,
              tool_calls: [
                {
                  id: "call_cross_clinic",
                  type: "function",
                  function: {
                    name: "reschedule_appointment",
                    arguments: JSON.stringify({
                      appointmentId: 13,
                      newDate: APPT_DATE,
                      newTime: NEW_TIME,
                    }),
                  },
                },
              ],
            },
          },
        ],
      };
    }
    return {
      choices: [{ message: { role: "assistant", content: "No appointment found in this hospital." } }],
    };
  };

  await askAI(
    `Reschedule appointment 13 to ${NEW_TIME}`,
    [],
    true,
    OTHER_CLINIC_ID, // Clinic 2
    {
      callerPhone: CALLER_PHONE,
      db,
      chatCompletionFn: mockLLM,
    }
  );

  const pending = await getPendingConfirmation(actorKeyClinic2, db);
  assert.equal(pending, null, "Cannot stage reschedule for appointment in another clinic");

  // Also verify executeConfirmedAppointmentMutation throws Cross-clinic access denied
  const crossClinicPending = {
    clinicId: CLINIC_ID, // 1
    patientId: PATIENT.id,
    actionType: "RESCHEDULE",
    payload: {
      clinicId: CLINIC_ID,
      patientId: PATIENT.id,
      appointmentId: 13,
      doctorId: DOCTOR.id,
      newDate: APPT_DATE,
      newTime: NEW_TIME,
    },
  };

  await assert.rejects(
    async () =>
      executeConfirmedAppointmentMutation({
        pending: crossClinicPending,
        clinicId: OTHER_CLINIC_ID, // executing under Clinic 2
        patientId: PATIENT.id,
        services: {
          checkAvailability: async () => ({ available: true }),
          rescheduleAppointment: async () => ({ success: true }),
        },
      }),
    /Cross-clinic access denied/
  );
});

// ============================================================
// TEST 8: Reproduction bug prevented: check_availability alone without staging blocked
// ============================================================

test("Reschedule flow: AI attempting to ask for confirmation without calling reschedule_appointment is blocked", async () => {
  const db = createMockDb({
    initialDoctors: [DOCTOR],
    initialPatients: [PATIENT],
    initialAppointments: [
      {
        id: 13,
        clinicId: CLINIC_ID,
        patientId: PATIENT.id,
        doctorId: DOCTOR.id,
        appointmentDate: new Date(`${APPT_DATE}T00:00:00.000Z`),
        startTime: OLD_TIME,
        status: "BOOKED",
      },
    ],
  });
  const actorKey = getActorKey({ clinicId: CLINIC_ID, callerPhone: CALLER_PHONE });

  // Pre-seed an older CONSUMED booking record (from the initial booking)
  await db.appointmentConfirmation.upsert({
    where: { actorKey },
    create: {
      actorKey,
      clinicId: CLINIC_ID,
      patientId: PATIENT.id,
      actionType: "BOOK",
      payload: { clinicId: CLINIC_ID, patientId: PATIENT.id, doctorId: DOCTOR.id },
      status: "CONSUMED",
      expiresAt: new Date(Date.now() - 60000),
    },
    update: {},
  });

  // Simulate buggy AI behavior from the bug report:
  // 1. find_patient_appointment finds 13
  // 2. check_availability confirms 19:00 is available
  // 3. AI outputs confirmation prompt without calling reschedule_appointment
  let callIndex = 0;
  const buggyLLM = async () => {
    callIndex++;
    if (callIndex === 1) {
      return {
        choices: [
          {
            message: {
              role: "assistant",
              content: null,
              tool_calls: [
                {
                  id: "call_check_avail",
                  type: "function",
                  function: {
                    name: "check_availability",
                    arguments: JSON.stringify({
                      doctorId: DOCTOR.id,
                      appointmentDate: APPT_DATE,
                      startTime: NEW_TIME,
                    }),
                  },
                },
              ],
            },
          },
        ],
      };
    }

    // Buggy turn 2: Asks for confirmation without staging!
    return {
      choices: [
        {
          message: {
            role: "assistant",
            content: `I can reschedule your appointment with Dr. Amit Sharma (Dentist) from ${OLD_TIME} to ${NEW_TIME} on ${APPT_DATE}. Would you like me to confirm this change?`,
          },
        },
      ],
    };
  };

  const reply = await askAI(
    `Reschedule my appointment to ${NEW_TIME}`,
    [],
    true,
    CLINIC_ID,
    {
      callerPhone: CALLER_PHONE,
      db,
      chatCompletionFn: buggyLLM,
      confirmationServices: {
        checkAvailability: async () => ({ available: true }),
      },
    }
  );

  // The guardrail intercepts the unstaged reschedule confirmation prompt!
  assert.equal(
    reply.response.includes("Would you like me to confirm this change?"),
    false,
    "Unstaged confirmation question must be blocked"
  );
  assert.match(
    reply.response,
    /unable to stage your appointment reschedule/i,
    "Clear error message returned when staging was not performed"
  );
});

// ============================================================
// TEST 9: Disabled rescheduling returns clear error without staging
// ============================================================

test("Reschedule flow: reschedule_appointment when changes are disabled returns disabled message without staging", async () => {
  const db = createMockDb({
    initialDoctors: [DOCTOR],
    initialPatients: [PATIENT],
    initialAppointments: [
      {
        id: 13,
        clinicId: CLINIC_ID,
        patientId: PATIENT.id,
        doctorId: DOCTOR.id,
        appointmentDate: new Date(`${APPT_DATE}T00:00:00.000Z`),
        startTime: OLD_TIME,
        status: "BOOKED",
      },
    ],
  });
  const actorKey = getActorKey({ clinicId: CLINIC_ID, callerPhone: CALLER_PHONE });

  let callIndex = 0;
  const mockLLM = async () => {
    callIndex++;
    if (callIndex === 1) {
      return {
        choices: [
          {
            message: {
              role: "assistant",
              content: null,
              tool_calls: [
                {
                  id: "call_resched_disabled",
                  type: "function",
                  function: {
                    name: "reschedule_appointment",
                    arguments: JSON.stringify({
                      appointmentId: 13,
                      newDate: APPT_DATE,
                      newTime: NEW_TIME,
                    }),
                  },
                },
              ],
            },
          },
        ],
      };
    }
    return {
      choices: [{ message: { role: "assistant", content: "Sorry, rescheduling is currently disabled." } }],
    };
  };

  const reply = await askAI(
    `Reschedule to ${NEW_TIME}`,
    [],
    false, // allowBooking = false, allowAppointmentChanges = false
    CLINIC_ID,
    {
      callerPhone: CALLER_PHONE,
      db,
      chatCompletionFn: mockLLM,
      allowAppointmentChanges: false,
    }
  );

  // No pending record staged
  const pending = await getPendingConfirmation(actorKey, db);
  assert.equal(pending, null, "No pending record when rescheduling is disabled");
});



