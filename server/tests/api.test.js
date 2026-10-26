const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const app = require("../src/app");
const { generateToken } = require("../src/modules/authentication/authService");

// Test configuration
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-jwt-secret-ci-key-98765";
process.env.WHATSAPP_VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || "test-webhook-verify-token";

// ============================================================
// TEST CATEGORY 2: REPRESENTATIVE SUCCESSFUL API RESPONSES
// ============================================================

test("API Success: POST /api/auth/logout successfully clears token cookie", async () => {
  const response = await request(app)
    .post("/api/auth/logout")
    .set("Connection", "close");

  assert.equal(response.status, 200);
  assert.equal(response.body.message, "Logged out successfully");

  // Verify cookie clearing in Set-Cookie header
  const setCookie = response.headers["set-cookie"];
  assert.ok(setCookie, "Set-Cookie header must be present on logout");
  assert.ok(
    setCookie.some((cookie) => cookie.startsWith("token=")),
    "Token cookie must be cleared"
  );
});

test("API Success: GET /api/whatsapp/webhook verifies subscription with correct token", async () => {
  const challenge = "meta_hub_challenge_sample_12345";
  const response = await request(app)
    .get("/api/whatsapp/webhook")
    .query({
      "hub.mode": "subscribe",
      "hub.verify_token": process.env.WHATSAPP_VERIFY_TOKEN,
      "hub.challenge": challenge,
    })
    .set("Connection", "close");

  assert.equal(response.status, 200);
  assert.equal(response.text, challenge);
});

// ============================================================
// TEST CATEGORY 3: INPUT VALIDATION AND CLIENT ERROR HANDLING
// ============================================================

test("Validation: POST /api/auth/signup rejects missing required fields with HTTP 400", async () => {
  const response = await request(app)
    .post("/api/auth/signup")
    .send({})
    .set("Connection", "close");

  assert.equal(response.status, 400);
  assert.equal(
    response.body.message,
    "Clinic name, admin name, email and password are required"
  );
});

test("Validation: POST /api/auth/signup rejects password shorter than 8 characters", async () => {
  const response = await request(app)
    .post("/api/auth/signup")
    .send({
      clinicName: "Apollo Care Clinic",
      name: "Dr. Admin",
      email: "admin@apollocare.com",
      password: "short",
    })
    .set("Connection", "close");

  assert.equal(response.status, 400);
  assert.equal(response.body.message, "Password must be at least 8 characters");
});

test("Validation: POST /api/auth/login rejects request when email or password is missing", async () => {
  const responseWithoutBody = await request(app)
    .post("/api/auth/login")
    .send({})
    .set("Connection", "close");

  assert.equal(responseWithoutBody.status, 400);
  assert.equal(responseWithoutBody.body.message, "Email and password are required");

  const responseWithOnlyEmail = await request(app)
    .post("/api/auth/login")
    .send({ email: "admin@test.com" })
    .set("Connection", "close");

  assert.equal(responseWithOnlyEmail.status, 400);
  assert.equal(responseWithOnlyEmail.body.message, "Email and password are required");
});

test("Validation: POST /api/whatsapp/retry-delivery rejects request without messageId", async () => {
  const response = await request(app)
    .post("/api/whatsapp/retry-delivery")
    .send({})
    .set("Connection", "close");

  assert.equal(response.status, 400);
  assert.equal(response.body.error, "messageId is required.");
});

test("Validation: GET /api/whatsapp/webhook rejects invalid verify_token with HTTP 403", async () => {
  const response = await request(app)
    .get("/api/whatsapp/webhook")
    .query({
      "hub.mode": "subscribe",
      "hub.verify_token": "wrong-verification-token",
      "hub.challenge": "12345",
    })
    .set("Connection", "close");

  assert.equal(response.status, 403);
  assert.equal(response.text, "Forbidden");
});

// ============================================================
// TEST CATEGORY 4: AUTHENTICATION AND AUTHORIZATION
// ============================================================

test("Auth: Protected routes reject requests with missing authentication token", async () => {
  const endpoints = [
    { method: "get", path: "/api/auth/me" },
    { method: "get", path: "/api/patients" },
    { method: "get", path: "/api/doctors" },
    { method: "get", path: "/api/dashboard" },
    { method: "post", path: "/api/appointments" },
  ];

  for (const ep of endpoints) {
    const res = await request(app)[ep.method](ep.path).set("Connection", "close");
    assert.equal(
      res.status,
      401,
      `Expected ${ep.method.toUpperCase()} ${ep.path} to return 401 when unauthenticated`
    );
    assert.equal(
      res.body.message,
      "Authentication required",
      `Expected 'Authentication required' message for ${ep.path}`
    );
  }
});

test("Auth: Protected routes reject requests with invalid or expired authentication token", async () => {
  const response = await request(app)
    .get("/api/auth/me")
    .set("Cookie", ["token=malformed.invalid.token-signature"])
    .set("Connection", "close");

  assert.equal(response.status, 401);
  assert.equal(response.body.message, "Invalid or expired authentication token");
});

test("Auth: Valid authentication token authorizes request through requireAuth middleware", async () => {
  // Safe test fixture: generate signed token with test JWT secret
  const validToken = generateToken({ id: 999, clinicId: 888 });

  // Make request with valid cookie to a protected endpoint with input validation.
  // The requireAuth middleware verifies the token and forwards to the controller.
  const response = await request(app)
    .post("/api/appointments/check-availability")
    .set("Cookie", [`token=${validToken}`])
    .send({})
    .set("Connection", "close");

  // The request is authorized by requireAuth (not 401) and reaches the controller
  assert.equal(
    response.status,
    400,
    "Authorized request must reach the controller which validates required fields"
  );
  assert.equal(
    response.body.message,
    "doctorId, appointmentDate and startTime are required"
  );
});

// ============================================================
// TEST CATEGORY 5: ERROR HANDLING & APPLICATION ROBUSTNESS
// ============================================================

test("Error Handling: Malformed JSON payload returns HTTP 400 Bad Request", async () => {
  const response = await request(app)
    .post("/api/auth/login")
    .set("Content-Type", "application/json")
    .set("Connection", "close")
    .send("{\"invalidJson: unclosed string");

  assert.equal(
    response.status,
    400,
    "Server should return HTTP 400 for malformed JSON"
  );
  // Ensure stack traces are not leaked in error response
  assert.equal(response.body.stack, undefined);
});

test("Error Handling: Non-existent routes return HTTP 404", async () => {
  const response = await request(app)
    .get("/api/nonexistent-route-for-testing")
    .set("Connection", "close");

  assert.equal(response.status, 404);
});

test("Error Handling: CORS rejects unauthorized external origins cleanly", async () => {
  const response = await request(app)
    .get("/api/health")
    .set("Origin", "https://unauthorized-malicious-domain.com")
    .set("Connection", "close");

  // CORS rejection returns error handled by Express error middleware
  assert.equal(response.status, 500);
  assert.equal(response.body.success, false);
  assert.match(response.body.message, /Not allowed by CORS/i);
  assert.equal(response.body.stack, undefined);
});

test("CORS: Allows requests from authorized client origin", async () => {
  const response = await request(app)
    .get("/api/health")
    .set("Origin", "http://localhost:5173")
    .set("Connection", "close");

  assert.equal(response.status, 200);
  assert.equal(
    response.headers["access-control-allow-origin"],
    "http://localhost:5173"
  );
  assert.equal(response.headers["access-control-allow-credentials"], "true");
});

test.after(async () => {
  const prisma = require("../src/db");
  await prisma.$disconnect();
});
