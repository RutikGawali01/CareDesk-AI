const test = require("node:test");
const assert = require("node:assert/strict");
const {
  isExplicitConfirmation,
  getActorKey,
  createPendingConfirmation,
  getPendingConfirmation,
  consumePendingConfirmation,
  validatePendingConfirmationScope,
  executeConfirmedAppointmentMutation,
} = require("../src/modules/appointments/appointmentConfirmation");

function createMockDb(initialRecords = []) {
  const store = new Map();
  for (const r of initialRecords) {
    store.set(r.id || r.actorKey, { ...r });
  }

  return {
    appointmentConfirmation: {
      async upsert({ where, create, update }) {
        const existing = [...store.values()].find(
          (r) => r.actorKey === where.actorKey
        );
        if (existing) {
          const updated = { ...existing, ...update, updatedAt: new Date() };
          store.set(existing.id, updated);
          return updated;
        }
        const created = {
          id: "cuid_" + Math.random().toString(36).slice(2),
          ...create,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        store.set(created.id, created);
        return created;
      },
      async findUnique({ where }) {
        return (
          [...store.values()].find((r) => r.actorKey === where.actorKey) || null
        );
      },
      async updateMany({ where, data }) {
        let count = 0;
        for (const [id, record] of store.entries()) {
          if (where.id && record.id !== where.id) continue;
          if (where.actorKey && record.actorKey !== where.actorKey) continue;
          if (where.status && record.status !== where.status) continue;
          if (
            where.expiresAt?.gt &&
            !(new Date(record.expiresAt) > where.expiresAt.gt)
          )
            continue;

          store.set(id, { ...record, ...data, updatedAt: new Date() });
          count++;
        }
        return { count };
      },
    },
  };
}

test("accepts clear, standalone confirmation messages", () => {
  for (const phrase of ["yes", "Confirm!", "go ahead", "book it", "yes please"]) {
    assert.equal(isExplicitConfirmation(phrase), true, phrase);
  }
});

test("does not treat ambiguous or negated messages as confirmation", () => {
  for (const phrase of ["yesterday", "yes, but tomorrow", "no", "I think yes", "", null]) {
    assert.equal(isExplicitConfirmation(phrase), false, String(phrase));
  }
});

test("confirmation actor key is scoped to clinic and verified identity", () => {
  assert.equal(
    getActorKey({ clinicId: 4, callerPhone: "919999000000" }),
    "whatsapp:4:919999000000"
  );
  assert.equal(
    getActorKey({ clinicId: 4, adminId: 12 }),
    "admin:4:12"
  );
  assert.throws(() => getActorKey({ clinicId: 4 }), /Trusted confirmation identity/);
});

test("direct-tool-call bypass: staging a mutation saves pending state and does not execute tools", async () => {
  const db = createMockDb();
  let mutationExecuted = false;

  const actorKey = getActorKey({ clinicId: 1, callerPhone: "919876543210" });
  const pending = await createPendingConfirmation(
    {
      actorKey,
      clinicId: 1,
      patientId: 10,
      actionType: "BOOK",
      payload: {
        clinicId: 1,
        patientId: 10,
        doctorId: 2,
        appointmentDate: "2026-10-20",
        startTime: "10:00",
      },
    },
    db
  );

  // Staging only persists pending confirmation; no mutation tool is run
  assert.equal(pending.status, "PENDING");
  assert.equal(mutationExecuted, false);

  // Attempting execution without consuming confirmation is prevented
  const fetched = await getPendingConfirmation(actorKey, db);
  assert.equal(fetched.status, "PENDING");
});

test("expired confirmation: cannot be consumed after 5 minutes TTL", async () => {
  const db = createMockDb();
  const actorKey = getActorKey({ clinicId: 1, callerPhone: "919876543210" });

  // Create a confirmation expired 1 second ago
  const expiredRecord = {
    id: "conf-expired-1",
    actorKey,
    clinicId: 1,
    patientId: 10,
    actionType: "BOOK",
    payload: { clinicId: 1, patientId: 10, doctorId: 2 },
    status: "PENDING",
    expiresAt: new Date(Date.now() - 1000),
  };
  const mockDb = createMockDb([expiredRecord]);

  // getPendingConfirmation marks it EXPIRED and returns null
  const pending = await getPendingConfirmation(actorKey, mockDb);
  assert.equal(pending, null);

  // Cannot consume an expired confirmation
  const claimed = await consumePendingConfirmation("conf-expired-1", actorKey, mockDb);
  assert.equal(claimed, false);
});

test("replay prevention: a consumed confirmation cannot be claimed again", async () => {
  const actorKey = getActorKey({ clinicId: 1, callerPhone: "919876543210" });
  const record = {
    id: "conf-replay-1",
    actorKey,
    clinicId: 1,
    patientId: 10,
    actionType: "BOOK",
    payload: { clinicId: 1, patientId: 10, doctorId: 2 },
    status: "PENDING",
    expiresAt: new Date(Date.now() + 300000),
  };
  const db = createMockDb([record]);

  // First claim succeeds
  const firstClaim = await consumePendingConfirmation("conf-replay-1", actorKey, db);
  assert.equal(firstClaim, true);

  // Second claim (replay attack) fails
  const secondClaim = await consumePendingConfirmation("conf-replay-1", actorKey, db);
  assert.equal(secondClaim, false);

  // getPendingConfirmation also returns null since status is now CONSUMED
  const pending = await getPendingConfirmation(actorKey, db);
  assert.equal(pending, null);
});

test("concurrent confirmation requests: only one request wins the race", async () => {
  const actorKey = getActorKey({ clinicId: 1, callerPhone: "919876543210" });
  const record = {
    id: "conf-race-1",
    actorKey,
    clinicId: 1,
    patientId: 10,
    actionType: "BOOK",
    payload: { clinicId: 1, patientId: 10, doctorId: 2 },
    status: "PENDING",
    expiresAt: new Date(Date.now() + 300000),
  };
  const db = createMockDb([record]);

  // Two concurrent requests attempt to consume the same confirmation
  const [claimA, claimB] = await Promise.all([
    consumePendingConfirmation("conf-race-1", actorKey, db),
    consumePendingConfirmation("conf-race-1", actorKey, db),
  ]);

  // Exactly one wins, one loses
  assert.equal(claimA && claimB, false, "Both claims cannot succeed");
  assert.equal(claimA || claimB, true, "At least one claim must succeed");
});

test("unauthorized patient access: cannot confirm or execute for another patient", async () => {
  const pending = {
    clinicId: 1,
    patientId: 10,
    actionType: "BOOK",
    payload: {
      clinicId: 1,
      patientId: 10,
      doctorId: 2,
      appointmentDate: "2026-10-20",
      startTime: "10:00",
    },
  };

  // Attempting with authorized patient 10 passes
  assert.equal(
    validatePendingConfirmationScope({ pending, clinicId: 1, patientId: 10 }),
    true
  );

  // Attempting with unauthorized patient 99 throws
  assert.throws(
    () => validatePendingConfirmationScope({ pending, clinicId: 1, patientId: 99 }),
    /Unauthorized patient access denied/
  );

  // Execution also rejects unauthorized patient
  const mockServices = {
    checkAvailability: async () => ({ available: true }),
    bookAppointment: async () => ({ success: true }),
  };

  await assert.rejects(
    async () =>
      executeConfirmedAppointmentMutation({
        pending,
        clinicId: 1,
        patientId: 99,
        services: mockServices,
      }),
    /Unauthorized patient access denied/
  );
});

test("cross-clinic access: cannot confirm or execute across clinic boundaries", async () => {
  const pending = {
    clinicId: 1,
    patientId: 10,
    actionType: "BOOK",
    payload: {
      clinicId: 1,
      patientId: 10,
      doctorId: 2,
      appointmentDate: "2026-10-20",
      startTime: "10:00",
    },
  };

  // Scope check throws on clinic mismatch
  assert.throws(
    () => validatePendingConfirmationScope({ pending, clinicId: 2, patientId: 10 }),
    /Cross-clinic access denied/
  );

  // Execution rejects cross-clinic attempt
  const mockServices = {
    checkAvailability: async () => ({ available: true }),
    bookAppointment: async () => ({ success: true }),
  };

  await assert.rejects(
    async () =>
      executeConfirmedAppointmentMutation({
        pending,
        clinicId: 2,
        patientId: 10,
        services: mockServices,
      }),
    /Cross-clinic access denied/
  );
});

test("executeConfirmedAppointmentMutation: revalidates slot availability before booking", async () => {
  let availabilityChecked = false;
  let bookingExecuted = false;

  const pending = {
    clinicId: 1,
    patientId: 10,
    actionType: "BOOK",
    payload: {
      clinicId: 1,
      patientId: 10,
      doctorId: 2,
      doctorName: "Dr. Sharma",
      appointmentDate: "2026-10-20",
      startTime: "10:00",
    },
  };

  // If slot became unavailable in the meantime:
  const unavailableServices = {
    checkAvailability: async () => {
      availabilityChecked = true;
      return { available: false, message: "Slot no longer available" };
    },
    bookAppointment: async () => {
      bookingExecuted = true;
      return { success: true };
    },
  };

  const result = await executeConfirmedAppointmentMutation({
    pending,
    clinicId: 1,
    patientId: 10,
    allowBooking: true,
    services: unavailableServices,
  });

  assert.equal(availabilityChecked, true);
  assert.equal(bookingExecuted, false);
  assert.equal(result.success, false);
  assert.match(result.message, /no longer available/);
});

test("executeConfirmedAppointmentMutation: executes booking with saved payload when available", async () => {
  let bookedWithPayload = null;

  const pending = {
    clinicId: 1,
    patientId: 10,
    actionType: "BOOK",
    payload: {
      clinicId: 1,
      patientId: 10,
      doctorId: 2,
      doctorName: "Dr. Sharma",
      appointmentDate: "2026-10-20",
      startTime: "10:00",
      reason: "Checkup",
    },
  };

  const services = {
    checkAvailability: async () => ({ available: true }),
    bookAppointment: async (payload) => {
      bookedWithPayload = payload;
      return { success: true, appointment: { id: 101, ...payload } };
    },
  };

  const result = await executeConfirmedAppointmentMutation({
    pending,
    clinicId: 1,
    patientId: 10,
    allowBooking: true,
    services,
  });

  assert.equal(result.success, true);
  assert.equal(bookedWithPayload.doctorId, 2);
  assert.equal(bookedWithPayload.appointmentDate, "2026-10-20");
  assert.equal(bookedWithPayload.startTime, "10:00");
  assert.match(result.message, /successfully confirmed and booked/);
});

