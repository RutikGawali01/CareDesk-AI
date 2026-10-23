import React, { useState } from "react";
import { Building, User, Mail, Lock, Phone, ArrowRight, RefreshCw, AlertCircle, CheckCircle2 } from "lucide-react";
import { api } from "../../services/api";

export function RegisterClinic({ onRegisterSuccess }) {
  const [clinicName, setClinicName] = useState("");
  const [adminName, setAdminName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [whatsapp, setWhatsapp] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccessMsg("");

    if (!clinicName.trim() || !adminName.trim() || !email.trim() || !password) {
      setError("Clinic name, admin name, email, and password are required.");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }

    setLoading(true);

    try {
      const payload = {
        clinicName: clinicName.trim(),
        name: adminName.trim(),
        email: email.trim(),
        password,
        address: address.trim() || undefined,
        phone: phone.trim() || undefined,
        whatsappNumber: whatsapp.trim() || undefined,
      };

      await api.signup(payload);

      setSuccessMsg("Account created successfully! Logging you in...");

      // Automatically log in with new credentials
      await api.login({
        email: email.trim(),
        password,
      });

      setTimeout(() => {
        onRegisterSuccess();
      }, 700);
    } catch (err) {
      console.error("Signup error:", err);
      setError(err.message || "Failed to register clinic. Email may already be in use.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ width: "100%" }}>
      {/* Header text */}
      <div style={{ marginBottom: "20px" }}>
        <h3 style={{ fontSize: "1.4rem", fontWeight: "800", color: "#0f172a", marginBottom: "6px" }}>
          Register your Hospital Account
        </h3>
        <p style={{ fontSize: "0.86rem", color: "#64748b" }}>
          Create a new hospital profile and admin account to get started in minutes.
        </p>
      </div>

      {/* Banners */}
      {error && (
        <div style={{
          padding: "12px 16px",
          borderRadius: "10px",
          background: "#fef2f2",
          border: "1px solid #fecaca",
          color: "#991b1b",
          fontSize: "0.85rem",
          fontWeight: "600",
          display: "flex",
          alignItems: "center",
          gap: "10px",
          marginBottom: "16px",
        }}>
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div style={{
          padding: "12px 16px",
          borderRadius: "10px",
          background: "#ecfdf5",
          border: "1px solid #a7f3d0",
          color: "#065f46",
          fontSize: "0.85rem",
          fontWeight: "600",
          display: "flex",
          alignItems: "center",
          gap: "10px",
          marginBottom: "16px",
        }}>
          <CheckCircle2 size={18} />
          <span>{successMsg}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <Building size={14} color="#0284c7" /> Hospital Name *
            </label>
            <input
              type="text"
              className="form-input"
              placeholder="City General Hospital"
              value={clinicName}
              onChange={(e) => setClinicName(e.target.value)}
              disabled={loading}
              required
            />
          </div>

          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <User size={14} color="#0284c7" /> Admin Name *
            </label>
            <input
              type="text"
              className="form-input"
              placeholder="Dr. Alex Smith"
              value={adminName}
              onChange={(e) => setAdminName(e.target.value)}
              disabled={loading}
              required
            />
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <Mail size={14} color="#0284c7" /> Email Address *
            </label>
            <input
              type="email"
              className="form-input"
              placeholder="alex@clinic.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
              required
            />
          </div>

          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <Lock size={14} color="#0284c7" /> Password *
            </label>
            <input
              type="password"
              className="form-input"
              placeholder="Min 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              required
            />
          </div>
        </div>

        {/* Optional Fields Box */}
        <div style={{
          background: "#f8fafc",
          padding: "12px",
          borderRadius: "10px",
          border: "1px solid #e2e8f0",
          display: "flex",
          flexDirection: "column",
          gap: "10px"
        }}>
          <div style={{ fontSize: "0.72rem", fontWeight: "700", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Optional Hospital Contact Info
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
            <div className="form-group" style={{ margin: 0 }}>
              <input
                type="text"
                className="form-input"
                placeholder="Phone Number"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                disabled={loading}
                style={{ fontSize: "0.82rem", padding: "8px 12px" }}
              />
            </div>

            <div className="form-group" style={{ margin: 0 }}>
              <input
                type="text"
                className="form-input"
                placeholder="WhatsApp Business No."
                value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value)}
                disabled={loading}
                style={{ fontSize: "0.82rem", padding: "8px 12px" }}
              />
            </div>
          </div>

          <div className="form-group" style={{ margin: 0 }}>
            <input
              type="text"
              className="form-input"
              placeholder="Hospital Address (City, State)"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              disabled={loading}
              style={{ fontSize: "0.82rem", padding: "8px 12px" }}
            />
          </div>
        </div>

        <button
          type="submit"
          className="btn btn-primary"
          style={{ width: "100%", padding: "12px", fontSize: "0.95rem", marginTop: "8px" }}
          disabled={loading}
        >
          {loading ? (
            <>
              <RefreshCw size={18} className="spin" /> Registering Hospital...
            </>
          ) : (
            <>
              Register Hospital & Sign In <ArrowRight size={18} />
            </>
          )}
        </button>
      </form>
    </div>
  );
}
