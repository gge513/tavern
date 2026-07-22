import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";

import { Chat } from "@/app/components/chat";
import { currentUser } from "@/lib/current-user";
import { db } from "@/lib/db";
import { tavernSessions } from "@/lib/db/schema";
import {
  addLedgerItemAction,
  cycleLedgerItemAction,
  endTavernSessionAction,
  removeLedgerItemAction,
  type LedgerColumn,
} from "../actions";

const PROMPTS = [
  "What actually happened:",
  "What I know directly:",
  "What I'm assuming:",
  "The outcome I want:",
  "Who might have missing context:",
];

const LEDGER_META: {
  key: LedgerColumn;
  title: string;
  hint: string;
  color: string;
}[] = [
  { key: "said", title: "Said", hint: "what actually happened or was said", color: "var(--green)" },
  { key: "assuming", title: "Assuming", hint: "your reading of it", color: "var(--amber)" },
  { key: "unknown", title: "Unknown", hint: "open questions", color: "var(--blue)" },
];

const LAST_CALL: {
  key: "act" | "invite" | "clarify" | "release";
  title: string;
  desc: string;
}[] = [
  { key: "act", title: "Act", desc: "You know your next move. Go make it." },
  {
    key: "invite",
    title: "Invite",
    desc: "Bring it to the project — the bartender drafts the message, you own it.",
  },
  {
    key: "clarify",
    title: "Clarify",
    desc: "Ask the person directly. One question beats a week of theory.",
  },
  {
    key: "release",
    title: "Release",
    desc: "Not everything needs action. Naming that is the action.",
  },
];

export default async function TavernSessionPage(props: {
  params: Promise<{ id: string }>;
}) {
  const user = await currentUser();
  if (!user) redirect("/signin");

  const { id } = await props.params;
  const sessionId = Number(id);
  if (!Number.isInteger(sessionId)) notFound();

  const session = await db.query.tavernSessions.findFirst({
    where: and(eq(tavernSessions.id, sessionId), eq(tavernSessions.ownerId, user.id)),
  });
  if (!session) notFound();

  const open = !session.outcome;
  const ledger = { said: [], assuming: [], unknown: [], ...(session.ledger ?? {}) };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <Link href="/tavern" className="text-xs text-dim hover:text-ink">← tavern</Link>
        <h1 className="text-xl">Private session</h1>
        <span className="tag">only you can see this</span>
        {session.outcome && (
          <span className="tag tag-amber capitalize">ended: {session.outcome}</span>
        )}
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_290px] gap-5 items-start">
        <div className="space-y-4">
          <Chat
            conversationId={session.conversationId}
            currentUserId={user.id}
            canPost={open}
            readOnlyReason="This session has ended. Open a new one whenever you need the room."
            placeholder="Think out loud — the bartender keeps the said/assuming/unknown discipline with you."
            bartenderTyping
            prompts={open ? PROMPTS : undefined}
          />

          {open && (
            <div className="space-y-2">
              <div className="label">Last call — every visit ends one of four ways</div>
              <div className="grid sm:grid-cols-2 gap-2">
                {LAST_CALL.map((o) => (
                  <form key={o.key} action={endTavernSessionAction.bind(null, sessionId, o.key)}>
                    <button className="card p-3 w-full text-left hover:bg-hover transition-colors">
                      <span className="font-semibold text-sm" style={{ fontFamily: "var(--serif)" }}>
                        {o.title}
                      </span>
                      <span className="block text-xs text-dim mt-1">{o.desc}</span>
                    </button>
                  </form>
                ))}
              </div>
            </div>
          )}

          {session.outcome === "invite" && session.draftMessage && (
            <div className="card p-4 space-y-2">
              <div className="label">
                Drafted message to bring back — yours to edit, post, or discard
              </div>
              <p className="text-sm whitespace-pre-wrap leading-relaxed">{session.draftMessage}</p>
              <p className="text-xs text-dim">
                Copy it into your project chat if and when you&apos;re ready. Nothing
                is shared automatically.
              </p>
            </div>
          )}
        </div>

        <aside className="space-y-3 lg:sticky lg:top-4">
          <div className="label mb-0">The ledger</div>
          <p className="text-xs text-dim -mt-1">
            Sort as you talk. Tap a card to reclassify it — noticing a
            &quot;fact&quot; was actually a reading is the whole game.
          </p>
          {LEDGER_META.map((col) => (
            <div key={col.key} className="card p-3 space-y-2">
              <div className="flex items-baseline gap-2">
                <span
                  className="text-sm font-bold"
                  style={{ fontFamily: "var(--serif)", color: col.color }}
                >
                  {col.title}
                </span>
                <span className="text-[10px] text-dim">{col.hint}</span>
              </div>
              {(ledger[col.key] ?? []).map((item, i) => (
                <div
                  key={`${item}-${i}`}
                  className="ledger-item flex items-start gap-1.5 text-xs bg-bg border p-2"
                  style={{ borderColor: col.color }}
                >
                  <span className="flex-1 leading-snug">{item}</span>
                  {open && (
                    <span className="flex gap-1 shrink-0">
                      <form action={cycleLedgerItemAction.bind(null, sessionId, col.key, i)}>
                        <button
                          className="text-dim hover:text-ink"
                          title="Reclassify (said → assuming → unknown)"
                        >
                          ⟳
                        </button>
                      </form>
                      <form action={removeLedgerItemAction.bind(null, sessionId, col.key, i)}>
                        <button className="text-dim hover:text-red" title="Remove">
                          ×
                        </button>
                      </form>
                    </span>
                  )}
                </div>
              ))}
              {open && (
                <form
                  action={addLedgerItemAction.bind(null, sessionId, col.key)}
                  className="flex gap-1"
                >
                  <input
                    className="input text-xs py-1"
                    name="text"
                    placeholder={`add to ${col.title.toLowerCase()}…`}
                    maxLength={200}
                  />
                  <button className="btn btn-ghost text-xs px-2 min-h-8">+</button>
                </form>
              )}
            </div>
          ))}
        </aside>
      </div>
    </div>
  );
}
