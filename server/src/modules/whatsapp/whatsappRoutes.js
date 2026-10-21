const express = require("express");
const {
  verifyWebhookController,
  incomingWebhookController,
  retryFailedDeliveryController,
} = require("./whatsappController");

const router = express.Router();

router.get("/webhook", verifyWebhookController);
router.post("/webhook", incomingWebhookController);
router.post("/retry-delivery", retryFailedDeliveryController);

module.exports = router;
