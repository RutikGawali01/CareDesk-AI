/**
 * WhatsApp Webhook Service
 *
 * Handles verification and incoming message processing for Meta's WhatsApp webhook.
 * WHATSAPP_VERIFY_TOKEN must be set in .env
 */

/**
 * Verifies the webhook subscription request from Meta.
 * @param {string} mode - hub.mode from query params
 * @param {string} token - hub.verify_token from query params
 * @param {string} challenge - hub.challenge from query params
 * @returns {{ status: number, body: string|number }}
 */

/**
 * WhatsApp Webhook Service
 */

require("dotenv").config();

const { askAI } = require("../ai/aiService");
const prisma = require("../../db");

function getClinicIdForPhoneNumber(phoneNumberId) {
  try {
    const mapping = JSON.parse(process.env.WHATSAPP_CLINIC_MAP || "{}");
    const clinicId = Number(mapping[phoneNumberId]);
    return Number.isInteger(clinicId) && clinicId > 0 ? clinicId : null;
  } catch {
    console.error("[WhatsApp] WHATSAPP_CLINIC_MAP must be valid JSON.");
    return null;
  }
}

// Temporary conversation history for local testing.
// Messages are lost when the server restarts.
const conversations = new Map();

// Per-conversation queue ensures sequential processing of messages from the same sender.
// Overlapping webhook deliveries cannot interleave or read stale conversation history.
const conversationQueues = new Map();

function enqueueConversation(conversationKey, task) {
  const previous = conversationQueues.get(conversationKey) || Promise.resolve();
  const next = previous
    .catch((err) => {
      console.error(
        `[WhatsApp] Error in previous task for ${conversationKey}:`,
        err?.message
      );
    })
    .then(task);

  conversationQueues.set(conversationKey, next);

  next.finally(() => {
    if (conversationQueues.get(conversationKey) === next) {
      conversationQueues.delete(conversationKey);
    }
  });

  return next;
}

const verifyWebhook = (mode, token, challenge) => {
  if (
    mode === "subscribe" &&
    token === process.env.WHATSAPP_VERIFY_TOKEN
  ) {
    console.log("[WhatsApp] Webhook verified.");
    return { status: 200, body: challenge };
  }

  return { status: 403, body: "Forbidden" };
};

const sendWhatsAppText = async (to, message, phoneNumberId) => {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;

  if (!accessToken || !phoneNumberId) {
    console.error("[WhatsApp] Missing API credentials.");
    return {
      success: false,
      error: "Missing API credentials (WHATSAPP_ACCESS_TOKEN or phoneNumberId).",
    };
  }

  try {
    const response = await fetch(
      `https://graph.facebook.com/v26.0/${phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to,
          type: "text",
          text: { body: message },
        }),
      }
    );

    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      console.error("[WhatsApp] Send failed:", result);
      return {
        success: false,
        error: result?.error?.message || `HTTP ${response.status}: WhatsApp send failed.`,
        data: result,
      };
    }

    console.log("[WhatsApp] Reply sent successfully.");
    return {
      success: true,
      messageId: result?.messages?.[0]?.id || null,
      data: result,
    };
  } catch (error) {
    console.error("[WhatsApp] API request failed:", error.message);
    return {
      success: false,
      error: error.message || "Failed to send WhatsApp message.",
    };
  }
};

// Map of failed outbound messages keyed by incoming Meta message ID.
// Stores: { sender, message, phoneNumberId, error, attempts, firstFailedAt, lastAttemptAt }
const failedOutboundReplies = new Map();

function recordFailedOutbound(messageId, details) {
  const existing = failedOutboundReplies.get(messageId);
  failedOutboundReplies.set(messageId, {
    sender: details.sender,
    message: details.message,
    phoneNumberId: details.phoneNumberId,
    error: details.error || "Delivery failed",
    attempts: (existing?.attempts || 0) + 1,
    firstFailedAt: existing?.firstFailedAt || new Date(),
    lastAttemptAt: new Date(),
  });
}

function getFailedOutbound(messageId) {
  return failedOutboundReplies.get(messageId) || null;
}

function clearFailedOutbound(messageId) {
  if (messageId) {
    failedOutboundReplies.delete(messageId);
  } else {
    failedOutboundReplies.clear();
  }
}

async function retryFailedOutboundMessage(
  messageId,
  { db = prisma, sendText = sendWhatsAppText } = {}
) {
  const failed = getFailedOutbound(messageId);
  if (!failed) {
    return {
      success: false,
      error: `No recorded failed outbound reply found for message ID: ${messageId}`,
    };
  }

  try {
    const sendResult = await sendText(
      failed.sender,
      failed.message,
      failed.phoneNumberId
    );

    const deliverySuccess = sendResult ? sendResult.success !== false : true;

    if (deliverySuccess) {
      failedOutboundReplies.delete(messageId);
      try {
        await db.whatsAppProcessedMessage.update({
          where: { messageId },
          data: { status: "PROCESSED" },
        });
      } catch (dbErr) {
        console.error(
          "[WhatsApp] Could not update message status after retry:",
          dbErr.message
        );
      }
      return {
        success: true,
        messageId,
        data: sendResult?.data,
      };
    } else {
      failed.attempts += 1;
      failed.lastAttemptAt = new Date();
      failed.error = sendResult?.error || "Retry delivery failed";
      return {
        success: false,
        error: failed.error,
      };
    }
  } catch (err) {
    failed.attempts += 1;
    failed.lastAttemptAt = new Date();
    failed.error = err.message;
    return {
      success: false,
      error: err.message,
    };
  }
}

const handleIncomingWebhook = async (
  payload,
  {
    db = prisma,
    sendText = sendWhatsAppText,
    askAIFn = askAI,
    aiOptions = {},
  } = {}
) => {
  if (payload?.object !== "whatsapp_business_account") return;

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "messages") continue;

      const value = change.value ?? {};

      // Resolve the tenant from trusted server-side configuration.
      const phoneNumberId = value.metadata?.phone_number_id;
      const clinicId = getClinicIdForPhoneNumber(phoneNumberId);

      if (!clinicId) {
        console.warn("[WhatsApp] Ignoring an unconfigured phone number ID.");
        continue;
      }

      for (const message of value.messages ?? []) {
        if (message.type !== "text" || !message.from || !message.id) continue;

        const sender = message.from;
        const userMessage = message.text?.body?.trim();

        if (!userMessage) continue;

        console.log(`[WhatsApp] Incoming text from ${sender}`);

        // Claim each Meta message ID once. The database primary key prevents
        // duplicate processing across retries, restarts, and server instances.
        try {
          await db.whatsAppProcessedMessage.create({
            data: { messageId: message.id, status: "PROCESSING" },
          });
        } catch (error) {
          if (error?.code === "P2002") {
            const failedRecord = getFailedOutbound(message.id);
            if (failedRecord) {
              console.log(
                `[WhatsApp] Meta retry received for message ${message.id} with failed outbound delivery. Retrying reply without re-executing AI...`
              );
              const conversationKey = `${clinicId}:${sender}`;
              await enqueueConversation(conversationKey, async () => {
                await retryFailedOutboundMessage(message.id, { db, sendText });
              });
            } else {
              console.log("[WhatsApp] Ignoring duplicate message ID.");
            }
            continue;
          }
          throw error;
        }

        // Scope conversation history to both tenant and sender. A patient
        // messaging two hospital numbers must never share context across clinics.
        const conversationKey = `${clinicId}:${sender}`;

        // Serialize message execution per conversation to prevent overlapping
        // deliveries from reading stale conversation state or sending out-of-order prompts.
        await enqueueConversation(conversationKey, async () => {
          const history = conversations.get(conversationKey) ?? [];

          try {
            const reply = await askAIFn(
              userMessage,
              history,
              process.env.AI_BOOKING_ENABLED === "true",
              clinicId,
              {
                callerPhone: sender,
                preserveToolHistory: true,
                allowAppointmentChanges:
                  process.env.AI_APPOINTMENT_CHANGES_ENABLED === "true",
                ...aiOptions,
              }
            );

            const assistantMessage =
              typeof reply === "string"
                ? reply
                : reply?.response;
            if (!assistantMessage) {
              throw new Error("AI returned no readable reply.");
            }

            // Persist the full server-generated tool-call/tool-result history.
            // Avoid duplicate assistant messages and cap history to 20 messages.
            const rawMessages = (reply.messages ?? []).filter(
              (item) => item.role !== "system"
            );
            const lastMsg = rawMessages[rawMessages.length - 1];
            const updatedHistory =
              lastMsg &&
              lastMsg.role === "assistant" &&
              lastMsg.content === assistantMessage
                ? rawMessages
                : [
                    ...rawMessages,
                    { role: "assistant", content: assistantMessage },
                  ];

            conversations.set(conversationKey, updatedHistory.slice(-20));

            // Send outbound reply. If delivery fails, mark DELIVERY_FAILED and record the reply.
            // Meta retries or manual retries can deliver the message safely without repeating mutations.
            let sendResult;
            try {
              sendResult = await sendText(sender, assistantMessage, phoneNumberId);
            } catch (sendErr) {
              sendResult = { success: false, error: sendErr.message };
            }

            const deliverySuccess = sendResult ? sendResult.success !== false : true;

            if (deliverySuccess) {
              await db.whatsAppProcessedMessage.update({
                where: { messageId: message.id },
                data: { status: "PROCESSED" },
              });
              failedOutboundReplies.delete(message.id);
            } else {
              console.error(
                `[WhatsApp] Outbound send failed for message ${message.id}:`,
                sendResult?.error
              );
              recordFailedOutbound(message.id, {
                sender,
                message: assistantMessage,
                phoneNumberId,
                error: sendResult?.error,
              });
              await db.whatsAppProcessedMessage.update({
                where: { messageId: message.id },
                data: { status: "DELIVERY_FAILED" },
              });
            }
          } catch (error) {
            console.error("[WhatsApp] AI processing failed:", error.message);

            // Do not release the deduplication claim after an AI/tool failure:
            // the tool may already have changed an appointment before a later
            // step failed. Replaying could repeat a consequential action.
            try {
              await db.whatsAppProcessedMessage.update({
                where: { messageId: message.id },
                data: { status: "FAILED" },
              });
            } catch (statusError) {
              console.error(
                "[WhatsApp] Could not mark message failed:",
                statusError.message
              );
            }

            try {
              await sendText(
                sender,
                "Sorry, I'm having trouble responding right now. Please try again shortly.",
                phoneNumberId
              );
            } catch {
              // Ignore failure in error message send
            }
          }
        });
      }
    }
  }
};

module.exports = {
  verifyWebhook,
  handleIncomingWebhook,
  conversations,
  conversationQueues,
  enqueueConversation,
  sendWhatsAppText,
  failedOutboundReplies,
  recordFailedOutbound,
  getFailedOutbound,
  clearFailedOutbound,
  retryFailedOutboundMessage,
};
