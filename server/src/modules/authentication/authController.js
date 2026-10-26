const bcrypt = require("bcrypt");
const prisma = require("../../db");
const { generateToken } = require("./authService");

async function signup(req, res) {
  try {
    const {
      clinicName,
      name,
      email,
      password,
      address,
      phone,
      whatsappNumber,
    } = req.body;

    // 1. Validate required fields
    if (!clinicName || !name || !email || !password) {
      return res.status(400).json({
        message: "Clinic name, admin name, email and password are required",
      });
    }

    // 2. Basic password validation
    if (password.length < 8) {
      return res.status(400).json({
        message: "Password must be at least 8 characters",
      });
    }

    // 3. Check whether email already exists
    const existingAdmin = await prisma.admin.findUnique({
      where: {
        email: email.toLowerCase().trim(),
      },
    });

    if (existingAdmin) {
      return res.status(409).json({
        message: "An account with this email already exists",
      });
    }

    // 4. Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // 5. Create clinic + admin together
    const result = await prisma.$transaction(async (tx) => {
      const clinic = await tx.clinic.create({
        data: {
          name: clinicName.trim(),
          address: address || null,
          phone: phone || null,
          whatsappNumber: whatsappNumber || null,
        },
      });

      const admin = await tx.admin.create({
        data: {
          clinicId: clinic.id,
          name: name.trim(),
          email: email.toLowerCase().trim(),
          passwordHash,
        },
      });

      return { clinic, admin };
    });

    // 6. Return safe information
    res.status(201).json({
      message: "Clinic account created successfully",
      clinic: {
        id: result.clinic.id,
        name: result.clinic.name,
      },
      admin: {
        id: result.admin.id,
        name: result.admin.name,
        email: result.admin.email,
      },
    });
  } catch (error) {
    console.error("Signup error:", error);

    res.status(500).json({
      message: "Something went wrong during signup",
    });
  }
}
async function login(req, res) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        message: "Email and password are required",
      });
    }

    const admin = await prisma.admin.findUnique({
      where: {
        email: email.toLowerCase().trim(),
      },
    });

    if (!admin || !admin.passwordHash) {
      return res.status(401).json({
        message: "Invalid email or password",
      });
    }

    const passwordMatches = await bcrypt.compare(
      password,
      admin.passwordHash
    );

    if (!passwordMatches) {
      return res.status(401).json({
        message: "Invalid email or password",
      });
    }

    const token = generateToken(admin);

    res.cookie("token", token, {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
  path: "/",
  maxAge: 7 * 24 * 60 * 60 * 1000,
});

    res.json({
      message: "Login successful",
      admin: {
        id: admin.id,
        name: admin.name,
        email: admin.email,
        clinicId: admin.clinicId,
      },
    });
  } catch (error) {
    console.error("Login error:", error);

    res.status(500).json({
      message: "Something went wrong during login",
    });
  }
}
async function getCurrentAdmin(req, res) {
  try {
    const admin = await prisma.admin.findUnique({
      where: {
        id: req.adminId,
      },
      include: {
        clinic: true,
      },
    });

    if (!admin) {
      return res.status(401).json({
        message: "Admin account not found",
      });
    }

    res.json({
      admin: {
        id: admin.id,
        name: admin.name,
        email: admin.email,
        clinicId: admin.clinicId,
      },
      clinic: {
        id: admin.clinic.id,
        name: admin.clinic.name,
        address: admin.clinic.address,
        phone: admin.clinic.phone,
        whatsappNumber: admin.clinic.whatsappNumber,
        aiPhoneNumber: admin.clinic.aiPhoneNumber,
      },
    });
  } catch (error) {
    console.error("Get current admin error:", error);

    res.status(500).json({
      message: "Unable to fetch current admin",
    });
  }
}

async function logout(req, res) {
  try {
    res.clearCookie("token", {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
  path: "/",
});
    res.json({ message: "Logged out successfully" });
  } catch (error) {
    console.error("Logout error:", error);
    res.status(500).json({ message: "Something went wrong during logout" });
  }
}

module.exports = {
  signup,
  login,
  getCurrentAdmin,
  logout,
};