const test = require("node:test");
const assert = require("node:assert/strict");

const {
  sendWhatsAppText,
  handleIncomingWebhook,
  failedOutboundReplies,
  recordFailedOutbound,
  getFailedOutbound,
  clearFailedOutbound,
  retryFailedOutboundMessage,
} = require("../src/modules/whatsapp/whatsappService");

const {
  retryFailedDeliveryController,
} = require("../src/modules/whatsapp/whatsappController");

function createMockDb() {
  const processed = new Map();
  return {
    whatsAppProcessedMessage: {
      async create({ data }) {
        if (processed.has(data.messageId)) {
          const err = new Error("Unique constraint failed");
          err.code = "P2002";
          throw err;
        }
        const record = { ...data, createdAt: new Date(), updatedAt: new Date() };
        processed.set(data.messageId, record);
        return record;
      },
      async update({ where, data }) {
        const existing = processed.get(where.messageId);
        if (!existing) throw new Error("Record not found");
        const updated = { ...existing, ...data, updatedAt: new Date() };
        processed.set(where.messageId, updated);
        return updated;
      },
      async findUnique({ where }) {
        return processed.get(where.messageId) || null;
      },
    },
    _store: processed,
  };
}

// Reset env and stores before tests
function setupEnv() {
  process.env.WHATSAPP_CLINIC_MAP = JSON.stringify({ "phone-id-1": 1 });
  process.env.WHATSAPP_ACCESS_TOKEN = "test-token";
  clearFailedOutbound();
}

test("sendWhatsAppText reports failure when credentials are missing", async () => {
  const origToken = process.env.WHATSAPP_ACCESS_TOKEN;
  delete process.env.WHATSAPP_ACCESS_TOKEN;

  const result = await sendWhatsAppText("919876543210", "Hello", "phone-id-1");
  assert.equal(result.success, false);
  assert.match(result.error, /Missing API credentials/);

  process.env.WHATSAPP_ACCESS_TOKEN = origToken;
});

test("sendWhatsAppText reports success when Graph API returns 200 OK", async () => {
  setupEnv();
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      messaging_product: "whatsapp",
      contacts: [{ input: "919876543210", wa_id: "919876543210" }],
      messages: [{ id: "wamid.HBgL" }],
    }),
  });

  try {
    const result = await sendWhatsAppText("919876543210", "Confirmed", "phone-id-1");
    assert.equal(result.success, true);
    assert.equal(result.messageId, "wamid.HBgL");
  } finally {
    global.fetch = originalFetch;
  }
});

test("sendWhatsAppText reports failure when Graph API returns error response", async () => {
  setupEnv();
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: false,
    status: 400,
    json: async () => ({
      error: {
        message: "(#131030) Recipient phone number not in allowed list",
        type: "OAuthException",
        code: 131030,
      },
    }),
  });

  try {
    const result = await sendWhatsAppText("919876543210", "Confirmed", "phone-id-1");
    assert.equal(result.success, false);
    assert.match(result.error, /Recipient phone number not in allowed list/);
  } finally {
    global.fetch = originalFetch;
  }
});

test("successful delivery: marks message PROCESSED and does not record failed reply", async () => {
  setupEnv();
  const db = createMockDb();
  let aiCallCount = 0;
  let sentMessages = [];

  const payload = {
    object: "whatsapp_business_account",
    entry: [
      {
        changes: [
          {
            field: "messages",
            value: {
              metadata: { phone_number_id: "phone-id-1" },
              messages: [
                {
                  id: "msg-delivery-success-1",
                  from: "919876543210",
                  type: "text",
                  text: { body: "Hello" },
                },
              ],
            },
          },
        ],
      },
    ],
  };

  const mockAskAI = async () => {
    aiCallCount++;
    return { response: "Hello, how can I help you?", messages: [] };
  };

  const mockSendText = async (to, text, phoneId) => {
    sentMessages.push({ to, text, phoneId });
    return { success: true, messageId: "meta-out-1" };
  };

  await handleIncomingWebhook(payload, {
    db,
    askAIFn: mockAskAI,
    sendText: mockSendText,
  });

  assert.equal(aiCallCount, 1);
  assert.equal(sentMessages.length, 1);
  assert.equal(getFailedOutbound("msg-delivery-success-1"), null);

  const dbRecord = await db.whatsAppProcessedMessage.findUnique({
    where: { messageId: "msg-delivery-success-1" },
  });
  assert.equal(dbRecord.status, "PROCESSED");
});

test("failed delivery: marks message DELIVERY_FAILED and records outbound reply for retry", async () => {
  setupEnv();
  const db = createMockDb();
  let aiCallCount = 0;

  const payload = {
    object: "whatsapp_business_account",
    entry: [
      {
        changes: [
          {
            field: "messages",
            value: {
              metadata: { phone_number_id: "phone-id-1" },
              messages: [
                {
                  id: "msg-delivery-fail-1",
                  from: "919876543210",
                  type: "text",
                  text: { body: "Confirm booking" },
                },
              ],
            },
          },
        ],
      },
    ],
  };

  const mockAskAI = async () => {
    aiCallCount++;
    return {
      response: "Your appointment has been successfully confirmed and booked.",
      messages: [],
    };
  };

  const mockSendText = async () => {
    return { success: false, error: "Network timeout connecting to Meta Graph API" };
  };

  await handleIncomingWebhook(payload, {
    db,
    askAIFn: mockAskAI,
    sendText: mockSendText,
  });

  assert.equal(aiCallCount, 1);

  // Status must be DELIVERY_FAILED, NOT PROCESSED
  const dbRecord = await db.whatsAppProcessedMessage.findUnique({
    where: { messageId: "msg-delivery-fail-1" },
  });
  assert.equal(dbRecord.status, "DELIVERY_FAILED");

  // Outbound reply must be recorded for safe retry
  const failed = getFailedOutbound("msg-delivery-fail-1");
  assert.ok(failed);
  assert.equal(failed.sender, "919876543210");
  assert.equal(
    failed.message,
    "Your appointment has been successfully confirmed and booked."
  );
  assert.match(failed.error, /Network timeout/);
});

test("Meta retry safety: duplicate webhook delivery retries outbound send WITHOUT repeating AI mutations", async () => {
  setupEnv();
  const db = createMockDb();
  let aiCallCount = 0;
  let sendAttempts = [];

  const payload = {
    object: "whatsapp_business_account",
    entry: [
      {
        changes: [
          {
            field: "messages",
            value: {
              metadata: { phone_number_id: "phone-id-1" },
              messages: [
                {
                  id: "msg-meta-retry-1",
                  from: "919876543210",
                  type: "text",
                  text: { body: "yes" },
                },
              ],
            },
          },
        ],
      },
    ],
  };

  const mockAskAI = async () => {
    aiCallCount++;
    return {
      response: "Appointment booked for Dr. Sharma on 2026-10-25 at 12:00.",
      messages: [],
    };
  };

  let firstAttempt = true;
  const mockSendText = async (to, text, phoneId) => {
    sendAttempts.push({ to, text });
    if (firstAttempt) {
      firstAttempt = false;
      return { success: false, error: "Meta Graph 503 Service Unavailable" };
    }
    return { success: true, messageId: "meta-retry-success-id" };
  };

  // First webhook delivery from Meta: AI runs, but outbound delivery fails
  await handleIncomingWebhook(payload, {
    db,
    askAIFn: mockAskAI,
    sendText: mockSendText,
  });

  assert.equal(aiCallCount, 1, "AI must run on initial delivery");
  assert.equal(sendAttempts.length, 1);

  const initialRecord = await db.whatsAppProcessedMessage.findUnique({
    where: { messageId: "msg-meta-retry-1" },
  });
  assert.equal(initialRecord.status, "DELIVERY_FAILED");

  // Meta retries the webhook delivery with the exact same message ID
  await handleIncomingWebhook(payload, {
    db,
    askAIFn: mockAskAI,
    sendText: mockSendText,
  });

  // CRITICAL GUARANTEE: AI must NOT be invoked again on Meta retry!
  assert.equal(aiCallCount, 1, "AI must NEVER be re-executed on Meta webhook retry!");
  assert.equal(sendAttempts.length, 2, "Outbound message must be retried");
  assert.equal(
    sendAttempts[1].text,
    "Appointment booked for Dr. Sharma on 2026-10-25 at 12:00."
  );

  // After successful retry, DB status becomes PROCESSED and record is cleared
  const updatedRecord = await db.whatsAppProcessedMessage.findUnique({
    where: { messageId: "msg-meta-retry-1" },
  });
  assert.equal(updatedRecord.status, "PROCESSED");
  assert.equal(getFailedOutbound("msg-meta-retry-1"), null);
});

test("programmatic & controller retry: retryFailedOutboundMessage and retryFailedDeliveryController", async () => {
  setupEnv();
  const db = createMockDb();

  // Seed a failed outbound reply
  recordFailedOutbound("msg-controller-retry-1", {
    sender: "919876543210",
    message: "Rescheduled to 19:00",
    phoneNumberId: "phone-id-1",
    error: "Initial network error",
  });
  await db.whatsAppProcessedMessage.create({
    data: { messageId: "msg-controller-retry-1", status: "DELIVERY_FAILED" },
  });

  // Test retryFailedOutboundMessage with simulated sendText
  let sentPayload = null;
  const mockSendText = async (to, text, phoneId) => {
    sentPayload = { to, text, phoneId };
    return { success: true, messageId: "meta-manual-id" };
  };

  const retryResult = await retryFailedOutboundMessage("msg-controller-retry-1", {
    db,
    sendText: mockSendText,
  });

  assert.equal(retryResult.success, true);
  assert.equal(sentPayload.to, "919876543210");
  assert.equal(sentPayload.text, "Rescheduled to 19:00");

  const dbRecord = await db.whatsAppProcessedMessage.findUnique({
    where: { messageId: "msg-controller-retry-1" },
  });
  assert.equal(dbRecord.status, "PROCESSED");

  // Controller returns 400 when messageId missing
  let resStatus = null;
  let resJson = null;
  const mockRes = {
    status(s) {
      resStatus = s;
      return this;
    },
    json(j) {
      resJson = j;
      return this;
    },
  };

  await retryFailedDeliveryController({ body: {} }, mockRes);
  assert.equal(resStatus, 400);

  // Controller returns 404 when message not found in failed store
  await retryFailedDeliveryController({ body: { messageId: "non-existent" } }, mockRes);
  assert.equal(resStatus, 404);
});
