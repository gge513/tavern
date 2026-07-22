import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, eq, ne } from "drizzle-orm";

import { Chat } from "@/app/components/chat";
import { currentUser } from "@/lib/current-user";
import { db } from "@/lib/db";
import {
  conversationParticipants,
  profiles,
  tavernSessions,
  users,
} from "@/lib/db/schema";
import {
  addLedgerItemAction,
  cycleLedgerItemAction,
  endTavernSessionAction,
  inviteToTableAction,
  removeLedgerItemAction,
  summonBartenderAction,
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
    where: eq(tavernSessions.id, sessionId),
  });
  if (!session) notFound();

  const isOwner = session.ownerId === user.id;
  if (!isOwner) {
    // Invited collaborators only, and only once the table is shared.
    if (!session.shared) notFound();
    const part = await db.query.conversationParticipants.findFirst({
      where: and(
        eq(conversationParticipants.conversationId, session.conversationId),
        eq(conversationParticipants.userId, user.id)
      ),
    });
    if (!part) notFound();
  }

  const open = !session.outcome;
  const ledger = { said: [], assuming: [], unknown: [], ...(session.ledger ?? {}) };

  const others = await db
    .select({ id: users.id, name: users.name, isSeed: users.isSeed })
    .from(conversationParticipants)
    .innerJoin(users, eq(users.id, conversationParticipants.userId))
    .where(
      and(
        eq(conversationParticipants.conversationId, session.conversationId),
        ne(conversationParticipants.userId, user.id)
      )
    );

  // Who could be invited: cohort members with approved profiles, minus
  // whoever is already at the table.
  let invitable: { id: number; name: string; isSeed: boolean }[] = [];
  if (isOwner && open && !session.shared) {
    const atTable = new Set([user.id, ...others.map((o) => o.id)]);
    const rows = await db
      .select({ id: users.id, name: users.name, isSeed: users.isSeed })
      .from(profiles)
      .innerJoin(users, eq(users.id, profiles.userId))
      .where(eq(profiles.approved, true));
    invitable = rows.filter((r) => !atTable.has(r.id));
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <Link href="/tavern" className="text-xs text-dim hover:text-ink">← tavern</Link>
        <h1 className="text-xl">{session.shared ? "A table for two" : "Private session"}</h1>
        {session.shared ? (
          <span className="tag tag-amber">
            shared with {others.map((o) => o.name).join(", ") || "…"} — visible to both of you
          </span>
        ) : (
          <span className="tag">only you can see this</span>
        )}
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
            placeholder={
              session.shared
                ? "Think out loud together — ring the bell when you want the bartender's read."
                : "Think out loud — the bartender keeps the said/assuming/unknown discipline with you."
            }
            bartenderTyping={!session.shared}
            prompts={open && !session.shared ? PROMPTS : undefined}
          />

          {open && session.shared && (
            <form action={summonBartenderAction.bind(null, sessionId)}>
              <button className="btn">🔔 Ring the bell — bartender&apos;s read</button>
              <p className="text-xs text-dim mt-1.5">
                He&apos;ll name each perspective, what you already agree on, what&apos;s
                unresolved, and one next move. Then he goes back to the bar.
              </p>
            </form>
          )}

          {isOwner && open && !session.shared && invitable.length > 0 && (
            <div className="card p-4 space-y-2">
              <div className="label">Pull up a second stool</div>
              <p className="text-xs text-dim">
                Invite a collaborator for a live thinking session at this table.
                Fair warning: they&apos;ll see <strong>everything already said
                here</strong>, and the bartender switches to facilitator — he&apos;ll
                only speak when you ring the bell.
              </p>
              <form
                action={inviteToTableAction.bind(null, sessionId)}
                className="flex gap-2"
              >
                <select className="input text-sm" name="userId" required defaultValue="">
                  <option value="" disabled>
                    Choose a collaborator…
                  </option>
                  {invitable.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                      {p.isSeed ? " (seeded demo — won't reply)" : ""}
                    </option>
                  ))}
                </select>
                <button className="btn text-xs shrink-0">Invite</button>
              </form>
            </div>
          )}

          {open && (
            <div className="space-y-2">
              <div className="label">Last call — every visit ends one of four ways</div>
              <div className="grid sm:grid-cols-2 gap-2">
                {LAST_CALL.map((o) => (
                  <form key={o.key} action={endTavernSessionAction.bind(null, sessionId, o.key)}>
                    <button
                      className="card p-3 w-full text-left hover:bg-hover transition-colors disabled:opacity-50"
                      disabled={!isOwner}
                      title={isOwner ? undefined : "The session's owner calls last call"}
                    >
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
                Copy it into your project chat if and when you&apos;re ready. Nothing is
                shared automatically.
              </p>
            </div>
          )}
        </div>

        <aside className="space-y-3 lg:sticky lg:top-4">
          <div className="label mb-0">The ledger{session.shared ? " — shared" : ""}</div>
          <p className="text-xs text-dim -mt-1">
            Sort as you talk. Tap ⟳ to reclassify a card — noticing a
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
