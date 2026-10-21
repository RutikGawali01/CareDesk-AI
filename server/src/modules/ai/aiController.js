const { askAI } = require("./aiService");

async function chatWithAI(req, res) {
  try {
    const { message, previousMessages } = req.body;

    if (!message || typeof message !== "string") {
      return res.status(400).json({
        success: false,
        message: "A text message is required",
      });
    }

    // The server, not the browser, decides whether AI booking is enabled.
    const allowBooking = process.env.AI_BOOKING_ENABLED === "true";

    const result = await askAI(
      message,
      Array.isArray(previousMessages) ? previousMessages : [],
      allowBooking,
      req.clinicId,
      {
        adminId: req.adminId,
        allowAppointmentChanges:
          process.env.AI_APPOINTMENT_CHANGES_ENABLED === "true",
      }
    );

    res.json({
      success: true,
      response: result.response,
      messages: result.messages,
    });
  } catch (error) {
    console.error("AI Chat Error:", error);

    res.status(500).json({
      success: false,
      message:
        error.message || "Failed to process message with AI Receptionist",
    });
  }
}

module.exports = {
  chatWithAI,
};