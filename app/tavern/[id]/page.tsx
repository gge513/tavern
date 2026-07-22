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
];

const LEDGER_META: {
  key: LedgerColumn;
  title: string;
  color: string;
}[] = [
  { key: "said", title: "Said", color: "var(--green)" },
  { key: "assuming", title: "Assuming", color: "var(--amber)" },
  { key: "unknown", title: "Unknown", color: "var(--blue)" },
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
      <div className="flex items-baseline gap-3 flex-wrap">
        <Link href="/tavern" className="text-xs text-dim hover:text-ink">← tavern</Link>
        <h1 className="text-xl">
          {session.shared ? "A table for two" : "Private session"}
        </h1>
        <span className="text-xs text-dim">
          {session.shared
            ? `with ${others.map((o) => o.name).join(", ")} — visible to both of you`
            : "only you can see this"}
        </span>
        {session.outcome && (
          <span className="tag tag-amber capitalize">ended: {session.outcome}</span>
        )}
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_270px] gap-6 items-start">
        <div className="space-y-3">
          <Chat
            conversationId={session.conversationId}
            currentUserId={user.id}
            canPost={open}
            readOnlyReason="This session has ended. Open a new one whenever you need the room."
            placeholder={
              session.shared
                ? "Think out loud together…"
                : "Think out loud — what happened, what do you actually know?"
            }
            bartenderTyping={!session.shared}
            prompts={open && !session.shared ? PROMPTS : undefined}
          />

          {open && (
            <div className="bar-rail">
              {session.shared && (
                <form action={summonBartenderAction.bind(null, sessionId)}>
                  <button className="rail-action" title="He'll name each perspective, the agreed ground, the unresolved, and one next move.">
                    🔔 ring for the bartender
                  </button>
                </form>
              )}

              {isOwner && !session.shared && invitable.length > 0 && (
                <details className="bar-menu">
                  <summary>Pull up a second stool</summary>
                  <div className="max-w-md space-y-2">
                    <p className="text-xs text-dim">
                      A live thinking session for two. They&apos;ll see everything
                      already said here, and the bartender switches to
                      facilitator — speaking only when you ring the bell.
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
                </details>
              )}

              {isOwner && (
                <details className="bar-menu">
                  <summary>Last call</summary>
                  <div className="grid sm:grid-cols-2 gap-2 max-w-lg">
                    {LAST_CALL.map((o) => (
                      <form
                        key={o.key}
                        action={endTavernSessionAction.bind(null, sessionId, o.key)}
                      >
                        <button className="card p-3 w-full text-left hover:bg-hover transition-colors">
                          <span
                            className="font-semibold text-sm"
                            style={{ fontFamily: "var(--serif)" }}
                          >
                            {o.title}
                          </span>
                          <span className="block text-xs text-dim mt-1">{o.desc}</span>
                        </button>
                      </form>
                    ))}
                  </div>
                </details>
              )}
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

        <aside className="lg:sticky lg:top-4">
          <div className="card p-4">
            <div className="flex items-baseline justify-between mb-1">
              <span className="label mb-0">
                Ledger{session.shared ? " · shared" : ""}
              </span>
            </div>
            <p className="text-[11px] text-dim leading-snug mb-3">
              Sort as you talk; ⟳ reclassifies. Noticing a &quot;fact&quot; was a
              reading is the whole game.
            </p>
            {LEDGER_META.map((col) => (
              <div key={col.key} className="ledger-section">
                <div
                  className="text-sm font-bold mb-1.5"
                  style={{ fontFamily: "var(--serif)", color: col.color }}
                >
                  {col.title}
                </div>
                {(ledger[col.key] ?? []).map((item, i) => (
                  <div
                    key={`${item}-${i}`}
                    className="ledger-entry"
                    style={{ borderLeftColor: col.color }}
                  >
                    <span className="flex-1">{item}</span>
                    {open && (
                      <span className="flex gap-1.5 shrink-0">
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
                  <form action={addLedgerItemAction.bind(null, sessionId, col.key)}>
                    <input
                      className="ledger-add"
                      name="text"
                      placeholder={`+ add, then Enter`}
                      maxLength={200}
                      autoComplete="off"
                    />
                  </form>
                )}
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}
