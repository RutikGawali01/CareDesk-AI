import React, { useState } from "react";
import { 
  Users, 
  Stethoscope, 
  Calendar, 
  CheckCircle2, 
  XCircle, 
  Search, 
  Bot, 
  ArrowUpRight, 
  Clock, 
  AlertCircle,
  Sun,
  TrendingUp,
  ShieldCheck,
  AlertTriangle,
  UserCheck
} from "lucide-react";
import { api } from "../../services/api";
import { MORNING_SLOTS, EVENING_SLOTS, formatSlotLabel } from "../../constants/timeSlots";
import { formatDoctorName, getStatusConfig } from "../../utils/formatters";

export function Overview({ dashboardData, doctors, patients, onNavigate, onOpenNewAppointment, onOpenAI }) {
  const [checkDoctorId, setCheckDoctorId] = useState("");
  const [checkDate, setCheckDate] = useState("");
  const [checkTime, setCheckTime] = useState("10:00");
  const [checkResult, setCheckResult] = useState(null);
  const [checking, setChecking] = useState(false);

  const stats = dashboardData?.stats || {
    totalPatients: 0,
    totalDoctors: 0,
    totalAppointments: 0,
    bookedAppointments: 0,
    confirmedAppointments: 0,
    completedAppointments: 0,
    noShowAppointments: 0,
    cancelledAppointments: 0,
    todayCount: 0,
    upcomingCount: 0,
    attendancePendingCount: 0,
  };

  const todaysAppointments = dashboardData?.todaysAppointments || [];

  const handleCheckSlot = async (e) => {
    e.preventDefault();
    if (!checkDoctorId || !checkDate || !checkTime) return;
    setChecking(true);
    setCheckResult(null);

    try {
      const res = await api.checkAvailability({
        doctorId: Number(checkDoctorId),
        appointmentDate: checkDate,
        startTime: checkTime,
      });
      setCheckResult(res);
    } catch (err) {
      setCheckResult({ available: false, reason: err.message });
    } finally {
      setChecking(false);
    }
  };

  // Helper for initials
  const getInitials = (name) => {
    if (!name) return "P";
    return name.split(" ").map(n => n[0]).slice(0, 2).join("").toUpperCase();
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* Welcome Banner */}
      <div className="glass-card" style={{
        padding: "26px 30px",
        background: "linear-gradient(135deg, #e0f2fe 0%, #f0f9ff 60%, #fffbeb 100%)",
        border: "1px solid #bae6fd",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        boxShadow: "0 4px 20px rgba(186, 230, 253, 0.4)"
      }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
            <Sun size={20} color="#f6b40e" fill="#f6b40e" />
            <span style={{ fontSize: "0.82rem", fontWeight: "800", color: "#0369a1", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              CareDesk AI Hospital Management Hub
            </span>
          </div>
          <h2 style={{ fontSize: "1.55rem", fontWeight: "800", color: "#0f172a" }}>
            Hospital Reception & Schedule Dashboard
          </h2>
          <p style={{ color: "#475569", fontSize: "0.9rem", marginTop: "4px" }}>
            Real-time schedule operations, patient attendance tracking, and administrative AI Copilot.
          </p>
        </div>

        <button 
          className="btn btn-sun"
          onClick={onOpenAI}
          style={{ padding: "12px 24px" }}
        >
          <Bot size={18} />
          Admin Copilot
        </button>
      </div>

      {/* Attendance Pending Alert Banner */}
      {(stats.attendancePendingCount || 0) > 0 && (
        <div style={{
          padding: "16px 20px",
          borderRadius: "var(--radius-md)",
          background: "#fffbeb",
          border: "1px solid #fde68a",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "14px",
          boxShadow: "0 2px 8px rgba(245, 158, 11, 0.08)"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div style={{
              width: "36px", height: "36px", borderRadius: "10px",
              background: "#fef3c7", color: "#b45309",
              display: "flex", alignItems: "center", justifyContent: "center"
            }}>
              <AlertTriangle size={20} />
            </div>
            <div>
              <div style={{ fontWeight: "700", color: "#92400e", fontSize: "0.92rem" }}>
                {stats.attendancePendingCount} Appointment{stats.attendancePendingCount > 1 ? "s" : ""} Require Attendance Review
              </div>
              <div style={{ color: "#b45309", fontSize: "0.8rem", marginTop: "2px" }}>
                Past scheduled appointments remain pending. Please mark patients as Completed or No-Show.
              </div>
            </div>
          </div>

          <button 
            className="btn btn-secondary"
            onClick={() => onNavigate("appointments")}
            style={{ borderColor: "#fcd34d", background: "#ffffff", color: "#92400e", fontWeight: "700" }}
          >
            Review Attendance
          </button>
        </div>
      )}

      {/* Metrics Cards Grid */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
        gap: "16px"
      }}>
        {/* Today's Appointments */}
        <div className="glass-card-interactive" onClick={() => onNavigate("appointments")} style={{ padding: "18px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div style={{
              width: "40px", height: "40px", borderRadius: "10px",
              background: "#e0f2fe", color: "#0284c7",
              display: "flex", alignItems: "center", justifyContent: "center"
            }}>
              <Calendar size={20} />
            </div>
            <span style={{ fontSize: "0.72rem", color: "#0284c7", fontWeight: "700" }}>
              Today
            </span>
          </div>
          <div style={{ marginTop: "14px" }}>
            <span style={{ fontSize: "0.78rem", color: "#64748b", fontWeight: "600" }}>Today's Schedule</span>
            <div style={{ fontSize: "1.7rem", fontWeight: "800", color: "#0f172a", marginTop: "2px" }}>
              {stats.todayCount ?? todaysAppointments.length}
            </div>
          </div>
        </div>

        {/* Upcoming Appointments */}
        <div className="glass-card-interactive" onClick={() => onNavigate("appointments")} style={{ padding: "18px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div style={{
              width: "40px", height: "40px", borderRadius: "10px",
              background: "#ccfbf1", color: "#0d9488",
              display: "flex", alignItems: "center", justifyContent: "center"
            }}>
              <Clock size={20} />
            </div>
            <span style={{ fontSize: "0.72rem", color: "#0d9488", fontWeight: "700" }}>
              Scheduled
            </span>
          </div>
          <div style={{ marginTop: "14px" }}>
            <span style={{ fontSize: "0.78rem", color: "#64748b", fontWeight: "600" }}>Upcoming</span>
            <div style={{ fontSize: "1.7rem", fontWeight: "800", color: "#0f172a", marginTop: "2px" }}>
              {stats.upcomingCount || stats.bookedAppointments}
            </div>
          </div>
        </div>

        {/* Attendance Pending */}
        <div className="glass-card-interactive" onClick={() => onNavigate("appointments")} style={{ padding: "18px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div style={{
              width: "40px", height: "40px", borderRadius: "10px",
              background: "#fef3c7", color: "#b45309",
              display: "flex", alignItems: "center", justifyContent: "center"
            }}>
              <AlertTriangle size={20} />
            </div>
            <span style={{ fontSize: "0.72rem", color: "#b45309", fontWeight: "700" }}>
              Pending
            </span>
          </div>
          <div style={{ marginTop: "14px" }}>
            <span style={{ fontSize: "0.78rem", color: "#64748b", fontWeight: "600" }}>Needs Review</span>
            <div style={{ fontSize: "1.7rem", fontWeight: "800", color: (stats.attendancePendingCount || 0) > 0 ? "#b45309" : "#0f172a", marginTop: "2px" }}>
              {stats.attendancePendingCount || 0}
            </div>
          </div>
        </div>

        {/* Completed */}
        <div className="glass-card" style={{ padding: "18px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div style={{
              width: "40px", height: "40px", borderRadius: "10px",
              background: "#dcfce7", color: "#15803d",
              display: "flex", alignItems: "center", justifyContent: "center"
            }}>
              <CheckCircle2 size={20} />
            </div>
            <span className="badge badge-booked" style={{ background: "#ecfdf5", color: "#047857" }}>Attended</span>
          </div>
          <div style={{ marginTop: "14px" }}>
            <span style={{ fontSize: "0.78rem", color: "#64748b", fontWeight: "600" }}>Completed</span>
            <div style={{ fontSize: "1.7rem", fontWeight: "800", color: "#15803d", marginTop: "2px" }}>
              {stats.completedAppointments || 0}
            </div>
          </div>
        </div>

        {/* No-Shows */}
        <div className="glass-card" style={{ padding: "18px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div style={{
              width: "40px", height: "40px", borderRadius: "10px",
              background: "#ffedd5", color: "#c2410c",
              display: "flex", alignItems: "center", justifyContent: "center"
            }}>
              <XCircle size={20} />
            </div>
            <span style={{ fontSize: "0.72rem", color: "#c2410c", fontWeight: "700" }}>Missed</span>
          </div>
          <div style={{ marginTop: "14px" }}>
            <span style={{ fontSize: "0.78rem", color: "#64748b", fontWeight: "600" }}>No-Shows</span>
            <div style={{ fontSize: "1.7rem", fontWeight: "800", color: "#c2410c", marginTop: "2px" }}>
              {stats.noShowAppointments || 0}
            </div>
          </div>
        </div>

        {/* Cancelled */}
        <div className="glass-card" style={{ padding: "18px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div style={{
              width: "40px", height: "40px", borderRadius: "10px",
              background: "#fee2e2", color: "#b91c1c",
              display: "flex", alignItems: "center", justifyContent: "center"
            }}>
              <XCircle size={20} />
            </div>
            <span className="badge badge-cancelled">Cancelled</span>
          </div>
          <div style={{ marginTop: "14px" }}>
            <span style={{ fontSize: "0.78rem", color: "#64748b", fontWeight: "600" }}>Cancelled</span>
            <div style={{ fontSize: "1.7rem", fontWeight: "800", color: "#b91c1c", marginTop: "2px" }}>
              {stats.cancelledAppointments}
            </div>
          </div>
        </div>

        {/* Total Patients */}
        <div className="glass-card-interactive" onClick={() => onNavigate("patients")} style={{ padding: "18px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div style={{
              width: "40px", height: "40px", borderRadius: "10px",
              background: "#e0f2fe", color: "#0284c7",
              display: "flex", alignItems: "center", justifyContent: "center"
            }}>
              <Users size={20} />
            </div>
            <span style={{ fontSize: "0.72rem", color: "#10b981", fontWeight: "700" }}>Active</span>
          </div>
          <div style={{ marginTop: "14px" }}>
            <span style={{ fontSize: "0.78rem", color: "#64748b", fontWeight: "600" }}>Total Patients</span>
            <div style={{ fontSize: "1.7rem", fontWeight: "800", color: "#0f172a", marginTop: "2px" }}>
              {stats.totalPatients}
            </div>
          </div>
        </div>

        {/* Total Doctors */}
        <div className="glass-card-interactive" onClick={() => onNavigate("doctors")} style={{ padding: "18px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div style={{
              width: "40px", height: "40px", borderRadius: "10px",
              background: "#e0e7ff", color: "#4338ca",
              display: "flex", alignItems: "center", justifyContent: "center"
            }}>
              <Stethoscope size={20} />
            </div>
            <span style={{ fontSize: "0.72rem", color: "#4338ca", fontWeight: "700" }}>Attending</span>
          </div>
          <div style={{ marginTop: "14px" }}>
            <span style={{ fontSize: "0.78rem", color: "#64748b", fontWeight: "600" }}>Hospital Doctors</span>
            <div style={{ fontSize: "1.7rem", fontWeight: "800", color: "#0f172a", marginTop: "2px" }}>
              {stats.totalDoctors}
            </div>
          </div>
        </div>
      </div>

      {/* Main Grid: Today's Appointments + Slot Checker */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "1fr 340px",
        gap: "24px"
      }}>
        {/* Today's Schedule Feed */}
        <div className="glass-card" style={{ padding: "24px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
            <div>
              <h3 style={{ fontSize: "1.1rem", fontWeight: "700", color: "#0f172a" }}>Today's Hospital Appointments</h3>
              <p style={{ fontSize: "0.8rem", color: "#64748b" }}>Live schedule and attendance status of appointments today</p>
            </div>
            <button className="btn btn-secondary" onClick={() => onNavigate("appointments")}>
              View All Appointments
            </button>
          </div>

          {todaysAppointments.length === 0 ? (
            <div style={{
              padding: "40px",
              textAlign: "center",
              color: "#64748b",
              background: "#f8fafc",
              borderRadius: "var(--radius-md)",
              border: "1px dashed #cbd5e1"
            }}>
              <Clock size={36} color="#94a3b8" style={{ marginBottom: "10px" }} />
              <p style={{ fontWeight: "600", fontSize: "0.95rem", color: "#334155" }}>No appointments scheduled for today</p>
              <p style={{ fontSize: "0.8rem", marginTop: "4px" }}>Book an appointment above or use the Admin Copilot.</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {todaysAppointments.map((apt) => {
                const statusCfg = getStatusConfig(apt.status);
                return (
                  <div key={apt.id} style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "14px 18px",
                    background: "#ffffff",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid #e2e8f0",
                    boxShadow: "0 1px 2px rgba(0,0,0,0.03)"
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                      <div style={{
                        width: "40px",
                        height: "40px",
                        borderRadius: "50%",
                        background: "linear-gradient(135deg, #75aadb, #4a90e2)",
                        color: "#fff",
                        fontWeight: "700",
                        fontSize: "0.85rem",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center"
                      }}>
                        {getInitials(apt.patient?.name)}
                      </div>
                      <div>
                        <div style={{ fontWeight: "700", color: "#0f172a", fontSize: "0.95rem" }}>
                          {apt.patient?.name || `Patient #${apt.patientId}`}
                        </div>
                        <div style={{ fontSize: "0.78rem", color: "#64748b", marginTop: "2px" }}>
                          With <span style={{ color: "#0369a1", fontWeight: "600" }}>{formatDoctorName(apt.doctor?.name)}</span> • {apt.reason || "General Consultation"}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <div style={{
                        padding: "6px 12px",
                        background: "#e0f2fe",
                        border: "1px solid #bae6fd",
                        borderRadius: "var(--radius-sm)",
                        fontFamily: "var(--font-mono)",
                        color: "#0284c7",
                        fontWeight: "700",
                        fontSize: "0.85rem"
                      }}>
                        {apt.startTime}
                      </div>

                      {apt.isAttendancePending && (
                        <span style={{
                          fontSize: "0.72rem",
                          padding: "3px 8px",
                          borderRadius: "4px",
                          background: "#fffbeb",
                          color: "#b45309",
                          border: "1px solid #fde68a",
                          fontWeight: "700"
                        }}>
                          Needs Review
                        </span>
                      )}

                      <span style={{
                        fontSize: "0.75rem",
                        padding: "4px 10px",
                        borderRadius: "99px",
                        fontWeight: "700",
                        border: "1px solid",
                      }} className={statusCfg.bg}>
                        {statusCfg.label}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Quick Slot Availability Checker */}
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          <div className="glass-card" style={{ padding: "22px" }}>
            <h3 style={{ fontSize: "1rem", fontWeight: "700", color: "#0f172a", marginBottom: "4px", display: "flex", alignItems: "center", gap: "8px" }}>
              <Search size={16} color="#0284c7" />
              Check Slot Availability
            </h3>
            <p style={{ fontSize: "0.78rem", color: "#64748b", marginBottom: "16px" }}>
              Test doctor schedule availability in real time
            </p>

            <form onSubmit={handleCheckSlot}>
              <div className="form-group">
                <label className="form-label">Doctor</label>
                <select 
                  className="form-select"
                  value={checkDoctorId}
                  onChange={(e) => setCheckDoctorId(e.target.value)}
                  required
                >
                  <option value="">Select Doctor...</option>
                  {doctors.map((doc) => (
                    <option key={doc.id} value={doc.id}>
                      {formatDoctorName(doc.name)} ({doc.specialization})
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Date</label>
                <input 
                  type="date"
                  className="form-input"
                  value={checkDate}
                  onChange={(e) => setCheckDate(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Time Slot</label>
                <select 
                  className="form-select"
                  value={checkTime}
                  onChange={(e) => setCheckTime(e.target.value)}
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

              <button 
                type="submit" 
                className="btn btn-primary" 
                style={{ width: "100%", marginTop: "8px" }}
                disabled={checking}
              >
                {checking ? "Checking..." : "Verify Slot Availability"}
              </button>
            </form>

            {checkResult && (
              <div style={{
                marginTop: "16px",
                padding: "14px",
                borderRadius: "var(--radius-sm)",
                background: checkResult.available ? "#ecfdf5" : "#fef2f2",
                border: `1px solid ${checkResult.available ? "#a7f3d0" : "#fecaca"}`,
                fontSize: "0.83rem"
              }}>
                <div style={{
                  fontWeight: "700",
                  color: checkResult.available ? "#047857" : "#b91c1c",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px"
                }}>
                  {checkResult.available ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                  {checkResult.available ? "Slot Available!" : "Slot Unavailable"}
                </div>
                <div style={{ color: "#475569", marginTop: "4px" }}>
                  {checkResult.reason}
                </div>

                {checkResult.alternatives && checkResult.alternatives.length > 0 && (
                  <div style={{ marginTop: "10px", paddingTop: "8px", borderTop: "1px dashed #cbd5e1" }}>
                    <div style={{ fontWeight: "600", color: "#0f172a" }}>Alternative Available Slots:</div>
                    <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "6px" }}>
                      {checkResult.alternatives.map((alt, i) => (
                        <span key={i} style={{
                          padding: "3px 8px",
                          background: "#e0f2fe",
                          color: "#0369a1",
                          borderRadius: "4px",
                          fontFamily: "var(--font-mono)",
                          fontSize: "0.75rem",
                          fontWeight: "700"
                        }}>
                          {alt}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
