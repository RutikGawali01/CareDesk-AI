import React, { useState } from "react";
import { 
  CalendarDays, 
  Plus, 
  Search, 
  Filter, 
  X, 
  CheckCircle2, 
  XCircle, 
  UserCheck, 
  AlertCircle,
  AlertTriangle,
  Clock,
  RotateCcw
} from "lucide-react";
import { api } from "../../services/api";
import { MORNING_SLOTS, EVENING_SLOTS, formatSlotLabel } from "../../constants/timeSlots";
import { 
  formatDoctorName, 
  formatDate, 
  formatTime, 
  getStatusConfig, 
  isAppointmentAttendancePending 
} from "../../utils/formatters";
import { useNavigation } from "../../context/NavigationContext";

export function Appointments({ 
  appointments = [], 
  doctors = [], 
  patients = [], 
  onRefresh, 
  onOpenBookModal, 
  isBookModalOpen, 
  onCloseBookModal 
}) {
  const { appointmentState, updateAppointmentState } = useNavigation();

  // Persistent search & filter state
  const searchTerm = appointmentState.search || "";
  const statusFilter = appointmentState.statusFilter || "ALL";
  const doctorFilter = appointmentState.doctorFilter || "ALL";
  const dateFilter = appointmentState.dateFilter || "";

  // Booking Modal State
  const [bookPatientId, setBookPatientId] = useState("");
  const [bookDoctorId, setBookDoctorId] = useState("");
  const [bookDate, setBookDate] = useState("");
  const [bookTime, setBookTime] = useState("");
  const [bookReason, setBookReason] = useState("");
  const [bookingLoading, setBookingLoading] = useState(false);
  const [bookError, setBookError] = useState("");

  // Reschedule Modal State
  const [rescheduleApt, setRescheduleApt] = useState(null);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleTime, setRescheduleTime] = useState("");
  const [rescheduleLoading, setRescheduleLoading] = useState(false);
  const [rescheduleError, setRescheduleError] = useState("");
  const [rescheduleAlternatives, setRescheduleAlternatives] = useState([]);

  // Cancel Confirmation Modal State
  const [cancelModalApt, setCancelModalApt] = useState(null);
  const [cancelLoading, setCancelLoading] = useState(false);

  // Status Action Loading State
  const [statusActionLoadingId, setStatusActionLoadingId] = useState(null);
  const [statusActionError, setStatusActionError] = useState("");

  // Filtered Appointments
  const filteredAppointments = appointments.filter((apt) => {
    const patientName = apt.patient?.name?.toLowerCase() || "";
    const doctorName = apt.doctor?.name?.toLowerCase() || "";
    const matchesSearch =
      patientName.includes(searchTerm.toLowerCase()) ||
      doctorName.includes(searchTerm.toLowerCase());

    const isPending = apt.isAttendancePending || isAppointmentAttendancePending(apt);

    let matchesStatus = true;
    if (statusFilter === "ATTENDANCE_PENDING") {
      matchesStatus = isPending;
    } else if (statusFilter !== "ALL") {
      matchesStatus = apt.status === statusFilter;
    }

    const matchesDoctor =
      doctorFilter === "ALL" || apt.doctorId === Number(doctorFilter);

    let matchesDate = true;
    if (dateFilter) {
      const aptDateStr = new Date(apt.appointmentDate).toISOString().split("T")[0];
      matchesDate = aptDateStr === dateFilter;
    }

    return matchesSearch && matchesStatus && matchesDoctor && matchesDate;
  });

  const handleCreateAppointment = async (e) => {
    e.preventDefault();
    setBookingLoading(true);
    setBookError("");

    try {
      await api.createAppointment({
        patientId: Number(bookPatientId),
        doctorId: Number(bookDoctorId),
        appointmentDate: bookDate,
        startTime: bookTime,
        reason: bookReason,
      });

      onCloseBookModal();
      onRefresh();
      setBookPatientId("");
      setBookDoctorId("");
      setBookDate("");
      setBookTime("");
      setBookReason("");
    } catch (err) {
      setBookError(err.message);
    } finally {
      setBookingLoading(false);
    }
  };

  const handleRescheduleSubmit = async (e) => {
    e.preventDefault();
    if (!rescheduleApt) return;
    setRescheduleLoading(true);
    setRescheduleError("");
    setRescheduleAlternatives([]);

    try {
      await api.rescheduleAppointment(rescheduleApt.id, {
        newDate: rescheduleDate,
        newTime: rescheduleTime,
      });

      setRescheduleApt(null);
      onRefresh();
    } catch (err) {
      setRescheduleError(err.message);
      if (err.alternatives) {
        setRescheduleAlternatives(err.alternatives);
      }
    } finally {
      setRescheduleLoading(false);
    }
  };

  const handleCancelSubmit = async () => {
    if (!cancelModalApt) return;
    setCancelLoading(true);

    try {
      await api.cancelAppointment(cancelModalApt.id);
      setCancelModalApt(null);
      onRefresh();
    } catch (err) {
      alert("Failed to cancel appointment: " + err.message);
    } finally {
      setCancelLoading(false);
    }
  };

  const handleUpdateStatus = async (appointmentId, newStatus) => {
    setStatusActionLoadingId(appointmentId);
    setStatusActionError("");

    try {
      await api.updateAppointmentStatus(appointmentId, newStatus);
      onRefresh();
    } catch (err) {
      setStatusActionError(err.message || `Failed to update status to ${newStatus}`);
    } finally {
      setStatusActionLoadingId(null);
    }
  };

  const handleResetFilters = () => {
    updateAppointmentState({
      search: "",
      statusFilter: "ALL",
      doctorFilter: "ALL",
      dateFilter: "",
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* Header Bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h2 style={{ fontSize: "1.4rem", fontWeight: "800", color: "#0f172a" }}>
            Hospital Appointments Directory
          </h2>
          <p style={{ color: "#64748b", fontSize: "0.85rem", marginTop: "2px" }}>
            Schedule, track patient attendance, confirm, reschedule, or cancel appointments
          </p>
        </div>

        <button className="btn btn-primary" onClick={onOpenBookModal}>
          <Plus size={16} />
          Book Appointment
        </button>
      </div>

      {statusActionError && (
        <div style={{
          padding: "12px 16px",
          borderRadius: "var(--radius-sm)",
          background: "#fef2f2",
          border: "1px solid #fecaca",
          color: "#b91c1c",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.88rem", fontWeight: "600" }}>
            <AlertCircle size={18} />
            {statusActionError}
          </div>
          <button className="btn-icon" onClick={() => setStatusActionError("")}>
            <X size={16} />
          </button>
        </div>
      )}

      {/* Filter and Search Toolbar */}
      <div className="glass-card" style={{ padding: "16px 20px", display: "flex", gap: "14px", flexWrap: "wrap", alignItems: "center" }}>
        {/* Search */}
        <div style={{ flex: "1 1 220px", position: "relative" }}>
          <Search size={16} color="#94a3b8" style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)" }} />
          <input 
            type="text"
            placeholder="Search patient or doctor..."
            className="form-input"
            style={{ paddingLeft: "36px" }}
            value={searchTerm}
            onChange={(e) => updateAppointmentState({ search: e.target.value })}
          />
        </div>

        {/* Status Filter */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <Filter size={15} color="#64748b" />
          <select 
            className="form-select"
            value={statusFilter}
            onChange={(e) => updateAppointmentState({ statusFilter: e.target.value })}
            style={{ width: "175px" }}
          >
            <option value="ALL">All Statuses</option>
            <option value="ATTENDANCE_PENDING">Needs Review</option>
            <option value="BOOKED">Scheduled (Booked)</option>
            <option value="CONFIRMED">Confirmed</option>
            <option value="COMPLETED">Completed</option>
            <option value="NO_SHOW">No-Show</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
        </div>

        {/* Doctor Filter */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <UserCheck size={15} color="#64748b" />
          <select 
            className="form-select"
            value={doctorFilter}
            onChange={(e) => updateAppointmentState({ doctorFilter: e.target.value })}
            style={{ width: "180px" }}
          >
            <option value="ALL">All Doctors</option>
            {doctors.map((doc) => (
              <option key={doc.id} value={doc.id}>
                {formatDoctorName(doc.name)}
              </option>
            ))}
          </select>
        </div>

        {/* Date Filter */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <CalendarDays size={15} color="#64748b" />
          <input 
            type="date"
            className="form-input"
            style={{ width: "150px" }}
            value={dateFilter}
            onChange={(e) => updateAppointmentState({ dateFilter: e.target.value })}
          />
        </div>

        {/* Reset Filters */}
        {(searchTerm || statusFilter !== "ALL" || doctorFilter !== "ALL" || dateFilter) && (
          <button 
            className="btn btn-secondary"
            onClick={handleResetFilters}
            style={{ padding: "8px 12px", fontSize: "0.8rem", display: "flex", alignItems: "center", gap: "6px" }}
          >
            <RotateCcw size={14} /> Clear
          </button>
        )}
      </div>

      {/* Appointments Data Table */}
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
                <th style={{ padding: "14px 20px" }}>Patient</th>
                <th style={{ padding: "14px 20px" }}>Doctor</th>
                <th style={{ padding: "14px 20px" }}>Date & Time</th>
                <th style={{ padding: "14px 20px" }}>Reason</th>
                <th style={{ padding: "14px 20px" }}>Status</th>
                <th style={{ padding: "14px 20px", textAlign: "right" }}>Staff Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredAppointments.length === 0 ? (
                <tr>
                  <td colSpan="7" style={{ padding: "48px 20px", textAlign: "center", color: "#94a3b8" }}>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "10px" }}>
                      <CalendarDays size={32} color="#cbd5e1" />
                      <div style={{ fontWeight: "600", color: "#475569" }}>No appointments found</div>
                      <div style={{ fontSize: "0.82rem" }}>
                        Try adjusting your search criteria or date filter, or book a new appointment.
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredAppointments.map((apt) => {
                  const dateFormatted = new Date(apt.appointmentDate).toISOString().split("T")[0];
                  const statusCfg = getStatusConfig(apt.status);
                  const isPending = apt.isAttendancePending || isAppointmentAttendancePending(apt);
                  const isActionLoading = statusActionLoadingId === apt.id;

                  return (
                    <tr key={apt.id} style={{
                      borderBottom: "1px solid #e2e8f0",
                      background: isPending ? "#fffdf5" : "transparent",
                      transition: "background 0.15s"
                    }}>
                      <td style={{ padding: "14px 20px", fontFamily: "var(--font-mono)", color: "#64748b", fontSize: "0.85rem" }}>
                        #{apt.id}
                      </td>

                      <td style={{ padding: "14px 20px" }}>
                        <div style={{ fontWeight: "700", color: "#0f172a", fontSize: "0.92rem" }}>
                          {apt.patient?.name || `Patient #${apt.patientId}`}
                        </div>
                        <div style={{ fontSize: "0.75rem", color: "#64748b" }}>
                          {apt.patient?.phone}
                        </div>
                      </td>

                      <td style={{ padding: "14px 20px" }}>
                        <div style={{ fontWeight: "600", color: "#0284c7", fontSize: "0.9rem" }}>
                          {formatDoctorName(apt.doctor?.name)}
                        </div>
                        <div style={{ fontSize: "0.75rem", color: "#64748b" }}>
                          {apt.doctor?.specialization}
                        </div>
                      </td>

                      <td style={{ padding: "14px 20px" }}>
                        <div style={{ fontWeight: "600", color: "#0f172a", fontSize: "0.88rem" }}>
                          {formatDate(apt.appointmentDate)}
                        </div>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.8rem", color: "#0284c7", fontWeight: "700" }}>
                          {apt.startTime}
                        </div>
                      </td>

                      <td style={{ padding: "14px 20px", fontSize: "0.85rem", color: "#475569" }}>
                        {apt.reason || "General Consultation"}
                      </td>

                      <td style={{ padding: "14px 20px" }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: "4px", alignItems: "flex-start" }}>
                          <span style={{
                            fontSize: "0.75rem",
                            padding: "3px 10px",
                            borderRadius: "99px",
                            fontWeight: "700",
                            border: "1px solid",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "5px"
                          }} className={statusCfg.bg}>
                            <span style={{ width: "6px", height: "6px", borderRadius: "50%" }} className={statusCfg.dot} />
                            {statusCfg.label}
                          </span>

                          {isPending && (
                            <span style={{
                              fontSize: "0.7rem",
                              padding: "2px 6px",
                              borderRadius: "4px",
                              background: "#fef3c7",
                              color: "#b45309",
                              border: "1px solid #fde68a",
                              fontWeight: "700",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "3px"
                            }}>
                              <AlertTriangle size={11} /> Needs Review
                            </span>
                          )}
                        </div>
                      </td>

                      <td style={{ padding: "14px 20px", textAlign: "right" }}>
                        <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end", flexWrap: "wrap" }}>
                          {/* Attendance Actions: available for active BOOKED / CONFIRMED appointments */}
                          {(apt.status === "BOOKED" || apt.status === "CONFIRMED") && (
                            <>
                              <button 
                                className="btn"
                                style={{
                                  padding: "4px 9px",
                                  fontSize: "0.75rem",
                                  background: "#ecfdf5",
                                  border: "1px solid #a7f3d0",
                                  color: "#047857",
                                  fontWeight: "700"
                                }}
                                disabled={isActionLoading}
                                onClick={() => handleUpdateStatus(apt.id, "COMPLETED")}
                                title="Mark patient as attended and completed"
                              >
                                Completed
                              </button>

                              <button 
                                className="btn"
                                style={{
                                  padding: "4px 9px",
                                  fontSize: "0.75rem",
                                  background: "#fff7ed",
                                  border: "1px solid #fed7aa",
                                  color: "#c2410c",
                                  fontWeight: "700"
                                }}
                                disabled={isActionLoading}
                                onClick={() => handleUpdateStatus(apt.id, "NO_SHOW")}
                                title="Mark patient as no-show"
                              >
                                No-Show
                              </button>

                              {apt.status === "BOOKED" && (
                                <button 
                                  className="btn"
                                  style={{
                                    padding: "4px 9px",
                                    fontSize: "0.75rem",
                                    background: "#f0fdf4",
                                    border: "1px solid #bbf7d0",
                                    color: "#15803d",
                                    fontWeight: "600"
                                  }}
                                  disabled={isActionLoading}
                                  onClick={() => handleUpdateStatus(apt.id, "CONFIRMED")}
                                  title="Confirm appointment"
                                >
                                  Confirm
                                </button>
                              )}

                              <button 
                                className="btn btn-secondary" 
                                style={{ padding: "4px 9px", fontSize: "0.75rem" }}
                                onClick={() => {
                                  setRescheduleApt(apt);
                                  setRescheduleDate(dateFormatted);
                                  setRescheduleTime(apt.startTime);
                                  setRescheduleError("");
                                }}
                              >
                                Reschedule
                              </button>

                              <button 
                                className="btn btn-danger" 
                                style={{ padding: "4px 9px", fontSize: "0.75rem" }}
                                onClick={() => setCancelModalApt(apt)}
                              >
                                Cancel
                              </button>
                            </>
                          )}

                          {apt.status === "COMPLETED" && (
                            <span style={{ fontSize: "0.75rem", color: "#059669", fontWeight: "600", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                              <CheckCircle2 size={14} /> Attended
                            </span>
                          )}

                          {apt.status === "NO_SHOW" && (
                            <span style={{ fontSize: "0.75rem", color: "#d97706", fontWeight: "600", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                              <XCircle size={14} /> Missed Visit
                            </span>
                          )}

                          {apt.status === "CANCELLED" && (
                            <span style={{ fontSize: "0.75rem", color: "#94a3b8", fontWeight: "600" }}>
                              Cancelled
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Booking Modal */}
      {isBookModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <h3 style={{ fontSize: "1.2rem", fontWeight: "700", color: "#0f172a" }}>Book Hospital Appointment</h3>
              <button className="btn-icon" onClick={onCloseBookModal}><X size={18} /></button>
            </div>

            {bookError && (
              <div style={{
                padding: "10px 14px", borderRadius: "var(--radius-sm)",
                background: "#fef2f2", border: "1px solid #fecaca",
                color: "#b91c1c", fontSize: "0.83rem", marginBottom: "14px"
              }}>
                {bookError}
              </div>
            )}

            <form onSubmit={handleCreateAppointment}>
              <div className="form-group">
                <label className="form-label">Patient</label>
                <select 
                  className="form-select"
                  value={bookPatientId}
                  onChange={(e) => setBookPatientId(e.target.value)}
                  required
                >
                  <option value="">Select Patient...</option>
                  {patients.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.phone})
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Doctor</label>
                <select 
                  className="form-select"
                  value={bookDoctorId}
                  onChange={(e) => setBookDoctorId(e.target.value)}
                  required
                >
                  <option value="">Select Doctor...</option>
                  {doctors.map((d) => (
                    <option key={d.id} value={d.id}>
                      {formatDoctorName(d.name)} ({d.specialization})
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Appointment Date</label>
                <input 
                  type="date"
                  className="form-input"
                  value={bookDate}
                  onChange={(e) => setBookDate(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Time Slot</label>
                <select 
                  className="form-select"
                  value={bookTime}
                  onChange={(e) => setBookTime(e.target.value)}
                  required
                >
                  <option value="">Select Time Slot...</option>
                  <optgroup label="Morning Shift (10:00 AM - 01:30 PM)">
                    {MORNING_SLOTS.map((slot) => (
                      <option key={slot} value={slot}>
                        {formatSlotLabel(slot)}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="Evening Shift (04:00 PM - 07:30 PM)">
                    {EVENING_SLOTS.map((slot) => (
                      <option key={slot} value={slot}>
                        {formatSlotLabel(slot)}
                      </option>
                    ))}
                  </optgroup>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Reason / Symptoms (Optional)</label>
                <input 
                  type="text"
                  placeholder="e.g. Fever, Consultation, Follow-up"
                  className="form-input"
                  value={bookReason}
                  onChange={(e) => setBookReason(e.target.value)}
                />
              </div>

              <div style={{ display: "flex", gap: "10px", marginTop: "20px" }}>
                <button type="button" className="btn btn-secondary" onClick={onCloseBookModal} style={{ flex: 1 }}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={bookingLoading} style={{ flex: 1 }}>
                  {bookingLoading ? "Scheduling..." : "Confirm Booking"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reschedule Modal */}
      {rescheduleApt && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <h3 style={{ fontSize: "1.2rem", fontWeight: "700", color: "#0f172a" }}>
                Reschedule Appointment #{rescheduleApt.id}
              </h3>
              <button className="btn-icon" onClick={() => setRescheduleApt(null)}><X size={18} /></button>
            </div>

            <div style={{
              padding: "10px 14px",
              background: "#f0f9ff",
              border: "1px solid #bae6fd",
              borderRadius: "var(--radius-sm)",
              fontSize: "0.85rem",
              color: "#0369a1",
              marginBottom: "14px"
            }}>
              Patient: <strong>{rescheduleApt.patient?.name}</strong> • Doctor: <strong>{formatDoctorName(rescheduleApt.doctor?.name)}</strong>
            </div>

            {rescheduleError && (
              <div style={{
                padding: "10px 14px", borderRadius: "var(--radius-sm)",
                background: "#fef2f2", border: "1px solid #fecaca",
                color: "#b91c1c", fontSize: "0.83rem", marginBottom: "14px"
              }}>
                {rescheduleError}
              </div>
            )}

            {rescheduleAlternatives && rescheduleAlternatives.length > 0 && (
              <div style={{
                padding: "10px 14px", borderRadius: "var(--radius-sm)",
                background: "#fffbeb", border: "1px solid #fde68a",
                fontSize: "0.83rem", marginBottom: "14px"
              }}>
                <div style={{ fontWeight: "700", color: "#b45309", marginBottom: "6px" }}>
                  Alternative Available Slots:
                </div>
                <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                  {rescheduleAlternatives.map((alt, i) => (
                    <button
                      key={i}
                      type="button"
                      className="btn btn-secondary"
                      style={{ padding: "3px 8px", fontSize: "0.75rem", fontFamily: "var(--font-mono)" }}
                      onClick={() => setRescheduleTime(alt)}
                    >
                      {alt}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <form onSubmit={handleRescheduleSubmit}>
              <div className="form-group">
                <label className="form-label">New Date</label>
                <input 
                  type="date"
                  className="form-input"
                  value={rescheduleDate}
                  onChange={(e) => setRescheduleDate(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">New Time Slot</label>
                <select 
                  className="form-select"
                  value={rescheduleTime}
                  onChange={(e) => setRescheduleTime(e.target.value)}
                  required
                >
                  <option value="">Select Time Slot...</option>
                  <optgroup label="Morning Shift (10:00 AM - 01:30 PM)">
                    {MORNING_SLOTS.map((slot) => (
                      <option key={slot} value={slot}>
                        {formatSlotLabel(slot)}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="Evening Shift (04:00 PM - 07:30 PM)">
                    {EVENING_SLOTS.map((slot) => (
                      <option key={slot} value={slot}>
                        {formatSlotLabel(slot)}
                      </option>
                    ))}
                  </optgroup>
                </select>
              </div>

              <div style={{ display: "flex", gap: "10px", marginTop: "20px" }}>
                <button type="button" className="btn btn-secondary" onClick={() => setRescheduleApt(null)} style={{ flex: 1 }}>
                  Back
                </button>
                <button type="submit" className="btn btn-primary" disabled={rescheduleLoading} style={{ flex: 1 }}>
                  {rescheduleLoading ? "Updating..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Cancel Confirmation Modal */}
      {cancelModalApt && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: "440px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#b91c1c", fontWeight: "700", fontSize: "1.1rem" }}>
                <AlertTriangle size={20} />
                Cancel Appointment
              </div>
              <button className="btn-icon" onClick={() => setCancelModalApt(null)}><X size={18} /></button>
            </div>

            <p style={{ fontSize: "0.88rem", color: "#475569", lineHeight: 1.5, marginBottom: "16px" }}>
              Are you sure you want to cancel appointment <strong>#{cancelModalApt.id}</strong> for <strong>{cancelModalApt.patient?.name}</strong> with <strong>{formatDoctorName(cancelModalApt.doctor?.name)}</strong> on <strong>{formatDate(cancelModalApt.appointmentDate)}</strong> at <strong>{cancelModalApt.startTime}</strong>?
            </p>

            <div style={{
              padding: "10px 14px",
              background: "#fef2f2",
              border: "1px solid #fecaca",
              borderRadius: "var(--radius-sm)",
              color: "#991b1b",
              fontSize: "0.8rem",
              marginBottom: "20px"
            }}>
              This action will release the slot and mark the appointment status as Cancelled.
            </div>

            <div style={{ display: "flex", gap: "10px" }}>
              <button 
                type="button" 
                className="btn btn-secondary" 
                onClick={() => setCancelModalApt(null)} 
                style={{ flex: 1 }}
                disabled={cancelLoading}
              >
                No, Keep It
              </button>
              <button 
                type="button" 
                className="btn btn-danger" 
                onClick={handleCancelSubmit} 
                style={{ flex: 1 }}
                disabled={cancelLoading}
              >
                {cancelLoading ? "Cancelling..." : "Yes, Cancel"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
