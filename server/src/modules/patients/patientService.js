const prisma = require("../../db");

async function findPatient(clinicId, name, phone) {
  // A trusted phone number is the strongest identifier. Do not fall back
  // to a matching name when a supplied phone number has no match, because
  // that could identify a different person.
  if (phone) {
    return prisma.patient.findFirst({
      where: {
        clinicId: Number(clinicId),
        phone,
      },
    });
  }

  if (!name) return null;

  // Name-only lookup is used by dashboard chat; use an exact name match
  // within this clinic and let the assistant clarify if needed.
  return prisma.patient.findFirst({
    where: {
      clinicId: Number(clinicId),
      name: { equals: name.trim(), mode: "insensitive" },
    },
  });
}

async function createPatient(clinicId, { name, phone, email }) {
  const existingPatient = await prisma.patient.findFirst({
    where: {
      clinicId,
      phone,
    },
  });

  if (existingPatient) {
    return existingPatient;
  }

  return await prisma.patient.create({
    data: {
      clinicId,
      name,
      phone,
      email: email || null,
    },
  });
}

module.exports = {
  findPatient,
  createPatient,
};