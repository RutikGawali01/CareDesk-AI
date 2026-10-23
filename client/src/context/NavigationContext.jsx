import React, { createContext, useContext, useState, useEffect, useCallback } from "react";

const NavigationContext = createContext(null);

const PATH_TO_TAB = {
  "/": "overview",
  "/dashboard": "overview",
  "/overview": "overview",
  "/appointments": "appointments",
  "/doctors": "doctors",
  "/patients": "patients",
  "/ai-assistant": "ai-assistant",
  "/privacy-policy": "privacy-policy",
};

const TAB_TO_PATH = {
  overview: "/",
  dashboard: "/",
  appointments: "/appointments",
  doctors: "/doctors",
  patients: "/patients",
  "ai-assistant": "/ai-assistant",
  "privacy-policy": "/privacy-policy",
};

export function NavigationProvider({ children }) {
  // Initialize tab based on initial window.location.pathname
  const [activeTab, setActiveTab] = useState(() => {
    const path = window.location.pathname.toLowerCase().replace(/\/$/, "") || "/";
    return PATH_TO_TAB[path] || "overview";
  });

  // Copilot drawer open state across navigation
  const [isCopilotOpen, setIsCopilotOpen] = useState(false);

  // Preserve search queries, filters, and page states across navigation
  const [appointmentState, setAppointmentState] = useState({
    search: "",
    statusFilter: "ALL",
    dateFilter: "",
    doctorFilter: "ALL",
  });

  const [doctorState, setDoctorState] = useState({
    search: "",
    specializationFilter: "ALL",
  });

  const [patientState, setPatientState] = useState({
    search: "",
  });

  // Handle browser back and forward button clicks
  useEffect(() => {
    const handlePopState = () => {
      const path = window.location.pathname.toLowerCase().replace(/\/$/, "") || "/";
      const matchedTab = PATH_TO_TAB[path] || "dashboard";
      setActiveTab(matchedTab);
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const navigate = useCallback((tab, { replace = false } = {}) => {
    const validTab = TAB_TO_PATH[tab] ? tab : "dashboard";
    const path = TAB_TO_PATH[validTab] || "/";

    if (window.location.pathname !== path) {
      if (replace) {
        window.history.replaceState({ tab: validTab }, "", path);
      } else {
        window.history.pushState({ tab: validTab }, "", path);
      }
    }

    setActiveTab(validTab);
  }, []);

  const updateAppointmentState = useCallback((updates) => {
    setAppointmentState((prev) => ({ ...prev, ...updates }));
  }, []);

  const updateDoctorState = useCallback((updates) => {
    setDoctorState((prev) => ({ ...prev, ...updates }));
  }, []);

  const updatePatientState = useCallback((updates) => {
    setPatientState((prev) => ({ ...prev, ...updates }));
  }, []);

  const toggleCopilot = useCallback((open) => {
    setIsCopilotOpen((prev) => (typeof open === "boolean" ? open : !prev));
  }, []);

  const value = {
    activeTab,
    navigate,
    isCopilotOpen,
    toggleCopilot,
    appointmentState,
    updateAppointmentState,
    doctorState,
    updateDoctorState,
    patientState,
    updatePatientState,
  };

  return (
    <NavigationContext.Provider value={value}>
      {children}
    </NavigationContext.Provider>
  );
}

export function useNavigation() {
  const context = useContext(NavigationContext);
  if (!context) {
    throw new Error("useNavigation must be used within a NavigationProvider");
  }
  return context;
}
