const test = require("node:test");
const assert = require("node:assert/strict");

const { askAI } = require("../src/modules/ai/aiService");
const {
  getActorKey,
  createPendingConfirmation,
} = require("../src/modules/appointments/appointmentConfirmation");
const {
  handleIncomingWebhook,
  conversations,
  conversationQueues,
  enqueueConversation,
} = require("../src/modules/whatsapp/whatsappService");

// In-memory mock database factory
function createMockDb() {
  const confirmations = new Map();
  const processedMessages = new Map();
  const patients = new Map();
  const doctors = new Map();
  const appointments = new Map();

  return {
    _stores: { confirmations, processedMessages, patients, doctors, appointments },

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
          [...confirmations.values()].find((r) => r.actorKey === where.actorKey) ||
          null
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

    whatsAppProcessedMessage: {
      async create({ data }) {
        if (processedMessages.has(data.messageId)) {
          const err = new Error("Unique constraint failed");
          err.code = "P2002";
          throw err;
        }
        const record = { ...data, createdAt: new Date() };
        processedMessages.set(data.messageId, record);
        return record;
      },
      async update({ where, data }) {
        const existing = processedMessages.get(where.messageId);
        if (!existing) {
          throw new Error("Record to update not found");
        }
        const updated = { ...existing, ...data, updatedAt: new Date() };
        processedMessages.set(where.messageId, updated);
        return updated;
      },
      async findUnique({ where }) {
        return processedMessages.get(where.messageId) || null;
      },
    },

    patient: {
      async findFirst({ where }) {
        for (const p of patients.values()) {
          if (where.clinicId && p.clinicId !== where.clinicId) continue;
          if (where.phone && p.phone !== where.phone) continue;
          if (where.id && p.id !== where.id) continue;
          return p;
        }
        return null;
      },
    },

    doctor: {
      async findFirst({ where }) {
        for (const d of doctors.values()) {
          if (where.clinicId && d.clinicId !== where.clinicId) continue;
          if (where.id && d.id !== where.id) continue;
          return d;
        }
        return null;
      },
    },

    appointment: {
      async findFirst({ where }) {
        for (const a of appointments.values()) {
          if (where.clinicId && a.clinicId !== where.clinicId) continue;
          if (where.id && a.id !== where.id) continue;
          return a;
        }
        return null;
      },
    },
  };
}

// Helper to create Meta webhook payload
function createMetaWebhookPayload({
  phoneNumberId = "100001",
  from = "919876543210",
  messageId = "wamid.test_" + Math.random().toString(36).slice(2),
  text = "yes",
} = {}) {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "entry_1",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: {
                display_phone_number: "1555000",
                phone_number_id: phoneNumberId,
              },
              messages: [
                {
                  from,
                  id: messageId,
                  timestamp: String(Math.floor(Date.now() / 1000)),
                  text: { body: text },
                  type: "text",
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

// Set up clinic map and feature flags in env for testing
process.env.AI_BOOKING_ENABLED = "true";
process.env.WHATSAPP_CLINIC_MAP = JSON.stringify({
  "100001": 1,
  "100002": 2,
});

test("Regression: standalone confirmation executes booking and never calls LLM loop", async () => {
  const db = createMockDb();
  const actorKey = getActorKey({ clinicId: 1, callerPhone: "919876543210" });

  // Stage a pending booking
  await createPendingConfirmation(
    {
      actorKey,
      clinicId: 1,
      patientId: 42,
      actionType: "BOOK",
      payload: {
        clinicId: 1,
        patientId: 42,
        doctorId: 5,
        doctorName: "Sharma",
        appointmentDate: "2026-10-25",
        startTime: "10:00",
      },
    },
    db
  );

  let llmCallCount = 0;
  const mockChatCompletion = async () => {
    llmCallCount++;
    return {
      choices: [
        {
          message: {
            content: "STALE PROMPT: Would you like me to book your appointment?",
          },
        },
      ],
    };
  };

  let bookedPayload = null;
  const mockConfirmationServices = {
    checkAvailability: async () => ({ available: true }),
    bookAppointment: async (payload) => {
      bookedPayload = payload;
      return { success: true, appointment: { id: 101, ...payload } };
    },
  };

  const reply = await askAI("yes", [], true, 1, {
    callerPhone: "919876543210",
    db,
    chatCompletionFn: mockChatCompletion,
    confirmationServices: mockConfirmationServices,
  });

  // Verify booking was executed with saved payload
  assert.equal(bookedPayload?.doctorId, 5);
  assert.equal(bookedPayload?.appointmentDate, "2026-10-25");
  assert.equal(bookedPayload?.startTime, "10:00");

  // Verify response is final booking confirmation
  assert.match(reply.response, /successfully confirmed and booked/i);

  // CRITICAL: LLM was never called; no fall-through into prompt generation
  assert.equal(llmCallCount, 0, "LLM must not be called on standalone confirmation");

  // Verify messages history ends with assistant confirmation
  const lastMsg = reply.messages[reply.messages.length - 1];
  assert.equal(lastMsg.role, "assistant");
  assert.equal(lastMsg.content, reply.response);
});

test("Regression: repeated confirmation returns clear notice and does not create another appointment or call LLM", async () => {
  const db = createMockDb();
  const actorKey = getActorKey({ clinicId: 1, callerPhone: "919876543210" });

  // Pre-seed a CONSUMED confirmation
  await db.appointmentConfirmation.upsert({
    where: { actorKey },
    create: {
      actorKey,
      clinicId: 1,
      patientId: 42,
      actionType: "BOOK",
      payload: { clinicId: 1, patientId: 42, doctorId: 5 },
      status: "CONSUMED",
      expiresAt: new Date(Date.now() + 300000),
    },
    update: {},
  });

  let llmCallCount = 0;
  let bookCallCount = 0;
  const mockChatCompletion = async () => {
    llmCallCount++;
    return { choices: [{ message: { content: "stale" } }] };
  };
  const mockConfirmationServices = {
    checkAvailability: async () => ({ available: true }),
    bookAppointment: async () => {
      bookCallCount++;
      return { success: true };
    },
  };

  const reply = await askAI("yes", [], true, 1, {
    callerPhone: "919876543210",
    db,
    chatCompletionFn: mockChatCompletion,
    confirmationServices: mockConfirmationServices,
  });

  assert.equal(
    reply.response,
    "This appointment confirmation has already been processed."
  );
  assert.equal(llmCallCount, 0, "LLM must not be called on repeated confirmation");
  assert.equal(bookCallCount, 0, "Booking tool must not be called on repeated confirmation");
});

test("Regression: standalone confirmation with no pending state returns helpful message without calling LLM", async () => {
  const db = createMockDb();

  let llmCallCount = 0;
  const mockChatCompletion = async () => {
    llmCallCount++;
    return { choices: [{ message: { content: "stale" } }] };
  };

  const reply = await askAI("confirm", [], true, 1, {
    callerPhone: "919876543210",
    db,
    chatCompletionFn: mockChatCompletion,
  });

  assert.equal(
    reply.response,
    "There is no pending appointment awaiting confirmation. How can I help you today?"
  );
  assert.equal(llmCallCount, 0, "LLM must not be called when no confirmation is pending");
});

test("Regression: expired confirmation returns expiration notice and does not call LLM", async () => {
  const db = createMockDb();
  const actorKey = getActorKey({ clinicId: 1, callerPhone: "919876543210" });

  // Pre-seed an EXPIRED record
  await db.appointmentConfirmation.upsert({
    where: { actorKey },
    create: {
      actorKey,
      clinicId: 1,
      patientId: 42,
      actionType: "BOOK",
      payload: { clinicId: 1, patientId: 42, doctorId: 5 },
      status: "EXPIRED",
      expiresAt: new Date(Date.now() - 10000),
    },
    update: {},
  });

  let llmCallCount = 0;
  const mockChatCompletion = async () => {
    llmCallCount++;
    return { choices: [{ message: { content: "stale" } }] };
  };

  const reply = await askAI("yes", [], true, 1, {
    callerPhone: "919876543210",
    db,
    chatCompletionFn: mockChatCompletion,
  });

  assert.match(reply.response, /confirmation window has expired/i);
  assert.equal(llmCallCount, 0, "LLM must not be called on expired confirmation");
});

test("Regression: unauthenticated confirmation requires trusted identity and does not call LLM", async () => {
  const db = createMockDb();
  let llmCallCount = 0;
  const mockChatCompletion = async () => {
    llmCallCount++;
    return { choices: [{ message: { content: "stale" } }] };
  };

  const reply = await askAI("yes", [], true, 1, {
    db,
    chatCompletionFn: mockChatCompletion,
  });

  assert.match(reply.response, /trusted confirmation identity is required/i);
  assert.equal(llmCallCount, 0);
});

test("Regression: overlapping WhatsApp webhook delivery serialization prevents stale booking prompt", async () => {
  const db = createMockDb();
  const sender = "919876543210";
  const conversationKey = `1:${sender}`;

  // Clear in-memory conversation state for this sender
  conversations.delete(conversationKey);

  const sentTexts = [];
  const mockSendText = async (to, text) => {
    sentTexts.push({ to, text, timestamp: Date.now() });
  };

  // Mock askAI behavior for two sequential turns:
  // Turn 1: Staging a booking (takes 40ms to simulate LLM/tool execution)
  // Turn 2: User says "yes", confirming the booking (fast)
  const mockAskAI = async (userMessage, history, allowBooking, clinicId, options) => {
    if (userMessage.includes("Book Dr Sharma")) {
      // Simulate staging delay
      await new Promise((resolve) => setTimeout(resolve, 40));

      const actorKey = getActorKey({ clinicId, callerPhone: options.callerPhone });
      await createPendingConfirmation(
        {
          actorKey,
          clinicId,
          patientId: 10,
          actionType: "BOOK",
          payload: {
            clinicId,
            patientId: 10,
            doctorId: 2,
            doctorName: "Sharma",
            appointmentDate: "2026-10-22",
            startTime: "11:00",
          },
        },
        db
      );

      const promptMsg =
        "Would you like me to book your appointment with Dr. Sharma for 2026-10-22 at 11:00 AM?";
      return {
        response: promptMsg,
        messages: [
          ...history,
          { role: "user", content: userMessage },
          { role: "assistant", content: promptMsg },
        ],
      };
    }

    if (userMessage.trim().toLowerCase() === "yes") {
      // Forward to askAI with our mock DB and services
      return askAI(userMessage, history, allowBooking, clinicId, {
        ...options,
        db,
        confirmationServices: {
          checkAvailability: async () => ({ available: true }),
          bookAppointment: async () => ({
            success: true,
            appointment: { id: 999 },
          }),
        },
      });
    }

    throw new Error(`Unexpected userMessage: ${userMessage}`);
  };

  // Turn 1 arrives
  const p1 = handleIncomingWebhook(
    createMetaWebhookPayload({
      phoneNumberId: "100001",
      from: sender,
      messageId: "msg-turn-1",
      text: "Book Dr Sharma for 2026-10-22 11:00",
    }),
    { db, sendText: mockSendText, askAIFn: mockAskAI }
  );

  // Turn 2 ("yes") arrives 5ms later while Turn 1 is still processing!
  await new Promise((resolve) => setTimeout(resolve, 5));

  const p2 = handleIncomingWebhook(
    createMetaWebhookPayload({
      phoneNumberId: "100001",
      from: sender,
      messageId: "msg-turn-2",
      text: "yes",
    }),
    { db, sendText: mockSendText, askAIFn: mockAskAI }
  );

  // Wait for both concurrent webhooks to complete
  await Promise.all([p1, p2]);

  // CRITICAL ASSERTIONS:
  // 1. Two replies were sent
  assert.equal(sentTexts.length, 2, "Expected exactly 2 replies sent to patient");

  // 2. The replies were sent in strict order: Prompt FIRST, Confirmation success SECOND!
  assert.match(
    sentTexts[0].text,
    /Would you like me to book your appointment with Dr\. Sharma/i,
    "First message must be the booking prompt"
  );
  assert.match(
    sentTexts[1].text,
    /successfully confirmed and booked/i,
    "Second message must be the booking confirmation success"
  );

  // 3. Stale prompt was NOT sent after confirmation success
  assert.equal(
    sentTexts[1].text.includes("Would you like me to book"),
    false,
    "Stale prompt must not appear after confirmation"
  );

  // 4. Conversation history in memory contains both turns without corruption
  const finalHistory = conversations.get(conversationKey);
  assert.ok(finalHistory);
  const lastHistoryMsg = finalHistory[finalHistory.length - 1];
  assert.equal(lastHistoryMsg.role, "assistant");
  assert.match(lastHistoryMsg.content, /successfully confirmed and booked/i);

  // 5. If user sends a third "yes", it receives "already been processed"
  let thirdReplyText = null;
  const p3 = handleIncomingWebhook(
    createMetaWebhookPayload({
      phoneNumberId: "100001",
      from: sender,
      messageId: "msg-turn-3",
      text: "yes",
    }),
    {
      db,
      sendText: async (to, text) => {
        thirdReplyText = text;
      },
      askAIFn: mockAskAI,
    }
  );
  await p3;

  assert.equal(
    thirdReplyText,
    "This appointment confirmation has already been processed."
  );
});

test("Regression: Meta duplicate message delivery is ignored via DB deduplication", async () => {
  const db = createMockDb();
  let aiCallCount = 0;

  const mockAskAI = async () => {
    aiCallCount++;
    return { response: "Hello", messages: [] };
  };

  const payload = createMetaWebhookPayload({
    phoneNumberId: "100001",
    from: "919876543210",
    messageId: "duplicate-msg-id-123",
    text: "Hello",
  });

  // First delivery succeeds
  await handleIncomingWebhook(payload, {
    db,
    sendText: async () => {},
    askAIFn: mockAskAI,
  });
  assert.equal(aiCallCount, 1);

  // Second delivery with identical messageId is ignored
  await handleIncomingWebhook(payload, {
    db,
    sendText: async () => {},
    askAIFn: mockAskAI,
  });
  assert.equal(aiCallCount, 1, "Duplicate messageId must not trigger AI processing");
});

test("Independent queue execution for different senders", async () => {
  const db = createMockDb();
  const order = [];

  const payloadA = createMetaWebhookPayload({
    phoneNumberId: "100001",
    from: "911111111111",
    messageId: "msg-sender-a",
    text: "Sender A",
  });

  const payloadB = createMetaWebhookPayload({
    phoneNumberId: "100001",
    from: "912222222222",
    messageId: "msg-sender-b",
    text: "Sender B",
  });

  const mockAskAI = async (text) => {
    order.push(`start:${text}`);
    if (text === "Sender A") {
      await new Promise((r) => setTimeout(r, 20));
    } else {
      await new Promise((r) => setTimeout(r, 5));
    }
    order.push(`end:${text}`);
    return { response: `Reply to ${text}`, messages: [] };
  };

  await Promise.all([
    handleIncomingWebhook(payloadA, {
      db,
      sendText: async () => {},
      askAIFn: mockAskAI,
    }),
    handleIncomingWebhook(payloadB, {
      db,
      sendText: async () => {},
      askAIFn: mockAskAI,
    }),
  ]);

  // Sender B started and finished while Sender A was running, proving parallel handling across different senders
  assert.ok(order.indexOf("end:Sender B") < order.indexOf("end:Sender A"));
});

test.after(async () => {
  const prisma = require("../src/db");
  await prisma.$disconnect();
});
