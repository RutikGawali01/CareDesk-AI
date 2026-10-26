import React, { useState, useRef, useEffect } from "react";
import { Bot, Send, RefreshCw, Terminal, ArrowRight, Zap, Sun, ShieldCheck, Trash2 } from "lucide-react";
import { api } from "../../services/api";

export function AIAssistantPage({ onRefreshData }) {
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content: "Hello! I am your CareDesk AI Hospital Operations Copilot.\n\nI assist hospital staff in analyzing appointment schedules, verifying doctor availability, querying patient appointments, and staging updates.\n\nHow can I help you manage hospital operations today?"
    }
  ]);
  const [inputMessage, setInputMessage] = useState("");
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [toolLogs, setToolLogs] = useState([]);

  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const handleSendMessage = async (textToSend) => {
    const query = (textToSend || inputMessage).trim();
    if (!query || loading) return;

    const userMsg = { role: "user", content: query };
    setMessages((prev) => [...prev, userMsg]);
    setInputMessage("");
    setLoading(true);

    try {
      const result = await api.sendAIChat(query, history, true);

      setMessages((prev) => [...prev, { role: "assistant", content: result.response }]);
      setHistory(result.messages || []);

      if (result.messages) {
        const toolCalls = result.messages.filter(m => m.role === "tool" || m.tool_calls);
        if (toolCalls.length > 0) {
          setToolLogs((prev) => [...prev, ...toolCalls]);
        }
      }

      if (onRefreshData) {
        onRefreshData();
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `❌ Error: ${err.message || "Failed to communicate with AI service."}` }
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleClearChat = () => {
    setMessages([
      {
        role: "assistant",
        content: "Conversation history cleared. Ready for a new hospital administration session!"
      }
    ]);
    setHistory([]);
    setToolLogs([]);
  };

  const adminScenarios = [
    {
      title: "1. Today's Appointments & Attendance",
      prompt: "Summarize today's appointment schedule and highlight any appointments requiring attendance review.",
      desc: "Checks scheduled visits and attendance pending records"
    },
    {
      title: "2. Doctor Roster & Shift Hours",
      prompt: "List all active hospital doctors, their specializations, and their shift timings.",
      desc: "Triggers list_doctors tool to inspect attending medical staff"
    },
    {
      title: "3. Check Doctor Slot Availability",
      prompt: "Check if any slots are open tomorrow afternoon between 4:00 PM and 6:00 PM.",
      desc: "Triggers check_availability tool with conflict inspection"
    },
    {
      title: "4. Locate Patient Appointment",
      prompt: "Find the upcoming appointment details for patient with phone or name.",
      desc: "Triggers find_patient and find_patient_appointment tools"
    }
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* Header Banner */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{
              padding: "3px 10px", borderRadius: "99px",
              background: "#e0f2fe", color: "#0369a1",
              border: "1px solid #bae6fd",
              fontSize: "0.75rem", fontWeight: "800",
              display: "inline-flex", alignItems: "center", gap: "4px"
            }}>
              <ShieldCheck size={13} color="#0284c7" /> ADMIN COPILOT ENGINE
            </span>
          </div>
          <h2 style={{ fontSize: "1.5rem", fontWeight: "800", color: "#0f172a", marginTop: "4px" }}>
            Hospital Assistant AI Suite
          </h2>
          <p style={{ color: "#64748b", fontSize: "0.88rem" }}>
            Execute authorized hospital scheduling queries and audit automated tool calls
          </p>
        </div>

        <button className="btn btn-secondary" onClick={handleClearChat}>
          <Trash2 size={15} /> Clear History
        </button>
      </div>

      {/* Preset Admin Scenarios Grid */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
        gap: "14px"
      }}>
        {adminScenarios.map((sc, i) => (
          <div 
            key={i} 
            className="glass-card-interactive" 
            onClick={() => handleSendMessage(sc.prompt)}
            style={{ padding: "16px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}
          >
            <div>
              <div style={{ fontSize: "0.85rem", fontWeight: "700", color: "#0284c7", marginBottom: "4px" }}>
                {sc.title}
              </div>
              <p style={{ fontSize: "0.78rem", color: "#64748b" }}>
                {sc.desc}
              </p>
            </div>

            <div style={{
              marginTop: "12px",
              paddingTop: "8px",
              borderTop: "1px solid #e2e8f0",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              fontSize: "0.75rem",
              color: "#0369a1",
              fontWeight: "700"
            }}>
              <span>Run Query</span>
              <ArrowRight size={14} />
            </div>
          </div>
        ))}
      </div>

      {/* Main Workspace Split: Chat Console + Function Log Inspector */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "1fr 340px",
        gap: "24px"
      }}>
        {/* Chat Console */}
        <div className="glass-card" style={{ display: "flex", flexDirection: "column", height: "550px", overflow: "hidden" }}>
          <div style={{
            padding: "14px 20px",
            background: "#f1f7fd",
            borderBottom: "1px solid #dce8f5",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between"
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#0f172a", fontWeight: "700", fontSize: "0.95rem" }}>
              <Bot size={18} color="#0284c7" />
              Hospital Staff Copilot Stream
            </div>
            <span className="badge badge-booked">AUTHENTICATED</span>
          </div>

          <div style={{
            flex: 1,
            padding: "20px",
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            gap: "16px",
            background: "#f8fafc"
          }}>
            {messages.map((msg, idx) => (
              <div 
                key={idx}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: msg.role === "user" ? "flex-end" : "flex-start"
                }}
              >
                <div style={{
                  maxWidth: "80%",
                  padding: "14px 18px",
                  borderRadius: msg.role === "user" 
                    ? "16px 16px 4px 16px" 
                    : "16px 16px 16px 4px",
                  background: msg.role === "user"
                    ? "linear-gradient(135deg, #4a90e2, #3b82f6)"
                    : "#ffffff",
                  color: msg.role === "user" ? "#ffffff" : "#0f172a",
                  fontWeight: msg.role === "user" ? "600" : "400",
                  fontSize: "0.92rem",
                  border: msg.role === "assistant" ? "1px solid #e2e8f0" : "none",
                  boxShadow: msg.role === "assistant" ? "0 1px 3px rgba(0,0,0,0.05)" : "none",
                  whiteSpace: "pre-wrap",
                  lineHeight: 1.5
                }}>
                  {msg.content}
                </div>
                <span style={{ fontSize: "0.7rem", color: "#94a3b8", marginTop: "4px", padding: "0 6px" }}>
                  {msg.role === "user" ? "Hospital Staff" : "Admin Copilot"}
                </span>
              </div>
            ))}

            {loading && (
              <div style={{ display: "flex", alignItems: "center", gap: "10px", color: "#0284c7", fontSize: "0.88rem", padding: "10px" }}>
                <RefreshCw size={16} className="spin" />
                <span>Copilot is querying hospital schedules and database tools...</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div style={{
            padding: "16px 20px",
            background: "#ffffff",
            borderTop: "1px solid #e2e8f0",
            display: "flex",
            gap: "12px"
          }}>
            <input 
              type="text"
              placeholder="Ask the Admin Copilot about schedules, doctors, or appointments..."
              className="form-input"
              style={{ padding: "12px 16px" }}
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
              disabled={loading}
            />
            <button 
              className="btn btn-primary"
              onClick={() => handleSendMessage()}
              disabled={loading || !inputMessage.trim()}
              style={{ padding: "12px 20px" }}
            >
              <Send size={18} />
            </button>
          </div>
        </div>

        {/* Function Calling Inspector Panel */}
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div className="glass-card" style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "14px" }}>
            <h3 style={{ fontSize: "0.95rem", fontWeight: "700", color: "#0f172a", display: "flex", alignItems: "center", gap: "8px" }}>
              <Zap size={16} color="#0284c7" />
              Authorized System Tools
            </h3>
            <p style={{ fontSize: "0.78rem", color: "#64748b" }}>
              The Hospital Assistant operates via authorized backend function tools:
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: "8px", fontSize: "0.78rem", fontFamily: "var(--font-mono)" }}>
              <div style={{ padding: "8px 10px", background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: "var(--radius-sm)", color: "#0284c7" }}>
                • check_availability()
              </div>
              <div style={{ padding: "8px 10px", background: "#ecfdf5", border: "1px solid #a7f3d0", borderRadius: "var(--radius-sm)", color: "#047857" }}>
                • book_appointment()
              </div>
              <div style={{ padding: "8px 10px", background: "#fef3c7", border: "1px solid #fde68a", borderRadius: "var(--radius-sm)", color: "#b45309" }}>
                • reschedule_appointment()
              </div>
              <div style={{ padding: "8px 10px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "var(--radius-sm)", color: "#b91c1c" }}>
                • cancel_appointment()
              </div>
              <div style={{ padding: "8px 10px", background: "#f5f3ff", border: "1px solid #ddd6fe", borderRadius: "var(--radius-sm)", color: "#6d28d9" }}>
                • find_patient_appointment()
              </div>
            </div>
          </div>

          <div className="glass-card" style={{ padding: "20px", flex: 1, display: "flex", flexDirection: "column" }}>
            <h3 style={{ fontSize: "0.95rem", fontWeight: "700", color: "#0f172a", marginBottom: "10px", display: "flex", alignItems: "center", gap: "8px" }}>
              <Terminal size={16} color="#0284c7" />
              Tool Execution Audit
            </h3>

            {toolLogs.length === 0 ? (
              <p style={{ fontSize: "0.78rem", color: "#94a3b8", fontStyle: "italic" }}>
                No tool calls executed in this session yet. Run a scenario above to inspect tool payloads.
              </p>
            ) : (
              <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: "8px", maxHeight: "220px" }}>
                {toolLogs.map((log, i) => (
                  <div key={i} style={{
                    padding: "8px 10px",
                    background: "#f8fafc",
                    borderRadius: "4px",
                    border: "1px solid #e2e8f0",
                    fontFamily: "var(--font-mono)",
                    fontSize: "0.7rem",
                    color: "#0369a1"
                  }}>
                    {log.content || JSON.stringify(log)}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
