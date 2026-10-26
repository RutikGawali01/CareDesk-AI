const app = require("./app");

// ===============================
// SERVER
// ===============================

const PORT = process.env.PORT || 5001;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});
