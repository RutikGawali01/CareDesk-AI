const crypto = require("crypto");

function isValidMetaSignature(rawBody, signature, appSecret) {
  if (!appSecret || !Buffer.isBuffer(rawBody) || !signature) {
    return false;
  }

  const expected =
    "sha256=" +
    crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex");

  const receivedBuffer = Buffer.from(signature, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");

  return (
    receivedBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(receivedBuffer, expectedBuffer)
  );
}

module.exports = { isValidMetaSignature };
