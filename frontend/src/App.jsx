import { useEffect, useRef, useCallback } from "react";
import { useDispatch, useSelector } from "react-redux";
import { loadResumes, uploadNewResume } from "./store/resumesSlice";
import {
  setInput,
  sendQuestion,
  loadSessionMessages,
  clearChat,
} from "./store/chatSlice";
import {
  deleteSession,
  setActiveSession,
  upsertSession,
} from "./store/sessionsSlice";

// ── Icons ──────────────────────────────────────────────────────────────────────
const IconTrash = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6l-1 14H6L5 6" />
    <path d="M10 11v6" /><path d="M14 11v6" />
    <path d="M9 6V4h6v2" />
  </svg>
);
const IconSend = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="22" y1="2" x2="11" y2="13" />
    <polygon points="22 2 15 22 11 13 2 9 22 2" />
  </svg>
);
const IconMsg = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);
const IconPlus = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);
const IconPaperclip = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
  </svg>
);

// ── SessionRow ─────────────────────────────────────────────────────────────────
function SessionRow({ session, isActive, onSelect, onDelete }) {
  return (
    <div className={`group relative flex items-center rounded-lg transition-colors ${
      isActive ? "bg-accent-light" : "hover:bg-surface-hover"
    }`}>
      <button
        className="flex-1 min-w-0 px-3 py-2 text-left flex flex-col gap-0.5 bg-transparent border-none cursor-pointer"
        onClick={() => onSelect(session)}
      >
        <span className="flex items-center gap-2 text-[0.8rem] truncate font-mono">
          <span className={`shrink-0 ${isActive ? "text-accent" : "text-ink-muted"}`}>
            <IconMsg />
          </span>
          <span className="truncate font-bold text-[#080a0e]">{session.title}</span>
        </span>
        {session.message_count != null && (
          <span className="text-[0.65rem] text-ink-muted pl-5">
            {session.message_count} msgs
          </span>
        )}
      </button>

      <button
        className="opacity-0 group-hover:opacity-100 mr-2 shrink-0 w-6 h-6 flex items-center justify-center rounded bg-transparent border-none text-ink-muted hover:text-err hover:bg-red-50 cursor-pointer transition-all"
        title="Delete"
        onClick={(e) => { e.stopPropagation(); onDelete(session.id); }}
      >
        <IconTrash />
      </button>
    </div>
  );
}

// ── App ────────────────────────────────────────────────────────────────────────
export default function App() {
  const dispatch     = useDispatch();
  const fileInputRef = useRef(null);

  const resumes      = useSelector((s) => s.resumes.list);
  const loadingList  = useSelector((s) => s.resumes.loadingList);
  const uploading    = useSelector((s) => s.resumes.uploading);
  const uploadStatus = useSelector((s) => s.resumes.uploadStatus);
  const uploadError  = useSelector((s) => s.resumes.uploadError);

  const messages  = useSelector((s) => s.chat.messages);
  const input     = useSelector((s) => s.chat.input);
  const loading   = useSelector((s) => s.chat.loading);
  const error     = useSelector((s) => s.chat.error);
  const sessionId = useSelector((s) => s.chat.sessionId);

  const sessions = useSelector((s) => s.sessions.list);
  const activeId = useSelector((s) => s.sessions.activeId);

  const hasResumes = resumes.length > 0;
  const canSend    = input.trim().length > 0 && !loading && hasResumes;

  const abortRef  = useRef(null);
  const bottomRef = useRef(null);

  // Keep a snapshot of the current conversation in the sessions list so the
  // sidebar stays in sync. We store messages directly on the session object so
  // we can restore them without any backend call.
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  useEffect(() => { dispatch(loadResumes()); }, [dispatch]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  // After each bot reply, persist the conversation into the sessions list.
  useEffect(() => {
    if (!sessionId) return;
    const lastMsg = messages[messages.length - 1];
    if (!lastMsg || lastMsg.role !== "bot") return;

    // Derive a title from the first user message.
    const firstUser = messages.find((m) => m.role === "user");
    const title = firstUser
      ? firstUser.text.slice(0, 40) + (firstUser.text.length > 40 ? "…" : "")
      : "Chat";

    dispatch(upsertSession({
      id:            sessionId,
      title,
      message_count: messages.length,
      messages:      messages,   // store full snapshot for restore
    }));
    dispatch(setActiveSession(sessionId));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, messages.length, dispatch]);

  const handleNewChat = useCallback(() => {
    abortRef.current?.abort();
    dispatch(clearChat());
    dispatch(setActiveSession(null));
  }, [dispatch]);

  // Restore a session from the frontend-only snapshot — no backend call needed.
  const handleSessionClick = useCallback((session) => {
    abortRef.current?.abort();
    dispatch(loadSessionMessages(session));   // session already has .messages[]
    dispatch(setActiveSession(session.id));
  }, [dispatch]);

  const handleDeleteSession = useCallback((id) => {
    dispatch(deleteSession(id));
    if (id === activeId || id === sessionId) dispatch(clearChat());
  }, [dispatch, activeId, sessionId]);

  async function handleUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    await dispatch(uploadNewResume(file));
    e.target.value = "";
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!canSend) return;
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    // Generate a new session id client-side when starting a fresh chat.
    // The backend treats it as an opaque key for its InMemoryChatMessageHistory.
    const sid = sessionId ?? crypto.randomUUID();

    dispatch(sendQuestion({
      question:  input.trim(),
      sessionId: sid,
      signal:    abortRef.current.signal,
    }));
  }

  return (
    <div className="flex h-screen overflow-hidden bg-surface font-mono">

      {/* ══ SIDEBAR ═══════════════════════════════════════════════════════════ */}
      <aside className="w-64 min-w-[256px] flex flex-col bg-white border-r border-border overflow-hidden">

        {/* Logo / branding */}
        <div className="px-4 pt-5 pb-3 shrink-0">
          <span className="text-[0.72rem] font-mono font-medium tracking-widest uppercase text-ink-muted">
            Resume RAG
          </span>
        </div>

        {/* New chat */}
        <div className="px-3 pb-3 shrink-0">
          <button
            className="flex items-center gap-2 w-full px-3 py-2 rounded-lg border border-border bg-white text-ink text-[0.8rem] cursor-pointer hover:bg-surface-hover transition-colors font-mono"
            onClick={handleNewChat}
          >
            <IconPlus />
            New chat
          </button>
        </div>

        {/* Chats */}
        <p className="px-4 pb-1 pt-1 text-[0.7rem] tracking-widest uppercase text-ink-muted font-medium shrink-0">
          Chats
        </p>
        <div className="flex-1 overflow-y-auto px-2 pb-2 flex flex-col gap-0.5 scroll-thin min-h-0">
          {sessions.length === 0 && (
            <p className="text-[0.75rem] text-ink-muted px-2 py-1.5">No chats yet.</p>
          )}
          {sessions.map((s) => (
            <SessionRow
              key={s.id}
              session={s}
              isActive={s.id === activeId}
              onSelect={handleSessionClick}
              onDelete={handleDeleteSession}
            />
          ))}
        </div>

        {/* Divider */}
        <div className="border-t border-border mx-3 shrink-0" />

        {/* PDFs */}
        <p className="px-4 pt-3 pb-1 text-[0.7rem] tracking-widest uppercase text-ink-muted font-medium shrink-0">
          Indexed PDFs
        </p>
        <div className="px-2 pb-3 flex flex-col gap-0.5 max-h-36 overflow-y-auto scroll-thin shrink-0">
          {loadingList ? (
            <p className="text-[0.75rem] text-ink-muted px-2 py-1">Loading…</p>
          ) : resumes.length === 0 ? (
            <p className="text-[0.75rem] text-ink-muted px-2 py-1">No PDFs uploaded.</p>
          ) : (
            resumes.map((r) => (
              <div key={r} className="flex items-center gap-2 px-3 py-1.5 rounded-md text-[0.78rem]">
                <span className="text-[0.82rem] shrink-0">📄</span>
                <span className="truncate font-bold text-[#080a0e]">{r.replace(/\.pdf$/i, "")}</span>
              </div>
            ))
          )}
        </div>

        {/* Status messages */}
        {(uploadStatus || uploadError || error) && (
          <div className="px-4 pb-3 flex flex-col gap-1 shrink-0">
            {uploadStatus && <p className="text-[0.7rem] text-ok">{uploadStatus}</p>}
            {uploadError  && <p className="text-[0.7rem] text-err">{uploadError}</p>}
            {error        && <p className="text-[0.7rem] text-err">{error}</p>}
          </div>
        )}
      </aside>

      {/* ══ CHAT AREA ═════════════════════════════════════════════════════════ */}
      <main className="flex-1 flex flex-col overflow-hidden bg-surface">

        {/* Header */}
        <header className="h-14 min-h-14 flex items-center px-6 border-b border-border bg-white shrink-0">
          <span className="text-[0.82rem] text-ink font-mono tracking-wide">
            RAG-based Resume Chat
          </span>
        </header>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-4 scroll-thin">
          {messages.length === 0 && (
            <div className="m-auto text-center py-12 px-4">
              <p className="text-[0.8rem] text-ink-muted">
                {hasResumes
                  ? "Ask anything about the indexed PDFs."
                  : "Upload a PDF to get started."}
              </p>
            </div>
          )}

          {messages.map((m) => (
            <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className="max-w-[70%] px-4 py-3">
                <p className="m-0 whitespace-pre-wrap wrap-break-word font-bold text-[0.92rem] leading-relaxed text-[#080a0e]">{m.text}</p>
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="px-4 py-3 flex items-center gap-1.5">
                <span className="dot" />
                <span className="dot" />
                <span className="dot" />
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input bar */}
        <div className="px-6 pb-5 pt-3 border-t border-border bg-white shrink-0">
          <form
            className="flex flex-col bg-white border border-border rounded-2xl shadow-sm overflow-hidden focus-within:border-accent focus-within:shadow-[0_0_0_3px_rgba(37,99,235,0.08)] transition-all"
            onSubmit={handleSubmit}
          >
            <input
              className="w-full px-4 pt-3.5 pb-2 bg-transparent text-ink text-[0.86rem] outline-none placeholder:text-ink-muted disabled:opacity-40 disabled:cursor-not-allowed font-mono"
              type="text"
              placeholder={!hasResumes ? "Upload a PDF first…" : "Ask anything across all PDFs…"}
              value={input}
              onChange={(e) => dispatch(setInput(e.target.value))}
              disabled={loading || !hasResumes}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (canSend) handleSubmit(e);
                }
              }}
            />

            <div className="flex items-center justify-between px-2.5 pb-2.5 pt-1 gap-2">
              {/* Attach */}
              <label className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-ink-muted text-[0.72rem] cursor-pointer select-none transition-colors font-mono ${
                uploading ? "opacity-60 cursor-wait" : "hover:border-accent/50 hover:text-accent hover:bg-accent-light"
              }`}>
                {uploading ? <span className="attach-spinner" /> : <IconPaperclip />}
                <span>{uploading ? "Uploading…" : "Add PDF"}</span>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf"
                  onChange={handleUpload}
                  disabled={uploading}
                  className="hidden"
                />
              </label>

              {/* Send */}
              <button
                className="w-9 h-9 flex items-center justify-center rounded-xl bg-accent text-white shrink-0 cursor-pointer transition-all hover:bg-[#1d4ed8] active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed border-none"
                type="submit"
                disabled={!canSend}
                aria-label="Send"
              >
                {loading ? <span className="spinner" /> : <IconSend />}
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
