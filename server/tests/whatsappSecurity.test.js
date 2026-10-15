const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");

const { isValidMetaSignature } = require("../src/modules/whatsapp/whatsappSecurity");

const appSecret = "test-app-secret";
const rawBody = Buffer.from(JSON.stringify({
  object: "whatsapp_business_account",
  entry: [{ id: "test-entry" }],
}));

function sign(body, secret = appSecret) {
  return "sha256=" + crypto.createHmac("sha256", secret).update(body).digest("hex");
}

test("accepts a valid Meta HMAC signature for the exact raw body", () => {
  assert.equal(isValidMetaSignature(rawBody, sign(rawBody), appSecret), true);
});

test("rejects a signature created with a different secret", () => {
  assert.equal(isValidMetaSignature(rawBody, sign(rawBody, "wrong-secret"), appSecret), false);
});

test("rejects a signature when the request body has changed", () => {
  assert.equal(
    isValidMetaSignature(Buffer.from(rawBody.toString() + " "), sign(rawBody), appSecret),
    false
  );
});

test("rejects missing secret, missing signature, or missing raw body", () => {
  assert.equal(isValidMetaSignature(rawBody, sign(rawBody), ""), false);
  assert.equal(isValidMetaSignature(rawBody, "", appSecret), false);
  assert.equal(isValidMetaSignature(null, sign(rawBody), appSecret), false);
});
