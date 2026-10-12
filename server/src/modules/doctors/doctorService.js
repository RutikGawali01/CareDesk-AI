const prisma = require("../../db");

// Map common patient-friendly specialty names to the terminology
// that may be stored in the clinic's doctor records.
const SPECIALIZATION_ALIASES = {
  cardiologist: ["heart", "cardiology", "cardiologist"],
  "heart specialist": ["heart", "cardiology", "cardiologist"],
  dentist: ["dentist", "dental"],
  dermatologist: ["dermatology", "dermatologist", "skin"],
  "skin specialist": ["dermatology", "dermatologist", "skin"],
  neurologist: ["neurology", "neurologist"],
  "orthopedic doctor": ["orthopedic", "orthopaedic"],
  orthopedist: ["orthopedic", "orthopaedic"],
  "bone specialist": ["orthopedic", "orthopaedic"],
  pediatrician: ["pediatric", "paediatric", "child"],
  "child specialist": ["pediatric", "paediatric", "child"],
};

function normalizeDoctorName(value = "") {
  return value
    .toLowerCase()
    .trim()
    .replace(/^dr\.?\s*/, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function findDoctor(clinicId, name) {
  const query = String(name || "").trim();

  if (!query) return [];

  // Always scope the search to the current clinic.
  const doctors = await prisma.doctor.findMany({
    where: {
      clinicId: Number(clinicId),
    },
    select: {
      id: true,
      name: true,
      specialization: true,
      phone: true,
      email: true,
    },
    orderBy: {
      name: "asc",
    },
  });

  const normalizedQuery = normalizeDoctorName(query);
  const normalizedSpecialtyQuery = query.toLowerCase().replace(/\s+/g, " ").trim();

  // Prefer exact doctor-name matches. For example, "Dr Sharma" should
  // resolve to "Dr.Sharma" rather than also returning "Dr. Amit Sharma".
  const exactNameMatches = doctors.filter(
    (doctor) => normalizeDoctorName(doctor.name) === normalizedQuery
  );

  if (exactNameMatches.length > 0) {
    return exactNameMatches;
  }

  // Resolve common specialty synonyms against the clinic's stored
  // specialization values (e.g. "cardiologist" -> "Heart").
  const aliases = SPECIALIZATION_ALIASES[normalizedSpecialtyQuery];
  if (aliases) {
    const specialtyMatches = doctors.filter((doctor) => {
      const specialization = String(doctor.specialization || "").toLowerCase();
      return aliases.some((alias) => specialization.includes(alias));
    });

    if (specialtyMatches.length > 0) {
      return specialtyMatches;
    }

    return [];
  }

  // For partial name searches, retain all matches so the assistant can
  // ask the patient to choose if the name is ambiguous.
  const partialNameMatches = doctors.filter((doctor) => {
    const normalizedName = normalizeDoctorName(doctor.name);
    return normalizedName.includes(normalizedQuery);
  });

  if (partialNameMatches.length > 0) {
    return partialNameMatches;
  }

  // Generic specialty search for values not covered by the alias map.
  return doctors.filter((doctor) =>
    String(doctor.specialization || "")
      .toLowerCase()
      .includes(normalizedSpecialtyQuery)
  );
}

/**
 * List all doctors belonging to a specific clinic.
 * Returns only patient-appropriate fields.
 */
async function listDoctors(clinicId) {
  const doctors = await prisma.doctor.findMany({
    where: {
      clinicId: Number(clinicId),
    },
    select: {
      name: true,
      specialization: true,
    },
    orderBy: {
      name: "asc",
    },
  });

  return doctors;
}

module.exports = { findDoctor, listDoctors };
