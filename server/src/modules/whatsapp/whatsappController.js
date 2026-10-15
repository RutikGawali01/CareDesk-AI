const crypto = require("crypto");
const { verifyWebhook, handleIncomingWebhook } = require("./whatsappService");

function isValidMetaSignature(req) {
  const appSecret = process.env.META_APP_SECRET;
  const signature = req.get("x-hub-signature-256");

  if (!appSecret || !req.rawBody || !signature) {
    return false;
  }

  const expected =
    "sha256=" +
    crypto
      .createHmac("sha256", appSecret)
      .update(req.rawBody)
      .digest("hex");

  const receivedBuffer = Buffer.from(signature, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");

  return (
    receivedBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(receivedBuffer, expectedBuffer)
  );
}

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
  if (!isValidMetaSignature(req)) {
    return res.sendStatus(401);
  }

  // Acknowledge only after authenticity has been checked.
  void handleIncomingWebhook(req.body).catch((error) => {
    console.error("[WhatsApp] Webhook processing failed:", error.message);
  });
  return res.sendStatus(200);
};

module.exports = { verifyWebhookController, incomingWebhookController };
