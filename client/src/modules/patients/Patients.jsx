import React, { useState } from "react";
import { Users, Plus, Search, Phone, Mail, Calendar, X, ChevronRight } from "lucide-react";
import { api } from "../../services/api";
import { useNavigation } from "../../context/NavigationContext";

export function Patients({ 
  patients, 
  onRefresh, 
  onOpenPatientModal, 
  isPatientModalOpen, 
  onClosePatientModal 
}) {
  const { patientState, updatePatientState } = useNavigation();
  const searchTerm = patientState.search || "";
  const [selectedPatient, setSelectedPatient] = useState(null);

  // New Patient Form State
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const filteredPatients = patients.filter((p) => {
    const term = searchTerm.toLowerCase();
    return (
      p.name?.toLowerCase().includes(term) ||
      p.phone?.toLowerCase().includes(term) ||
      p.email?.toLowerCase().includes(term)
    );
  });

  const handleCreatePatient = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      await api.createPatient({ name, phone, email });
      onClosePatientModal();
      onRefresh();
      setName("");
      setPhone("");
      setEmail("");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* Header Bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h2 style={{ fontSize: "1.4rem", fontWeight: "800", color: "#0f172a" }}>
            Hospital Patient Directory
          </h2>
          <p style={{ color: "#64748b", fontSize: "0.85rem", marginTop: "2px" }}>
            Manage registered hospital patients and view visit histories
          </p>
        </div>

        <button className="btn btn-primary" onClick={onOpenPatientModal}>
          <Plus size={16} />
          Register Patient
        </button>
      </div>

      {/* Search Toolbar */}
      <div className="glass-card" style={{ padding: "16px 20px" }}>
        <div style={{ position: "relative", maxWidth: "400px" }}>
          <Search size={16} color="#94a3b8" style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)" }} />
          <input 
            type="text"
            placeholder="Search by patient name, phone, or email..."
            className="form-input"
            style={{ paddingLeft: "36px" }}
            value={searchTerm}
            onChange={(e) => updatePatientState({ search: e.target.value })}
          />
        </div>
      </div>

      {/* Main Grid: Patients List + Patient Detail Drawer */}
      <div style={{
        display: "grid",
        gridTemplateColumns: selectedPatient ? "1fr 380px" : "1fr",
        gap: "24px",
        transition: "all 0.3s"
      }}>
        {/* Table */}
        <div className="glass-card" style={{ overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
              <thead>
                <tr style={{
                  background: "#f1f7fd",
                  borderBottom: "1px solid #dce8f5",
                  color: "#475569",
                  fontSize: "0.78rem",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em"
                }}>
                  <th style={{ padding: "14px 20px" }}>ID</th>
                  <th style={{ padding: "14px 20px" }}>Name</th>
                  <th style={{ padding: "14px 20px" }}>Phone</th>
                  <th style={{ padding: "14px 20px" }}>Email</th>
                  <th style={{ padding: "14px 20px" }}>Visits</th>
                  <th style={{ padding: "14px 20px", textAlign: "right" }}>Details</th>
                </tr>
              </thead>
              <tbody>
                {filteredPatients.length === 0 ? (
                  <tr>
                    <td colSpan="6" style={{ padding: "40px", textAlign: "center", color: "#94a3b8" }}>
                      No patients found.
                    </td>
                  </tr>
                ) : (
                  filteredPatients.map((patient) => {
                    const isSelected = selectedPatient?.id === patient.id;
                    return (
                      <tr 
                        key={patient.id}
                        onClick={() => setSelectedPatient(patient)}
                        style={{
                          borderBottom: "1px solid #e2e8f0",
                          background: isSelected ? "#e0f2fe" : "transparent",
                          cursor: "pointer",
                          transition: "background 0.15s"
                        }}
                      >
                        <td style={{ padding: "14px 20px", fontFamily: "var(--font-mono)", color: "#64748b", fontSize: "0.85rem" }}>
                          #{patient.id}
                        </td>
                        <td style={{ padding: "14px 20px", fontWeight: "700", color: "#0f172a", fontSize: "0.92rem" }}>
                          {patient.name}
                        </td>
                        <td style={{ padding: "14px 20px", fontSize: "0.85rem", color: "#475569" }}>
                          {patient.phone}
                        </td>
                        <td style={{ padding: "14px 20px", fontSize: "0.85rem", color: "#475569" }}>
                          {patient.email || "—"}
                        </td>
                        <td style={{ padding: "14px 20px" }}>
                          <span className="badge badge-booked">
                            {patient.appointments?.length || 0} Appointments
                          </span>
                        </td>
                        <td style={{ padding: "14px 20px", textAlign: "right" }}>
                          <ChevronRight size={18} color={isSelected ? "#0284c7" : "#94a3b8"} />
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Patient Profile & Visit History Drawer */}
        {selectedPatient && (
          <div className="glass-card" style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "20px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <span style={{ fontSize: "0.75rem", fontWeight: "800", color: "#0284c7" }}>PATIENT #{selectedPatient.id}</span>
                <h3 style={{ fontSize: "1.3rem", fontWeight: "800", color: "#0f172a" }}>{selectedPatient.name}</h3>
              </div>
              <button className="btn-icon" onClick={() => setSelectedPatient(null)}><X size={16} /></button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "10px", padding: "14px", background: "#f8fafc", borderRadius: "var(--radius-sm)", border: "1px solid #e2e8f0" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "0.85rem", color: "#475569" }}>
                <Phone size={15} color="#0284c7" />
                <span style={{ fontWeight: "600", color: "#0f172a" }}>{selectedPatient.phone}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "0.85rem", color: "#475569" }}>
                <Mail size={15} color="#0284c7" />
                <span>{selectedPatient.email || "No email on record"}</span>
              </div>
            </div>

            {/* Appointment History */}
            <div>
              <h4 style={{ fontSize: "0.9rem", fontWeight: "800", color: "#0f172a", marginBottom: "12px", display: "flex", alignItems: "center", gap: "6px" }}>
                <Calendar size={15} color="#0284c7" />
                Appointment History
              </h4>

              {!selectedPatient.appointments || selectedPatient.appointments.length === 0 ? (
                <p style={{ fontSize: "0.8rem", color: "#94a3b8" }}>No previous appointments on file.</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "10px", maxHeight: "320px", overflowY: "auto" }}>
                  {selectedPatient.appointments.map((apt) => (
                    <div key={apt.id} style={{
                      padding: "12px",
                      background: "#ffffff",
                      borderRadius: "var(--radius-sm)",
                      border: "1px solid #e2e8f0",
                      fontSize: "0.82rem"
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                        <span style={{ fontWeight: "700", color: "#0f172a" }}>
                          {new Date(apt.appointmentDate).toISOString().split("T")[0]} @ {apt.startTime}
                        </span>
                        <span className={`badge ${apt.status === 'BOOKED' ? 'badge-booked' : 'badge-cancelled'}`}>
                          {apt.status}
                        </span>
                      </div>
                      <div style={{ color: "#64748b" }}>
                        With <span style={{ color: "#0284c7", fontWeight: "600" }}>Doctor #{apt.doctorId}</span>
                      </div>
                      {apt.reason && (
                        <div style={{ color: "#94a3b8", marginTop: "2px" }}>
                          "{apt.reason}"
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Add Patient Modal */}
      {isPatientModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <h3 style={{ fontSize: "1.2rem", fontWeight: "700", color: "#0f172a" }}>Register New Patient</h3>
              <button className="btn-icon" onClick={onClosePatientModal}><X size={18} /></button>
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

            <form onSubmit={handleCreatePatient}>
              <div className="form-group">
                <label className="form-label">Full Name</label>
                <input 
                  type="text" 
                  placeholder="e.g. Sarah Connor"
                  className="form-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Phone Number (Unique)</label>
                <input 
                  type="tel" 
                  placeholder="e.g. 555-0199"
                  className="form-input"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Email Address (Optional)</label>
                <input 
                  type="email" 
                  placeholder="e.g. sarah@example.com"
                  className="form-input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "20px" }}>
                <button type="button" className="btn btn-secondary" onClick={onClosePatientModal}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={loading}>
                  {loading ? "Registering..." : "Save Patient"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
