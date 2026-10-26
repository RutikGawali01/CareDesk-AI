const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const app = require("../src/app");

test("Health Endpoint: GET /api/health returns HTTP 200 with ok status", async () => {
  const response = await request(app)
    .get("/api/health")
    .set("Connection", "close");

  assert.equal(response.status, 200);
  assert.match(response.headers["content-type"], /application\/json/);
  assert.equal(response.body.status, "ok");
  assert.equal(typeof response.body.uptime, "number");
  assert.ok(response.body.timestamp);
  assert.equal(isNaN(Date.parse(response.body.timestamp)), false);

  // Verify no sensitive credentials, environment variables, or internal paths leak
  assert.equal(response.body.databaseUrl, undefined);
  assert.equal(response.body.DATABASE_URL, undefined);
  assert.equal(response.body.env, undefined);
  assert.equal(response.body.secret, undefined);
  assert.equal(response.body.password, undefined);
  assert.equal(response.body.stack, undefined);
});

test("Health Endpoint: GET /health root alias returns HTTP 200 with ok status", async () => {
  const response = await request(app)
    .get("/health")
    .set("Connection", "close");

  assert.equal(response.status, 200);
  assert.equal(response.body.status, "ok");
  assert.equal(typeof response.body.uptime, "number");
});
