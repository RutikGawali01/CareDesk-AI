import React, { useState, useEffect, useCallback } from "react";
import { Sidebar } from "./components/Sidebar";
import { Header } from "./components/Header";
import { Overview } from "./modules/dashboard/Overview";
import { Appointments } from "./modules/appointments/Appointments";
import { Doctors } from "./modules/doctors/Doctors";
import { Patients } from "./modules/patients/Patients";
import { AIChatWidget } from "./modules/ai/AIChatWidget";
import { AIAssistantPage } from "./modules/ai/AIAssistantPage";
import { AuthPage } from "./modules/authentication/AuthPage";
import { Footer } from "./components/Footer";
import { api } from "./services/api";
import { AlertCircle, RefreshCw } from "lucide-react";
import PrivacyPolicy from "./PrivacyPolicy";
import { useNavigation } from "./context/NavigationContext";

export default function App() {
  const { activeTab, navigate, isCopilotOpen, toggleCopilot } = useNavigation();

  // ==========================================
  // AUTHENTICATION STATE
  // ==========================================

  const [admin, setAdmin] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // ==========================================
  // GLOBAL DATA STATE
  // ==========================================

  const [dashboardData, setDashboardData] = useState(null);
  const [doctors, setDoctors] = useState([]);
  const [patients, setPatients] = useState([]);
  const [appointments, setAppointments] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  // ==========================================
  // MODALS STATE
  // ==========================================

  const [isBookModalOpen, setIsBookModalOpen] = useState(false);
  const [isPatientModalOpen, setIsPatientModalOpen] = useState(false);
  const [isDoctorModalOpen, setIsDoctorModalOpen] = useState(false);

  // ==========================================
  // CHECK AUTHENTICATION
  // ==========================================

  const checkAuthentication = useCallback(async () => {
    try {
      const response = await api.getCurrentAdmin();

      setAdmin(response.admin);
      setIsAuthenticated(true);
    } catch (error) {
      console.log("Not authenticated");

      setAdmin(null);
      setIsAuthenticated(false);
    } finally {
      setAuthLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAuthentication();
  }, [checkAuthentication]);

  // ==========================================
  // LOGOUT HANDLER
  // ==========================================

  const handleLogout = async () => {
    try {
      await api.logout();
    } catch (err) {
      console.error("Logout Error:", err);
    } finally {
      setAdmin(null);
      setIsAuthenticated(false);
    }
  };

  // ==========================================
  // FETCH DASHBOARD DATA
  // ==========================================

  const fetchData = useCallback(async (isSilent = false) => {
    if (!isSilent) {
      setRefreshing(true);
    }

    setError(null);

    try {
      const [dashRes, docsRes, patientsRes, aptsRes] =
        await Promise.all([
          api.getDashboardStats().catch(() => null),

          api.getDoctors().catch(() => ({
            doctors: [],
          })),

          api.getPatients().catch(() => ({
            patients: [],
          })),

          api.getAppointments().catch(() => ({
            appointments: [],
          })),
        ]);

      if (dashRes) {
        setDashboardData(dashRes);
      }

      if (docsRes) {
        setDoctors(docsRes.doctors || []);
      }

      if (patientsRes) {
        setPatients(patientsRes.patients || []);
      }

      if (aptsRes) {
        setAppointments(aptsRes.appointments || []);
      }
    } catch (err) {
      console.error("Fetch Data Error:", err);

      if (err.status === 401) {
        setIsAuthenticated(false);
        setAdmin(null);
        setError("Your session has expired. Please sign in again.");
      } else {
        setError(
          "Unable to connect to Express backend server on port 5001. Please ensure the backend is running."
        );
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // ==========================================
  // FETCH DATA ONLY AFTER AUTHENTICATION
  // ==========================================

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    fetchData(true);

    const interval = setInterval(() => {
      fetchData(true);
    }, 15000);

    return () => clearInterval(interval);
  }, [isAuthenticated, fetchData]);

  // ==========================================
  // AUTH LOADING SCREEN
  // ==========================================
    if (window.location.pathname === "/privacy-policy") {
    return <PrivacyPolicy />;
  }

  if (authLoading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
          gap: "14px",
        }}
      >
        <RefreshCw size={32} className="spin" color="#0284c7" />

        <div
          style={{
            fontWeight: "700",
            color: "#0f172a",
            fontSize: "1.1rem",
          }}
        >
          Checking authentication...
        </div>
      </div>
    );
  }

  // ==========================================
  // NOT AUTHENTICATED -> AUTH PAGE
  // ==========================================

  if (!isAuthenticated) {
    return <AuthPage onAuthSuccess={checkAuthentication} />;
  }

  // ==========================================
  // MAIN APPLICATION
  // ==========================================

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      {/* Sidebar Navigation */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={navigate}
      />

      {/* Main App Container */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Sticky Top Header */}
        <Header
          onOpenNewAppointment={() => {
            navigate("appointments");
            setIsBookModalOpen(true);
          }}
          onOpenNewPatient={() => {
            navigate("patients");
            setIsPatientModalOpen(true);
          }}
          onOpenNewDoctor={() => {
            navigate("doctors");
            setIsDoctorModalOpen(true);
          }}
          onOpenAI={() => toggleCopilot(true)}
          onRefresh={() => fetchData(false)}
          isRefreshing={refreshing}
          admin={admin}
          onLogout={handleLogout}
        />

        {/* Content View Container */}
        <main
          style={{
            marginLeft: "260px",
            flex: 1,
            padding: "28px",
            maxWidth: "1400px",
          }}
        >
          {error && (
            <div
              style={{
                padding: "16px 20px",
                marginBottom: "24px",
                borderRadius: "var(--radius-md)",
                background: "#fef2f2",
                border: "1px solid #fecaca",
                color: "#b91c1c",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                }}
              >
                <AlertCircle size={20} />

                <span
                  style={{
                    fontWeight: "600",
                    fontSize: "0.9rem",
                  }}
                >
                  {error}
                </span>
              </div>

              <button
                className="btn btn-secondary"
                onClick={() => fetchData(false)}
              >
                <RefreshCw size={14} /> Retry
              </button>
            </div>
          )}

          {loading ? (
            <div
              style={{
                padding: "80px",
                textAlign: "center",
                color: "#0284c7",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "14px",
              }}
            >
              <RefreshCw size={32} className="spin" />

              <div
                style={{
                  fontWeight: "700",
                  color: "#0f172a",
                  fontSize: "1.1rem",
                }}
              >
                Loading CareDesk Hospital Dashboard...
              </div>
            </div>
          ) : (
            <>
              {activeTab === "overview" && (
                <Overview
                  dashboardData={dashboardData}
                  doctors={doctors}
                  patients={patients}
                  onNavigate={navigate}
                  onOpenNewAppointment={() => {
                    navigate("appointments");
                    setIsBookModalOpen(true);
                  }}
                  onOpenAI={() => toggleCopilot(true)}
                />
              )}

              {activeTab === "appointments" && (
                <Appointments
                  appointments={appointments}
                  doctors={doctors}
                  patients={patients}
                  onRefresh={() => fetchData(true)}
                  onOpenBookModal={() => setIsBookModalOpen(true)}
                  isBookModalOpen={isBookModalOpen}
                  onCloseBookModal={() => setIsBookModalOpen(false)}
                />
              )}

              {activeTab === "doctors" && (
                <Doctors
                  doctors={doctors}
                  onRefresh={() => fetchData(true)}
                  onOpenDoctorModal={() => setIsDoctorModalOpen(true)}
                  isDoctorModalOpen={isDoctorModalOpen}
                  onCloseDoctorModal={() => setIsDoctorModalOpen(false)}
                />
              )}

              {activeTab === "patients" && (
                <Patients
                  patients={patients}
                  onRefresh={() => fetchData(true)}
                  onOpenPatientModal={() => setIsPatientModalOpen(true)}
                  isPatientModalOpen={isPatientModalOpen}
                  onClosePatientModal={() => setIsPatientModalOpen(false)}
                />
              )}

              {activeTab === "ai-assistant" && (
                <AIAssistantPage
                  onRefreshData={() => fetchData(true)}
                />
              )}

              <Footer />
            </>
          )}
        </main>
      </div>

      {/* Floating Hospital Assistant / Admin Copilot Drawer */}
      <AIChatWidget
        isOpen={isCopilotOpen}
        onClose={() => toggleCopilot(false)}
        onRefreshData={() => fetchData(true)}
      />
    </div>
  );
}