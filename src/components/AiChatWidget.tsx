"use client";

import { useEffect, useRef, useState } from "react";
import { askSecurityChat } from "@/app/(dashboard)/ai-assistant/actions";
import { renderMarkdownLite } from "@/lib/markdown-lite";

type Message = { role: "user" | "assistant" | "error"; content: string };

// Sam's avatar. `tone="onDark"` (white robot) is for use on the blue FAB/
// header; `tone="onLight"` (blue robot) is for use on a white/light badge.
function RobotIcon({ size = 22, tone = "onLight" }: { size?: number; tone?: "onLight" | "onDark" }) {
  const bodyColor = tone === "onDark" ? "#ffffff" : "var(--accent-emphasis)";
  const faceColor = tone === "onDark" ? "var(--accent-emphasis)" : "#ffffff";
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="11" y="2.5" width="2" height="3" rx="1" fill={bodyColor} />
      <circle cx="12" cy="2.5" r="1.3" fill={bodyColor} />
      <rect x="2" y="11" width="2.5" height="4.5" rx="1.25" fill={bodyColor} />
      <rect x="19.5" y="11" width="2.5" height="4.5" rx="1.25" fill={bodyColor} />
      <rect x="4.5" y="6.5" width="15" height="13" rx="5" fill={bodyColor} />
      <circle cx="9.3" cy="13.2" r="1.6" fill={faceColor} />
      <circle cx="14.7" cy="13.2" r="1.6" fill={faceColor} />
      <rect x="9" y="16.4" width="6" height="1.7" rx="0.85" fill={faceColor} />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.749.749 0 0 1 1.275.326.749.749 0 0 1-.215.734L9.06 8l3.22 3.22a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215L8 9.06l-3.22 3.22a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M1.72 8.53a.75.75 0 0 1 0-1.06l5.5-5.5a.75.75 0 1 1 1.06 1.06L4.56 6.75H13.5a.75.75 0 0 1 0 1.5H4.56l3.72 3.72a.75.75 0 1 1-1.06 1.06l-5.5-5.5Z" transform="rotate(180 7.61 8)" />
    </svg>
  );
}

// Matches the top-header user menu's avatar (.top-header .avatar) — same
// initials-from-email convention, so "you" look the same in both places.
function initialsFromEmail(email?: string | null) {
  if (!email) return "?";
  return email.slice(0, 2).toUpperCase();
}

function WarningIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M8.22 1.754a.25.25 0 0 0-.44 0L1.698 13.132a.25.25 0 0 0 .22.368h12.164a.25.25 0 0 0 .22-.368Zm-1.763-.707c.659-1.234 2.427-1.234 3.086 0l6.082 11.378A1.75 1.75 0 0 1 14.082 15H1.918a1.75 1.75 0 0 1-1.543-2.575ZM9 11a1 1 0 1 1-2 0 1 1 0 0 1 2 0Zm-.25-5.25a.75.75 0 0 0-1.5 0v2.5a.75.75 0 0 0 1.5 0Z" />
    </svg>
  );
}

export function AiChatWidget({ email }: { email?: string | null }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState("");
  const [isPending, setIsPending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, isPending, open]);

  async function handleAsk() {
    const trimmed = question.trim();
    if (!trimmed || isPending) return;
    setMessages((prev) => [...prev, { role: "user", content: trimmed }]);
    setQuestion("");
    setIsPending(true);
    try {
      const result = await askSecurityChat(trimmed);
      setMessages((prev) => [...prev, { role: "assistant", content: result.answer }]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: "error", content: err instanceof Error ? err.message : "AI request failed" },
      ]);
    } finally {
      setIsPending(false);
    }
  }

  return (
    <>
      {open && (
        <div className="ai-chat-panel" role="dialog" aria-label="Chat with Sam">
          <div className="ai-chat-panel-header">
            <div className="ai-chat-avatar">
              <RobotIcon size={20} tone="onLight" />
            </div>
            <div className="ai-chat-header-text">
              <span className="ai-chat-header-title">Sam</span>
              <span className="ai-chat-header-subtitle">Security Assistant</span>
            </div>
            <button
              type="button"
              className="ai-chat-close-btn"
              aria-label="Close chat with Sam"
              onClick={() => setOpen(false)}
            >
              <CloseIcon />
            </button>
          </div>

          <div className="ai-chat-messages" ref={scrollRef}>
            {messages.length === 0 && (
              <div className="ai-chat-msg-row ai-chat-msg-row-assistant">
                <div className="ai-chat-msg-avatar ai-chat-msg-avatar-assistant">
                  <RobotIcon size={16} tone="onLight" />
                </div>
                <div className="ai-chat-bubble-msg ai-chat-bubble-msg-assistant">
                  Hi, I&apos;m Sam 👋 Ask me about your company&apos;s current
                  security posture — findings, leak checks, and site
                  monitoring.
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`ai-chat-msg-row ai-chat-msg-row-${m.role === "user" ? "user" : "assistant"}`}>
                <div className={`ai-chat-msg-avatar ai-chat-msg-avatar-${m.role}`}>
                  {m.role === "user" ? (
                    initialsFromEmail(email)
                  ) : m.role === "error" ? (
                    <WarningIcon />
                  ) : (
                    <RobotIcon size={16} tone="onLight" />
                  )}
                </div>
                <div className={`ai-chat-bubble-msg ai-chat-bubble-msg-${m.role}`}>
                  {m.role === "assistant" ? renderMarkdownLite(m.content) : m.content}
                </div>
              </div>
            ))}
            {isPending && (
              <div className="ai-chat-msg-row ai-chat-msg-row-assistant">
                <div className="ai-chat-msg-avatar ai-chat-msg-avatar-assistant">
                  <RobotIcon size={16} tone="onLight" />
                </div>
                <div className="ai-chat-bubble-msg ai-chat-bubble-msg-assistant ai-chat-typing">
                  <span />
                  <span />
                  <span />
                </div>
              </div>
            )}
          </div>

          <div className="ai-chat-input-row">
            <input
              style={{ flex: 1 }}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAsk();
              }}
              placeholder="Ask a question…"
              disabled={isPending}
            />
            <button
              type="button"
              className="ai-chat-send-btn"
              aria-label="Send"
              onClick={handleAsk}
              disabled={isPending || !question.trim()}
            >
              <SendIcon />
            </button>
          </div>
        </div>
      )}

      <button
        type="button"
        className="ai-chat-fab"
        aria-label={open ? "Close chat with Sam" : "Chat with Sam"}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? <CloseIcon /> : <RobotIcon size={28} tone="onDark" />}
      </button>
    </>
  );
}
