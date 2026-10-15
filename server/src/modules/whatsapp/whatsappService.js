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
    return;
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

    const result = await response.json();

    if (!response.ok) {
      console.error("[WhatsApp] Send failed:", result);
      return;
    }

    console.log("[WhatsApp] Reply sent successfully.");
  } catch (error) {
    console.error("[WhatsApp] API request failed:", error.message);
  }
};

const handleIncomingWebhook = async (payload) => {
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
          await prisma.whatsAppProcessedMessage.create({
            data: { messageId: message.id, status: "PROCESSING" },
          });
        } catch (error) {
          if (error?.code === "P2002") {
            console.log("[WhatsApp] Ignoring duplicate message ID.");
            continue;
          }
          throw error;
        }

        // Scope conversation history to both tenant and sender. A patient
        // messaging two hospital numbers must never share context across clinics.
        const conversationKey = `${clinicId}:${sender}`;
        const history = conversations.get(conversationKey) ?? [];

        try {
          const reply = await askAI(
            userMessage,
            history,
            process.env.AI_BOOKING_ENABLED === "true",
            clinicId,
            {
              callerPhone: sender,
              preserveToolHistory: true,
              allowAppointmentChanges:
                process.env.AI_APPOINTMENT_CHANGES_ENABLED === "true",
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
          // This lets later turns reuse real patient/doctor IDs returned by
          // tools instead of asking the model to recreate or guess those IDs.
          const updatedHistory = [
            ...(reply.messages ?? []).filter((item) => item.role !== "system"),
            { role: "assistant", content: assistantMessage },
          ];

          conversations.set(conversationKey, updatedHistory);

          // Mark the event processed before sending the reply. If delivery fails,
          // Meta retries must not repeat a booking/cancellation side effect.
          await prisma.whatsAppProcessedMessage.update({
            where: { messageId: message.id },
            data: { status: "PROCESSED" },
          });
          await sendWhatsAppText(sender, assistantMessage, phoneNumberId);
        } catch (error) {
          console.error("[WhatsApp] AI processing failed:", error.message);

          // Do not release the deduplication claim after an AI/tool failure:
          // the tool may already have changed an appointment before a later
          // step failed. Replaying could repeat a consequential action.
          try {
            await prisma.whatsAppProcessedMessage.update({
              where: { messageId: message.id },
              data: { status: "FAILED" },
            });
          } catch (statusError) {
            console.error("[WhatsApp] Could not mark message failed:", statusError.message);
          }

          await sendWhatsAppText(
            sender,
            "Sorry, I'm having trouble responding right now. Please try again shortly.",
            phoneNumberId
          );
        }
      }
    }
  }
};

module.exports = {
  verifyWebhook,
  handleIncomingWebhook,
};
