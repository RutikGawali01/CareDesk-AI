import React, { useState, useEffect } from "react";
import { Plus, Bot, Clock, RefreshCw, LogOut, UserCheck, Shield } from "lucide-react";

export function Header({ 
  onOpenNewAppointment, 
  onOpenNewPatient, 
  onOpenNewDoctor,
  onOpenAI, 
  onRefresh, 
  isRefreshing,
  admin,
  onLogout
}) {
  const getHospitalDateTime = () => {
    const now = new Date();
    const dateFormatted = now.toLocaleDateString("en-US", {
      timeZone: "Asia/Kolkata",
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    const timeFormatted = now.toLocaleTimeString("en-US", {
      timeZone: "Asia/Kolkata",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    return { dateFormatted, timeFormatted };
  };

  const [dateTime, setDateTime] = useState(() => getHospitalDateTime());

  useEffect(() => {
    const timer = setInterval(() => {
      setDateTime(getHospitalDateTime());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <header style={{
      marginLeft: "260px",
      height: "70px",
      padding: "0 28px",
      background: "rgba(255, 255, 255, 0.92)",
      backdropFilter: "blur(12px)",
      borderBottom: "1px solid var(--border-color)",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      position: "sticky",
      top: 0,
      zIndex: 90,
      boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)"
    }}>
      {/* Time & Date Badge */}
      <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          color: "#334155",
          fontSize: "0.85rem",
          fontWeight: "600",
          background: "#eaf4fd",
          padding: "6px 14px",
          borderRadius: "var(--radius-full)",
          border: "1px solid #bae6fd"
        }}>
          <Clock size={15} color="#0284c7" />
          <span>{dateTime.dateFormatted}</span>
          <span style={{ color: "#cbd5e1" }}>|</span>
          <span style={{ fontFamily: "var(--font-mono)", color: "#0369a1", fontWeight: "700" }}>{dateTime.timeFormatted}</span>
        </div>

        <button 
          onClick={onRefresh} 
          disabled={isRefreshing}
          className="btn-icon" 
          title="Refresh Data"
        >
          <RefreshCw size={16} className={isRefreshing ? "spin" : ""} color="#475569" />
        </button>
      </div>

      {/* Action Buttons & Admin Profile */}
      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        <button 
          className="btn btn-secondary"
          onClick={onOpenNewDoctor}
        >
          <Plus size={16} />
          New Doctor
        </button>

        <button 
          className="btn btn-secondary"
          onClick={onOpenNewPatient}
        >
          <Plus size={16} />
          New Patient
        </button>

        <button 
          className="btn btn-primary"
          onClick={onOpenNewAppointment}
        >
          <Plus size={16} />
          Book Appointment
        </button>

        <button 
          className="btn btn-sun"
          onClick={onOpenAI}
        >
          <Bot size={17} />
          Admin Copilot
        </button>

        {/* User Profile Pill & Logout */}
        {admin && (
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            paddingLeft: "8px",
            borderLeft: "1px solid var(--border-color)",
            marginLeft: "4px"
          }}>
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "5px 12px",
              background: "#f8fafc",
              border: "1px solid #e2e8f0",
              borderRadius: "var(--radius-full)",
              fontSize: "0.82rem",
            }}>
              <div style={{
                width: "24px",
                height: "24px",
                borderRadius: "50%",
                background: "#0284c7",
                color: "#ffffff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: "700",
                fontSize: "0.75rem"
              }}>
                {admin.name ? admin.name.charAt(0).toUpperCase() : "A"}
              </div>
              <div>
                <div style={{ fontWeight: "700", color: "#0f172a", lineHeight: 1.1 }}>
                  {admin.name || "Hospital Admin"}
                </div>
              </div>
            </div>

            <button
              onClick={onLogout}
              className="btn btn-icon btn-danger"
              style={{ padding: "8px" }}
              title="Sign Out"
            >
              <LogOut size={16} />
            </button>
          </div>
        )}
      </div>
    </header>
  );
}

