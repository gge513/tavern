"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * The one chat surface: DMs, channels, project chat, threads, tavern.
 * Realtime via 2s polling on the message path — the spec allows polling
 * anywhere subscriptions aren't required, and the course production bar is
 * send→appear under 2s / polling ≤5s.
 */

export type ChatMessage = {
  id: number;
  content: string;
  senderKind: "user" | "bartender" | "system";
  structuredType: "question" | "decision" | "blocker" | "help" | "action" | null;
  ownerId: number | null;
  resolved: boolean | null;
  createdAt: string;
  senderId: number | null;
  senderName: string | null;
  senderAvatar: string | null;
  senderIsSeed: boolean | null;
};

const STRUCTURED: {
  key: NonNullable<ChatMessage["structuredType"]>;
  label: string;
  color: string;
}[] = [
  { key: "question", label: "Question", color: "var(--blue)" },
  { key: "decision", label: "Decision", color: "var(--amber)" },
  { key: "blocker", label: "Blocker", color: "var(--red)" },
  { key: "help", label: "Request for help", color: "var(--green)" },
  { key: "action", label: "Action item", color: "var(--text-dim)" },
];

export function Chat(props: {
  conversationId: number;
  currentUserId: number;
  canPost: boolean;
  readOnlyReason?: string;
  showStructured?: boolean;
  members?: { id: number; name: string }[];
  placeholder?: string;
  /** Show a "the bartender considers this" row while a send is in flight. */
  bartenderTyping?: boolean;
  /** One-tap conversation starters rendered above the composer. */
  prompts?: string[];
}) {
  const [msgs, setMsgs] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [structured, setStructured] = useState<ChatMessage["structuredType"]>(null);
  const [owner, setOwner] = useState<number | "">("");
  const [sending, setSending] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const lastIdRef = useRef(0);

  const poll = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/conversations/${props.conversationId}/messages?after=${lastIdRef.current}`,
        { cache: "no-store" }
      );
      if (!res.ok) return;
      const data = (await res.json()) as { messages: ChatMessage[] };
      if (data.messages.length) {
        setMsgs((prev) => {
          const seen = new Set(prev.map((m) => m.id));
          const fresh = data.messages.filter((m) => !seen.has(m.id));
          if (!fresh.length) return prev;
          return [...prev, ...fresh];
        });
        lastIdRef.current = Math.max(
          lastIdRef.current,
          ...data.messages.map((m) => m.id)
        );
      }
      setLoaded(true);
    } catch {}
  }, [props.conversationId]);

  useEffect(() => {
    poll();
    const t = setInterval(poll, 2000);
    return () => clearInterval(t);
  }, [poll]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [msgs.length]);

  async function send() {
    const content = draft.trim();
    if (!content || sending) return;
    setSending(true);
    try {
      const res = await fetch(`/api/conversations/${props.conversationId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content,
          structuredType: structured,
          ownerId: structured === "action" && owner !== "" ? owner : null,
        }),
      });
      if (res.ok) {
        setDraft("");
        setStructured(null);
        setOwner("");
        await poll();
      }
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-col h-[70vh]">
      <div className="flex-1 overflow-y-auto space-y-3 pr-1">
        {!loaded && <p className="text-sm text-dim">Loading…</p>}
        {loaded && msgs.length === 0 && (
          <p className="text-sm text-dim">Nothing here yet.</p>
        )}
        {msgs.map((m) => (
          <MessageRow key={m.id} m={m} mine={m.senderId === props.currentUserId} members={props.members} />
        ))}
        {props.bartenderTyping && sending && (
          <div
            className="card p-3 text-sm max-w-[85%] italic text-dim"
            style={{ borderColor: "var(--amber-dim)" }}
          >
            <span className="text-xs font-semibold text-amber not-italic">The Bartender</span>
            <span className="bartender-pour"> considers this, polishing a glass…</span>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {props.canPost ? (
        <div className="pt-3 space-y-2">
          {props.prompts &&
            props.prompts.length > 0 &&
            !msgs.some((m) => m.senderKind === "user") && (
            <div className="flex flex-wrap gap-2">
              {props.prompts.map((p) => (
                <button
                  key={p}
                  type="button"
                  className="tag hover:text-ink"
                  onClick={() => setDraft((d) => (d.trim() ? d : p + " "))}
                >
                  {p}
                </button>
              ))}
              </div>
            )}
          {props.showStructured && (
            <div className="flex flex-wrap gap-2 items-center">
              {STRUCTURED.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => setStructured(structured === s.key ? null : s.key)}
                  className="tag"
                  style={
                    structured === s.key
                      ? { borderColor: s.color, color: s.color }
                      : undefined
                  }
                >
                  {s.label}
                </button>
              ))}
              {structured === "action" && props.members && (
                <select
                  className="input w-auto text-xs py-1"
                  value={owner}
                  onChange={(e) =>
                    setOwner(e.target.value === "" ? "" : Number(e.target.value))
                  }
                >
                  <option value="">No owner</option>
                  {props.members.map((mm) => (
                    <option key={mm.id} value={mm.id}>{mm.name}</option>
                  ))}
                </select>
              )}
            </div>
          )}
          <div className="flex gap-2">
            <textarea
              className="input min-h-11 max-h-40"
              rows={1}
              placeholder={props.placeholder ?? "Write a message… (@handle to mention)"}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
            />
            <button className="btn self-end" onClick={send} disabled={sending || !draft.trim()}>
              Send
            </button>
          </div>
        </div>
      ) : (
        <p className="pt-3 text-sm text-dim">
          {props.readOnlyReason ?? "You can't post here."}
        </p>
      )}
    </div>
  );
}

function MessageRow(props: {
  m: ChatMessage;
  mine: boolean;
  members?: { id: number; name: string }[];
}) {
  const { m } = props;
  const isBartender = m.senderKind === "bartender";
  const s = STRUCTURED.find((x) => x.key === m.structuredType);
  const ownerName =
    m.ownerId != null
      ? props.members?.find((x) => x.id === m.ownerId)?.name ?? `#${m.ownerId}`
      : null;

  return (
    <div
      className={`card p-3 text-sm max-w-[85%] ${props.mine ? "ml-auto" : ""}`}
      style={isBartender ? { borderColor: "var(--amber-dim)" } : undefined}
    >
      <div className="flex items-center gap-2 mb-1">
        <span className={`text-xs font-semibold ${isBartender ? "text-amber" : "text-dim"}`}>
          {isBartender
            ? "The Bartender"
            : m.senderKind === "system"
              ? "The house"
              : m.senderName ?? "A former member"}
        </span>
        {m.senderIsSeed && <span className="tag">seeded</span>}
        {s && (
          <span className="tag" style={{ borderColor: s.color, color: s.color }}>
            {s.label}
            {m.structuredType === "decision" && (m.resolved ? " · resolved" : " · open")}
            {ownerName && ` · ${ownerName}`}
          </span>
        )}
        <span className="text-[11px] text-dim ml-auto">
          {new Date(m.createdAt).toLocaleString([], {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      </div>
      <p className="whitespace-pre-wrap leading-relaxed">{m.content}</p>
    </div>
  );
}
