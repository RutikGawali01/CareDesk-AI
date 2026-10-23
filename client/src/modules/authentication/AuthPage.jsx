import React, { useState } from "react";
import { HeartPulse, Sun, Bot, Zap, ShieldCheck } from "lucide-react";
import { Login } from "./Login";
import { Signup } from "./Signup";

export function AuthPage({ onAuthSuccess }) {
  const [activeTab, setActiveTab] = useState("login"); // "login" | "signup"

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "24px 16px",
      background: "var(--bg-main)",
      position: "relative",
    }}>
      {/* Container Box */}
      <div style={{
        width: "100%",
        maxWidth: "1080px",
        display: "grid",
        gridTemplateColumns: "1fr 1.15fr",
        borderRadius: "24px",
        overflow: "hidden",
        boxShadow: "0 25px 50px -12px rgba(15, 23, 42, 0.18), 0 0 0 1px rgba(148, 163, 184, 0.15)",
        background: "#ffffff",
      }}>
        
        {/* Left Side: Brand Showcase & Value Proposition */}
        <div style={{
          background: "linear-gradient(145deg, #0f172a 0%, #1e293b 50%, #0369a1 100%)",
          color: "#ffffff",
          padding: "48px 40px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          position: "relative",
          overflow: "hidden",
        }}>
          {/* Subtle Decorative Ambient Circles */}
          <div style={{
            position: "absolute",
            top: "-80px",
            right: "-80px",
            width: "260px",
            height: "260px",
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(108, 172, 228, 0.25) 0%, transparent 70%)",
            pointerEvents: "none"
          }} />
          <div style={{
            position: "absolute",
            bottom: "-60px",
            left: "-60px",
            width: "240px",
            height: "240px",
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(246, 180, 14, 0.18) 0%, transparent 70%)",
            pointerEvents: "none"
          }} />

          {/* Top Brand Logo */}
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "32px" }}>
              <div style={{
                width: "48px",
                height: "48px",
                borderRadius: "14px",
                background: "linear-gradient(135deg, #4a90e2, #3b82f6)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 6px 16px rgba(59, 130, 246, 0.4)"
              }}>
                <HeartPulse size={28} color="#ffffff" strokeWidth={2.4} />
              </div>
              <div>
                <h1 style={{ fontSize: "1.5rem", fontWeight: "800", letterSpacing: "-0.03em", color: "#ffffff", lineHeight: 1 }}>
                  CareDesk
                </h1>
                <span style={{ fontSize: "0.78rem", color: "#f6b40e", fontWeight: "700", display: "flex", alignItems: "center", gap: "4px", marginTop: "3px" }}>
                  <Sun size={13} color="#f6b40e" fill="#f6b40e" /> AI Receptionist Suite
                </span>
              </div>
            </div>

            <h2 style={{ fontSize: "1.75rem", fontWeight: "800", lineHeight: 1.25, letterSpacing: "-0.02em", color: "#f8fafc", marginBottom: "16px" }}>
              Next-Gen Intelligent Hospital Management
            </h2>

            <p style={{ color: "#94a3b8", fontSize: "0.93rem", lineHeight: 1.6, marginBottom: "36px" }}>
              Streamline appointments, manage patient health records, and integrate 24/7 AI Receptionist automated voice & chat assistance.
            </p>

            {/* Feature Highlights */}
            <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: "14px" }}>
                <div style={{ background: "rgba(56, 189, 248, 0.15)", padding: "8px", borderRadius: "10px", color: "#38bdf8", marginTop: "2px" }}>
                  <Bot size={20} />
                </div>
                <div>
                  <h4 style={{ fontSize: "0.92rem", fontWeight: "700", color: "#e2e8f0" }}>Autonomous AI Receptionist</h4>
                  <p style={{ fontSize: "0.82rem", color: "#94a3b8", marginTop: "2px" }}>Real-time appointment booking & natural conversational query resolution.</p>
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "flex-start", gap: "14px" }}>
                <div style={{ background: "rgba(246, 180, 14, 0.15)", padding: "8px", borderRadius: "10px", color: "#f6b40e", marginTop: "2px" }}>
                  <Zap size={20} />
                </div>
                <div>
                  <h4 style={{ fontSize: "0.92rem", fontWeight: "700", color: "#e2e8f0" }}>Smart Doctor Scheduling</h4>
                  <p style={{ fontSize: "0.82rem", color: "#94a3b8", marginTop: "2px" }}>Real-time slot availability, conflict detection & automated confirmation.</p>
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "flex-start", gap: "14px" }}>
                <div style={{ background: "rgba(52, 211, 153, 0.15)", padding: "8px", borderRadius: "10px", color: "#34d399", marginTop: "2px" }}>
                  <ShieldCheck size={20} />
                </div>
                <div>
                  <h4 style={{ fontSize: "0.92rem", fontWeight: "700", color: "#e2e8f0" }}>Secure Admin Dashboard</h4>
                  <p style={{ fontSize: "0.82rem", color: "#94a3b8", marginTop: "2px" }}>Cookie-based HTTP-only JWT authentication with multi-doctor support.</p>
                </div>
              </div>
            </div>
          </div>

          {/* Footer note */}
          <div style={{ borderTop: "1px solid rgba(255, 255, 255, 0.1)", paddingTop: "20px", marginTop: "40px", display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "0.78rem", color: "#64748b" }}>
            <span>CareDesk v2.4 • Express + Prisma</span>
            <span style={{ display: "flex", alignItems: "center", gap: "6px", color: "#38bdf8", fontWeight: "600" }}>
              <span className="live-indicator" /> System Online
            </span>
          </div>
        </div>

        {/* Right Side: Auth Form Container */}
        <div style={{ padding: "44px 40px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
          
          {/* Tab Switcher */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            background: "#f1f5f9",
            padding: "4px",
            borderRadius: "14px",
            marginBottom: "28px"
          }}>
            <button
              type="button"
              onClick={() => setActiveTab("login")}
              style={{
                padding: "10px",
                border: "none",
                borderRadius: "10px",
                fontSize: "0.9rem",
                fontWeight: activeTab === "login" ? "700" : "600",
                color: activeTab === "login" ? "#0f172a" : "#64748b",
                background: activeTab === "login" ? "#ffffff" : "transparent",
                boxShadow: activeTab === "login" ? "0 2px 8px rgba(0,0,0,0.06)" : "none",
                cursor: "pointer",
                transition: "all 0.2s ease"
              }}
            >
              Sign In
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("signup")}
              style={{
                padding: "10px",
                border: "none",
                borderRadius: "10px",
                fontSize: "0.9rem",
                fontWeight: activeTab === "signup" ? "700" : "600",
                color: activeTab === "signup" ? "#0f172a" : "#64748b",
                background: activeTab === "signup" ? "#ffffff" : "transparent",
                boxShadow: activeTab === "signup" ? "0 2px 8px rgba(0,0,0,0.06)" : "none",
                cursor: "pointer",
                transition: "all 0.2s ease"
              }}
            >
              Register Clinic
            </button>
          </div>

          {/* Form Content */}
          {activeTab === "login" ? (
            <Login onLoginSuccess={onAuthSuccess} />
          ) : (
            <Signup onSignupSuccess={onAuthSuccess} />
          )}

        </div>
      </div>
    </div>
  );
}
