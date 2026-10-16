const test = require("node:test");
const assert = require("node:assert/strict");
const {
  isExplicitConfirmation,
  getActorKey,
} = require("../src/modules/appointments/appointmentConfirmation");

test("accepts clear, standalone confirmation messages", () => {
  for (const phrase of ["yes", "Confirm!", "go ahead", "book it", "yes please"]) {
    assert.equal(isExplicitConfirmation(phrase), true, phrase);
  }
});

test("does not treat ambiguous or negated messages as confirmation", () => {
  for (const phrase of ["yesterday", "yes, but tomorrow", "no", "I think yes", "", null]) {
    assert.equal(isExplicitConfirmation(phrase), false, String(phrase));
  }
});

test("confirmation actor key is scoped to clinic and verified identity", () => {
  assert.equal(
    getActorKey({ clinicId: 4, callerPhone: "919999000000" }),
    "whatsapp:4:919999000000"
  );
  assert.equal(
    getActorKey({ clinicId: 4, adminId: 12 }),
    "admin:4:12"
  );
  assert.throws(() => getActorKey({ clinicId: 4 }), /Trusted confirmation identity/);
});
