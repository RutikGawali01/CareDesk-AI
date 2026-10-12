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

const DEMO_CLINIC_ID = 1;
const DEMO_PHONE_NUMBER_ID = "1417503314772648";

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

const sendWhatsAppText = async (to, message) => {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

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

      // Only process messages received by our configured demo number.
      if (
        value.metadata?.phone_number_id !== DEMO_PHONE_NUMBER_ID
      ) {
        console.warn("[WhatsApp] Ignoring an unrecognized number.");
        continue;
      }

      for (const message of value.messages ?? []) {
        if (message.type !== "text" || !message.from) continue;

        const sender = message.from;
        const userMessage = message.text?.body?.trim();

        if (!userMessage) continue;

        console.log(`[WhatsApp] Incoming text from ${sender}`);

        const history = conversations.get(sender) ?? [];

        try {
          // Booking remains disabled during the first AI test.
          const reply = await askAI(
            userMessage,
            history,
            true,
            DEMO_CLINIC_ID,
            {
              callerPhone: sender,
              preserveToolHistory: true,
              allowAppointmentChanges: false,
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

          conversations.set(sender, updatedHistory);

          await sendWhatsAppText(sender, assistantMessage);
        } catch (error) {
          console.error("[WhatsApp] AI processing failed:", error.message);

          await sendWhatsAppText(
            sender,
            "Sorry, I'm having trouble responding right now. Please try again shortly."
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
