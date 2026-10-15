const { verifyWebhook, handleIncomingWebhook } = require("./whatsappService");
const { isValidMetaSignature } = require("./whatsappSecurity");

/**
 * GET /api/whatsapp/webhook
 * Meta webhook verification (subscription handshake).
 */
const verifyWebhookController = (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  const result = verifyWebhook(mode, token, challenge);
  return res.status(result.status).send(result.body);
};

/**
 * POST /api/whatsapp/webhook
 * Receives incoming webhook events from Meta.
 * Returns 200 immediately so Meta does not retry.
 */
const incomingWebhookController = (req, res) => {
  if (
    !isValidMetaSignature(
      req.rawBody,
      req.get("x-hub-signature-256"),
      process.env.META_APP_SECRET
    )
  ) {
    return res.sendStatus(401);
  }

  // Acknowledge only after authenticity has been checked.
  void handleIncomingWebhook(req.body).catch((error) => {
    console.error("[WhatsApp] Webhook processing failed:", error.message);
  });
  return res.sendStatus(200);
};

module.exports = { verifyWebhookController, incomingWebhookController };
