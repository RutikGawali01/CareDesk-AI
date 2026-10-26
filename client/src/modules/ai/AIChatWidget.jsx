import React, { useState, useRef, useEffect } from "react";
import { 
  Bot, 
  X, 
  Send, 
  Sun, 
  RefreshCw, 
  Trash2, 
  Clock, 
  Sparkles, 
  RotateCcw,
  ShieldCheck,
  AlertCircle
} from "lucide-react";
import { api } from "../../services/api";

const STARTER_PROMPTS = [
  "Summarize today's appointments and attendance status",
  "Which doctors are available today and what are their slots?",
  "Check free slots for tomorrow afternoon",
  "Find appointments needing attendance review",
];

export function AIChatWidget({ isOpen, onClose, onRefreshData }) {
  const [messages, setMessages] = useState([
    {
      id: "welcome",
      role: "assistant",
      content: "Hello! I am your CareDesk AI Hospital Assistant & Admin Copilot.\n\nI can help you review today's schedule, find open doctor slots, check patient appointments, locate records needing attendance review, and stage appointment updates.\n\nHow can I assist you with hospital operations today?",
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    }
  ]);
  const [inputMessage, setInputMessage] = useState("");
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [lastFailedQuery, setLastFailedQuery] = useState(null);

  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        textareaRef.current?.focus();
      }, 100);
    }
  }, [isOpen]);

  const handleSendMessage = async (textToSend) => {
    const query = (textToSend || inputMessage).trim();
    if (!query || loading) return;

    const timeString = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const userMsg = {
      id: String(Date.now()),
      role: "user",
      content: query,
      timestamp: timeString,
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputMessage("");
    setLoading(true);
    setLastFailedQuery(null);

    try {
      const result = await api.sendAIChat(query, history, true);
      
      const assistantMsg = {
        id: String(Date.now() + 1),
        role: "assistant",
        content: result.response,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };

      setMessages((prev) => [...prev, assistantMsg]);
      setHistory(result.messages || []);

      if (onRefreshData) {
        onRefreshData();
      }
    } catch (err) {
      setLastFailedQuery(query);
      setMessages((prev) => [
        ...prev,
        {
          id: String(Date.now() + 1),
          role: "assistant",
          isError: true,
          content: `Unable to process request: ${err.message || "The AI service is temporarily unavailable. Please try again."}`,
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        }
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleClearChat = () => {
    setMessages([
      {
        id: "cleared",
        role: "assistant",
        content: "Conversation history reset. Ready to assist with hospital operations!",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      }
    ]);
    setHistory([]);
    setLastFailedQuery(null);
  };

  if (!isOpen) return null;

  return (
    <div 
      role="dialog"
      aria-labelledby="copilot-title"
      style={{
        position: "fixed",
        bottom: "24px",
        right: "24px",
        width: "440px",
        height: "620px",
        maxWidth: "calc(100vw - 32px)",
        maxHeight: "calc(100vh - 90px)",
        background: "#ffffff",
        border: "1px solid #bae6fd",
        borderRadius: "var(--radius-lg)",
        boxShadow: "0 20px 50px rgba(15, 23, 42, 0.18), 0 0 0 1px rgba(74, 144, 226, 0.1)",
        display: "flex",
        flexDirection: "column",
        zIndex: 1000,
        overflow: "hidden",
        animation: "slideUp 0.22s ease-out"
      }}
    >
      {/* Widget Header */}
      <div style={{
        padding: "16px 20px",
        background: "linear-gradient(135deg, #0284c7 0%, #0369a1 100%)",
        borderBottom: "1px solid #bae6fd",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        color: "#ffffff"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{
            width: "36px", height: "36px", borderRadius: "10px",
            background: "rgba(255, 255, 255, 0.2)",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 2px 8px rgba(0, 0, 0, 0.1)"
          }}>
            <Bot size={20} color="#ffffff" />
          </div>
          <div>
            <div id="copilot-title" style={{ fontWeight: "800", color: "#ffffff", fontSize: "0.95rem", lineHeight: 1.2 }}>
              Hospital Assistant
            </div>
            <div style={{ fontSize: "0.72rem", color: "#e0f2fe", display: "flex", alignItems: "center", gap: "4px", fontWeight: "600" }}>
              <ShieldCheck size={12} color="#38bdf8" /> Admin Copilot Mode
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <button 
            className="btn-icon" 
            onClick={handleClearChat}
            title="Clear Chat History"
            style={{ background: "rgba(255, 255, 255, 0.15)", border: "none", color: "#fff", padding: "6px" }}
          >
            <Trash2 size={15} />
          </button>

          <button 
            className="btn-icon" 
            onClick={onClose}
            title="Close Assistant"
            style={{ background: "rgba(255, 255, 255, 0.15)", border: "none", color: "#fff", padding: "6px" }}
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Starter Prompts */}
      <div style={{
        padding: "10px 14px",
        background: "#f0f9ff",
        borderBottom: "1px solid #e0f2fe",
        display: "flex",
        gap: "6px",
        overflowX: "auto"
      }}>
        {STARTER_PROMPTS.map((prompt, i) => (
          <button 
            key={i}
            className="btn btn-secondary"
            style={{ 
              padding: "4px 10px", 
              fontSize: "0.72rem", 
              whiteSpace: "nowrap",
              borderRadius: "99px",
              background: "#ffffff",
              border: "1px solid #bae6fd",
              color: "#0369a1",
              fontWeight: "600"
            }}
            onClick={() => handleSendMessage(prompt)}
            disabled={loading}
          >
            <Sparkles size={11} color="#0284c7" />
            {prompt}
          </button>
        ))}
      </div>

      {/* Messages Area */}
      <div style={{
        flex: 1,
        padding: "16px",
        overflowY: "auto",
        display: "flex",
        flexDirection: "column",
        gap: "14px",
        background: "#f8fafc"
      }}>
        {messages.map((msg) => (
          <div 
            key={msg.id}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: msg.role === "user" ? "flex-end" : "flex-start"
            }}
          >
            <div style={{
              maxWidth: "88%",
              padding: "12px 16px",
              borderRadius: msg.role === "user" 
                ? "16px 16px 3px 16px" 
                : "16px 16px 16px 3px",
              background: msg.role === "user"
                ? "linear-gradient(135deg, #0284c7, #0369a1)"
                : msg.isError
                ? "#fef2f2"
                : "#ffffff",
              color: msg.role === "user" ? "#ffffff" : msg.isError ? "#991b1b" : "#0f172a",
              fontWeight: msg.role === "user" ? "600" : "400",
              fontSize: "0.86rem",
              border: msg.role === "user" ? "none" : msg.isError ? "1px solid #fecaca" : "1px solid #e2e8f0",
              boxShadow: msg.role === "assistant" ? "0 1px 3px rgba(0,0,0,0.04)" : "none",
              whiteSpace: "pre-wrap",
              lineHeight: 1.5,
              wordBreak: "break-word"
            }}>
              {msg.content}
            </div>

            <div style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              fontSize: "0.68rem",
              color: "#94a3b8",
              marginTop: "4px",
              padding: "0 4px"
            }}>
              <span>{msg.role === "user" ? "Staff" : "Admin Copilot"}</span>
              {msg.timestamp && (
                <>
                  <span>•</span>
                  <span>{msg.timestamp}</span>
                </>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            color: "#0284c7",
            fontSize: "0.82rem",
            padding: "8px 12px",
            background: "#f0f9ff",
            borderRadius: "var(--radius-sm)",
            width: "fit-content"
          }}>
            <RefreshCw size={14} className="spin" />
            <span>Consulting hospital database...</span>
          </div>
        )}

        {lastFailedQuery && !loading && (
          <div style={{
            padding: "8px 12px",
            background: "#fef2f2",
            border: "1px solid #fecaca",
            borderRadius: "var(--radius-sm)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: "0.78rem"
          }}>
            <span style={{ color: "#b91c1c" }}>Request failed</span>
            <button
              className="btn btn-secondary"
              style={{ padding: "3px 8px", fontSize: "0.72rem" }}
              onClick={() => handleSendMessage(lastFailedQuery)}
            >
              <RotateCcw size={12} /> Retry
            </button>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Bar */}
      <div style={{
        padding: "12px 16px",
        background: "#ffffff",
        borderTop: "1px solid #e2e8f0",
        display: "flex",
        alignItems: "flex-end",
        gap: "10px"
      }}>
        <textarea 
          ref={textareaRef}
          rows={1}
          placeholder="Ask Admin Copilot (Enter to send, Shift+Enter for newline)..."
          className="form-input"
          style={{
            resize: "none",
            minHeight: "40px",
            maxHeight: "100px",
            paddingTop: "9px",
            fontSize: "0.85rem",
            lineHeight: 1.4
          }}
          value={inputMessage}
          onChange={(e) => setInputMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={loading}
        />
        <button 
          className="btn btn-primary"
          onClick={() => handleSendMessage()}
          disabled={loading || !inputMessage.trim()}
          style={{ height: "40px", padding: "0 14px" }}
          title="Send Message"
        >
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}
