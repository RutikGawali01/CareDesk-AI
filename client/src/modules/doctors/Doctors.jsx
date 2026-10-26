import React, { useState } from "react";
import { Stethoscope, Phone, Mail, Clock, Plus, Search, X, UserPlus, CheckCircle2 } from "lucide-react";
import { api } from "../../services/api";
import { formatDoctorName } from "../../utils/formatters";
import { useNavigation } from "../../context/NavigationContext";

const SPECIALIZATIONS = [
  "General Physician",
  "Cardiology",
  "Dermatology",
  "Pediatrics",
  "Orthopedics",
  "Neurology",
  "ENT (Ear, Nose, Throat)",
  "Gynecology & Obstetrics",
  "Ophthalmology",
  "Psychiatry & Behavioral Health",
  "Dental Surgery",
  "Other / Custom"
];

export function Doctors({ 
  doctors = [], 
  onRefresh, 
  onOpenDoctorModal, 
  isDoctorModalOpen, 
  onCloseDoctorModal 
}) {
  const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  
  const { doctorState, updateDoctorState } = useNavigation();
  const searchTerm = doctorState.search || "";
  const [internalModalOpen, setInternalModalOpen] = useState(false);

  // Form states
  const [name, setName] = useState("");
  const [specializationSelect, setSpecializationSelect] = useState("General Physician");
  const [customSpecialization, setCustomSpecialization] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const modalOpen = isDoctorModalOpen !== undefined ? isDoctorModalOpen : internalModalOpen;
  const handleOpenModal = onOpenDoctorModal || (() => setInternalModalOpen(true));
  const handleCloseModal = onCloseDoctorModal || (() => {
    setInternalModalOpen(false);
    setError("");
    setSuccessMsg("");
  });

  const filteredDoctors = doctors.filter((doc) => {
    const term = searchTerm.toLowerCase();
    return (
      doc.name?.toLowerCase().includes(term) ||
      doc.specialization?.toLowerCase().includes(term) ||
      doc.phone?.toLowerCase().includes(term) ||
      doc.email?.toLowerCase().includes(term)
    );
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccessMsg("");

    const finalSpecialization =
      specializationSelect === "Other / Custom"
        ? customSpecialization.trim()
        : specializationSelect;

    if (!name.trim()) {
      setError("Doctor name is required.");
      return;
    }

    if (!finalSpecialization) {
      setError("Please select or specify a specialization.");
      return;
    }

    setLoading(true);

    try {
      await api.createDoctor({
        name: name.trim(),
        specialization: finalSpecialization,
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
      });

      setSuccessMsg("Doctor added successfully!");

      // Refresh parent state
      if (onRefresh) {
        onRefresh();
      }

      // Reset form
      setName("");
      setSpecializationSelect("General Physician");
      setCustomSpecialization("");
      setPhone("");
      setEmail("");

      setTimeout(() => {
        setSuccessMsg("");
        handleCloseModal();
      }, 800);
    } catch (err) {
      console.error("Failed to create doctor:", err);
      setError(err.message || "Failed to create doctor. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* Header Bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
        <div>
          <h2 style={{ fontSize: "1.4rem", fontWeight: "800", color: "#0f172a" }}>
            Hospital Doctors & Shift Schedules
          </h2>
          <p style={{ color: "#64748b", fontSize: "0.85rem", marginTop: "2px" }}>
            Manage attending hospital specialists, contact info, working hours, and bookings
          </p>
        </div>

        <button className="btn btn-primary" onClick={handleOpenModal}>
          <UserPlus size={16} />
          Add New Doctor
        </button>
      </div>

      {/* Toolbar / Search Filter */}
      <div className="glass-card" style={{ padding: "16px 20px" }}>
        <div style={{ position: "relative", maxWidth: "420px" }}>
          <Search size={16} color="#94a3b8" style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)" }} />
          <input 
            type="text"
            placeholder="Search doctor by name, specialty, phone, or email..."
            className="form-input"
            style={{ paddingLeft: "36px" }}
            value={searchTerm}
            onChange={(e) => updateDoctorState({ search: e.target.value })}
          />
        </div>
      </div>

      {/* Doctors Grid */}
      {filteredDoctors.length === 0 ? (
        <div className="glass-card" style={{
          padding: "60px 20px",
          textAlign: "center",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "12px"
        }}>
          <div style={{
            width: "56px",
            height: "56px",
            borderRadius: "16px",
            background: "#e0f2fe",
            color: "#0284c7",
            display: "flex",
            alignItems: "center",
            justifyContent: "center"
          }}>
            <Stethoscope size={30} />
          </div>
          <h3 style={{ fontSize: "1.1rem", fontWeight: "700", color: "#0f172a" }}>
            {searchTerm ? "No matching doctors found" : "No Doctors Registered Yet"}
          </h3>
          <p style={{ color: "#64748b", fontSize: "0.85rem", maxWidth: "400px" }}>
            {searchTerm 
              ? "Try adjusting your search keywords or clear the filter to see all specialists."
              : "Register clinic specialists to start scheduling patient appointments and managing shifts."}
          </p>
          {!searchTerm && (
            <button className="btn btn-primary" onClick={handleOpenModal} style={{ marginTop: "8px" }}>
              <Plus size={16} /> Register First Doctor
            </button>
          )}
        </div>
      ) : (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))",
          gap: "20px"
        }}>
          {filteredDoctors.map((doc) => {
            const bookedCount = doc.appointments?.filter(a => a.status === 'BOOKED').length || 0;
            return (
              <div key={doc.id} className="glass-card" style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "18px" }}>
                {/* Doctor Header */}
                <div style={{ display: "flex", alignItems: "flex-start", gap: "16px" }}>
                  <div style={{
                    width: "54px",
                    height: "54px",
                    borderRadius: "14px",
                    background: "linear-gradient(135deg, #e0f2fe, #bae6fd)",
                    border: "1px solid #75aadb",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#0284c7",
                    flexShrink: 0
                  }}>
                    <Stethoscope size={28} />
                  </div>
                  <div>
                    <div style={{ fontSize: "0.75rem", fontWeight: "800", color: "#0284c7", letterSpacing: "0.05em" }}>
                      SPECIALIST #{doc.id}
                    </div>
                    <h3 style={{ fontSize: "1.2rem", fontWeight: "800", color: "#0f172a", lineHeight: 1.2 }}>
                      {formatDoctorName(doc.name)}
                    </h3>
                    <div style={{ fontSize: "0.85rem", color: "#0369a1", fontWeight: "600", marginTop: "2px" }}>
                      {doc.specialization}
                    </div>
                  </div>
                </div>

                {/* Contact Info */}
                <div style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px",
                  padding: "14px",
                  background: "#f8fafc",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid #e2e8f0",
                  fontSize: "0.82rem",
                  color: "#475569"
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <Phone size={14} color="#0284c7" />
                    <span style={{ color: "#0f172a", fontWeight: "600" }}>{doc.phone || "N/A"}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <Mail size={14} color="#0284c7" />
                    <span>{doc.email || "N/A"}</span>
                  </div>
                </div>

                {/* Doctor Working Hours / Schedules */}
                <div>
                  <div style={{ fontSize: "0.8rem", fontWeight: "800", color: "#0f172a", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "8px", display: "flex", alignItems: "center", gap: "6px" }}>
                    <Clock size={14} color="#0284c7" />
                    Working Shift Hours
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    {doc.schedules && doc.schedules.length > 0 ? (
                      doc.schedules.map((sch) => (
                        <div key={sch.id} style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          padding: "8px 12px",
                          background: "#ffffff",
                          border: "1px solid #e2e8f0",
                          borderRadius: "var(--radius-sm)",
                          fontSize: "0.8rem"
                        }}>
                          <span style={{ fontWeight: "600", color: "#334155" }}>
                            {DAYS[sch.dayOfWeek] || `Day ${sch.dayOfWeek}`}
                          </span>
                          <span style={{ fontFamily: "var(--font-mono)", color: "#0284c7", fontWeight: "700" }}>
                            {sch.startTime} - {sch.endTime}
                          </span>
                        </div>
                      ))
                    ) : (
                      <div style={{ fontSize: "0.8rem", color: "#94a3b8" }}>
                        Mon - Fri (10:00 AM - 01:30 PM & 04:00 PM - 07:30 PM)
                      </div>
                    )}
                  </div>
                </div>

                {/* Total Appointments Stats Footer */}
                <div style={{
                  marginTop: "auto",
                  paddingTop: "14px",
                  borderTop: "1px solid #e2e8f0",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between"
                }}>
                  <span style={{ fontSize: "0.8rem", color: "#64748b" }}>Active Appointments</span>
                  <span className="badge badge-booked">
                    {bookedCount} Booked
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Doctor Modal */}
      {modalOpen && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: "480px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "18px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <div style={{
                  width: "36px",
                  height: "36px",
                  borderRadius: "10px",
                  background: "#e0f2fe",
                  color: "#0284c7",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center"
                }}>
                  <Stethoscope size={20} />
                </div>
                <div>
                  <h3 style={{ fontSize: "1.2rem", fontWeight: "700", color: "#0f172a" }}>Register New Doctor</h3>
                  <p style={{ fontSize: "0.78rem", color: "#64748b" }}>Add specialist doctor to clinic roster</p>
                </div>
              </div>
              <button className="btn-icon" onClick={handleCloseModal}><X size={18} /></button>
            </div>

            {error && (
              <div style={{
                padding: "10px 14px", borderRadius: "var(--radius-sm)",
                background: "#fef2f2", border: "1px solid #fecaca",
                color: "#b91c1c", fontSize: "0.83rem", marginBottom: "14px"
              }}>
                {error}
              </div>
            )}

            {successMsg && (
              <div style={{
                padding: "10px 14px", borderRadius: "var(--radius-sm)",
                background: "#ecfdf5", border: "1px solid #a7f3d0",
                color: "#047857", fontSize: "0.83rem", marginBottom: "14px",
                display: "flex", alignItems: "center", gap: "8px"
              }}>
                <CheckCircle2 size={16} />
                {successMsg}
              </div>
            )}

            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label className="form-label">Doctor Name *</label>
                <input 
                  type="text" 
                  placeholder="e.g. Dr. Sarah Jenkins or Sarah Jenkins"
                  className="form-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Specialization *</label>
                <select 
                  className="form-select"
                  value={specializationSelect}
                  onChange={(e) => setSpecializationSelect(e.target.value)}
                  required
                >
                  {SPECIALIZATIONS.map((spec) => (
                    <option key={spec} value={spec}>{spec}</option>
                  ))}
                </select>
              </div>

              {specializationSelect === "Other / Custom" && (
                <div className="form-group">
                  <label className="form-label">Custom Specialization Name *</label>
                  <input 
                    type="text" 
                    placeholder="e.g. Clinical Immunology"
                    className="form-input"
                    value={customSpecialization}
                    onChange={(e) => setCustomSpecialization(e.target.value)}
                    required
                  />
                </div>
              )}

              <div className="form-group">
                <label className="form-label">Phone Number (Optional)</label>
                <input 
                  type="tel" 
                  placeholder="e.g. 555-0144"
                  className="form-input"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Email Address (Optional)</label>
                <input 
                  type="email" 
                  placeholder="e.g. doctor@clinic.com"
                  className="form-input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "22px" }}>
                <button type="button" className="btn btn-secondary" onClick={handleCloseModal}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={loading}>
                  {loading ? "Creating..." : "Save Doctor"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
