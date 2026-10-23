import React from "react";
import { 
  LayoutDashboard, 
  CalendarDays, 
  UserCheck, 
  Users, 
  Bot, 
  Sun,
  Activity,
  HeartPulse
} from "lucide-react";

export function Sidebar({ activeTab, setActiveTab }) {
  const mainNavItems = [
    { id: "overview", label: "Dashboard", icon: LayoutDashboard },
    { id: "appointments", label: "Appointments", icon: CalendarDays },
    { id: "doctors", label: "Doctors & Shifts", icon: UserCheck },
    { id: "patients", label: "Patients Directory", icon: Users },
  ];

  const aiNavItems = [
    { id: "ai-assistant", label: "Hospital Assistant AI", icon: Bot, badge: "Copilot" },
  ];

  return (
    <aside style={{
      width: "260px",
      minHeight: "100vh",
      background: "var(--bg-sidebar)",
      borderRight: "1px solid var(--border-color)",
      display: "flex",
      flexDirection: "column",
      padding: "22px 16px",
      position: "fixed",
      top: 0,
      left: 0,
      zIndex: 100
    }}>
      {/* Brand Header */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: "12px",
        padding: "8px 10px",
        marginBottom: "28px"
      }}>
        <div style={{
          width: "44px",
          height: "44px",
          borderRadius: "12px",
          background: "linear-gradient(135deg, #4a90e2, #3b82f6)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 4px 14px rgba(74, 144, 226, 0.3)"
        }}>
          <HeartPulse size={24} color="#ffffff" strokeWidth={2.4} />
        </div>
        <div>
          <h1 style={{
            fontSize: "1.2rem",
            fontWeight: "800",
            letterSpacing: "-0.03em",
            color: "#0f172a",
            lineHeight: 1.1
          }}>
            CareDesk AI
          </h1>
          <span style={{
            fontSize: "0.72rem",
            color: "#0284c7",
            fontWeight: "700",
            display: "flex",
            alignItems: "center",
            gap: "4px",
            marginTop: "2px"
          }}>
            <Sun size={12} color="#f6b40e" fill="#f6b40e" /> AI Hospital Receptionist
          </span>
        </div>
      </div>

      {/* Nav Menu */}
      <div style={{ display: "flex", flexDirection: "column", gap: "20px", flex: 1 }}>
        <div>
          <div style={{
            fontSize: "0.68rem",
            fontWeight: "800",
            color: "#94a3b8",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            padding: "0 12px 8px 12px"
          }}>
            Main Menu
          </div>
          <nav style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            {mainNavItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    padding: "10px 14px",
                    borderRadius: "var(--radius-sm)",
                    border: "none",
                    background: isActive ? "#ffffff" : "transparent",
                    color: isActive ? "#0284c7" : "#475569",
                    fontWeight: isActive ? "700" : "600",
                    fontSize: "0.88rem",
                    cursor: "pointer",
                    textAlign: "left",
                    transition: "all 0.2s ease",
                    boxShadow: isActive ? "0 2px 8px rgba(74, 144, 226, 0.12)" : "none",
                    borderLeft: isActive ? "4px solid #4a90e2" : "4px solid transparent"
                  }}
                >
                  <Icon size={18} color={isActive ? "#0284c7" : "#64748b"} />
                  <span style={{ flex: 1 }}>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        <div>
          <div style={{
            fontSize: "0.68rem",
            fontWeight: "800",
            color: "#94a3b8",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            padding: "0 12px 8px 12px"
          }}>
            Smart Assistant
          </div>
          <nav style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            {aiNavItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    padding: "10px 14px",
                    borderRadius: "var(--radius-sm)",
                    border: "none",
                    background: isActive ? "#ffffff" : "transparent",
                    color: isActive ? "#0284c7" : "#475569",
                    fontWeight: isActive ? "700" : "600",
                    fontSize: "0.88rem",
                    cursor: "pointer",
                    textAlign: "left",
                    transition: "all 0.2s ease",
                    boxShadow: isActive ? "0 2px 8px rgba(74, 144, 226, 0.12)" : "none",
                    borderLeft: isActive ? "4px solid #f6b40e" : "4px solid transparent"
                  }}
                >
                  <Icon size={18} color={isActive ? "#0284c7" : "#64748b"} />
                  <span style={{ flex: 1 }}>{item.label}</span>
                  {item.badge && (
                    <span style={{
                      fontSize: "0.65rem",
                      padding: "2px 7px",
                      borderRadius: "99px",
                      background: "#fffbeb",
                      color: "#b45309",
                      border: "1px solid #fde68a",
                      fontWeight: "700"
                    }}>
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {/* System Status Footer */}
      <div style={{
        padding: "12px 14px",
        background: "#ffffff",
        border: "1px solid var(--border-color)",
        borderRadius: "var(--radius-sm)",
        display: "flex",
        alignItems: "center",
        gap: "10px",
        marginTop: "auto",
        boxShadow: "var(--shadow-sm)"
      }}>
        <div className="live-indicator" />
        <div style={{ fontSize: "0.75rem" }}>
          <div style={{ fontWeight: "700", color: "#0f172a" }}>CareDesk Live Node</div>
          <div style={{ color: "#64748b", fontSize: "0.7rem" }}>Express :5001 • OpenRouter AI</div>
        </div>
      </div>
    </aside>
  );
}
