import Link from "next/link";
import { and, asc, eq, inArray } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  conversations,
  matches,
  messages,
  profiles,
  users,
} from "@/lib/db/schema";

/**
 * The reviewer's door: what the Tavern looks like from the inside, without an
 * account.
 *
 * Peer reviewers repeatedly scored the signed-in product from the repo alone
 * because the onboarding flow stands between the landing page and every real
 * surface. This page answers "show me the thing" in about a minute.
 *
 * It is READ-ONLY and SEED-ONLY by construction. Every query below is fenced
 * to users.isSeed — the fictional, clearly-labeled demo profiles — so no real
 * member's writing is ever served to an unauthenticated visitor. That fence is
 * the whole safety model here: there is no auth check on this route, so the
 * data selection has to be the thing that is trustworthy. Widening any query
 * below to non-seed rows publishes real people's messages to the open web.
 */

export const metadata = {
  title: "Tavern — a look inside",
  description:
    "A read-only look at the Tavern's channels, profiles, and explained matches, using seeded demo people.",
};

// Never cache a preview of live seed data behind a stale snapshot.
export const dynamic = "force-dynamic";

const STRUCTURED_LABEL: Record<string, { label: string; color: string }> = {
  question: { label: "Question", color: "var(--blue)" },
  decision: { label: "Decision", color: "var(--amber)" },
  blocker: { label: "Blocker", color: "var(--red)" },
  help: { label: "Request for help", color: "var(--green)" },
  action: { label: "Action item", color: "var(--text-dim)" },
};

export default async function PreviewPage() {
  // The seed cohort. Everything on this page is drawn from these rows only.
  const seedUsers = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(eq(users.isSeed, true));
  const seedIds = seedUsers.map((u) => u.id);

  const general = await db.query.conversations.findFirst({
    where: and(eq(conversations.kind, "channel"), eq(conversations.name, "general")),
  });

  // Seed-authored messages in #general. inArray on an empty list is a runtime
  // error in some drivers, so an empty seed cohort short-circuits to nothing
  // rather than to "everything".
  const thread =
    general && seedIds.length > 0
      ? await db
          .select({
            id: messages.id,
            content: messages.content,
            createdAt: messages.createdAt,
            structuredType: messages.structuredType,
            senderName: users.name,
          })
          .from(messages)
          .innerJoin(users, eq(users.id, messages.senderId))
          .where(
            and(
              eq(messages.conversationId, general.id),
              eq(users.isSeed, true),
              inArray(messages.senderId, seedIds)
            )
          )
          .orderBy(asc(messages.id))
          .limit(12)
      : [];

  // One approved seed profile, to show what the cohort actually sees.
  const profile =
    seedIds.length > 0
      ? (
          await db
            .select({
              name: users.name,
              userSummary: profiles.userSummary,
              skills: profiles.skills,
              tools: profiles.tools,
              helpOffered: profiles.helpOffered,
              helpWanted: profiles.helpWanted,
              thinking: profiles.thinking,
            })
            .from(profiles)
            .innerJoin(users, eq(users.id, profiles.userId))
            .where(and(eq(users.isSeed, true), eq(profiles.approved, true)))
            .limit(1)
        )[0]
      : undefined;

  // A match between two seeded people, with the explanation that ships with it.
  const match =
    seedIds.length > 0
      ? (
          await db
            .select({
              type: matches.type,
              explanation: matches.explanation,
              aName: users.name,
              bId: matches.userBId,
            })
            .from(matches)
            .innerJoin(users, eq(users.id, matches.userAId))
            .where(
              and(
                inArray(matches.userAId, seedIds),
                inArray(matches.userBId, seedIds)
              )
            )
            .limit(1)
        )[0]
      : undefined;

  const matchPartner = match
    ? seedUsers.find((u) => u.id === match.bId)?.name
    : undefined;

  return (
    <div className="space-y-8">
      <header className="space-y-3">
        <span className="tag tag-amber">Read-only preview</span>
        <h1 className="text-3xl font-bold">A look inside the Tavern</h1>
        <p className="text-dim leading-relaxed max-w-2xl">
          The real product sits behind a sign-in and a short onboarding game,
          because nothing about a person becomes cohort-visible until they have
          approved it. That is the right default for members and an annoying one
          for anyone evaluating the app, so this page shows the surfaces without
          an account.
        </p>
        <p className="text-dim leading-relaxed max-w-2xl">
          Everyone below is a <strong>seeded demo profile</strong>: fictional
          people the seed script creates and labels as such. No real member&apos;s
          writing appears on this page.
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">#general</h2>
        <p className="text-sm text-dim">
          The channel surface. Signed in, this polls every two seconds and
          carries reactions, @mentions, and structured message types.
        </p>
        <div className="space-y-3">
          {thread.length === 0 && (
            <p className="text-sm text-dim card p-3">
              No seeded messages are loaded right now.
            </p>
          )}
          {thread.map((m) => {
            const s = m.structuredType
              ? STRUCTURED_LABEL[m.structuredType]
              : undefined;
            return (
              <div key={m.id} className="card p-3 text-sm max-w-[85%]">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-semibold text-dim">
                    {m.senderName}
                  </span>
                  <span className="tag">seeded</span>
                  {s && (
                    <span
                      className="tag"
                      style={{ borderColor: s.color, color: s.color }}
                    >
                      {s.label}
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
          })}
        </div>
      </section>

      {profile && (
        <section className="space-y-3">
          <h2 className="text-xl font-semibold">A collaborator profile</h2>
          <p className="text-sm text-dim">
            Drafted from public GitHub work, then edited and approved by the
            person before anyone else could see a word of it.
          </p>
          <div className="card p-4 space-y-3">
            <div className="flex items-center gap-2">
              <span className="font-semibold">{profile.name}</span>
              <span className="tag">seeded demo profile</span>
            </div>
            {profile.userSummary && (
              <p className="text-sm leading-relaxed">{profile.userSummary}</p>
            )}
            {profile.thinking && (
              <div className="flex flex-wrap gap-2">
                {Object.entries(profile.thinking).map(([k, v]) => (
                  <span key={k} className="tag">
                    {k} {v}%
                  </span>
                ))}
              </div>
            )}
            {(profile.skills?.length ?? 0) > 0 && (
              <div className="flex flex-wrap gap-2">
                {profile.skills?.map((s) => (
                  <span key={s} className="tag">
                    {s}
                  </span>
                ))}
              </div>
            )}
            {profile.helpOffered && (
              <p className="text-sm text-dim">
                <strong className="text-ink">Can help with:</strong>{" "}
                {profile.helpOffered}
              </p>
            )}
            {profile.helpWanted && (
              <p className="text-sm text-dim">
                <strong className="text-ink">Wants help with:</strong>{" "}
                {profile.helpWanted}
              </p>
            )}
          </div>
        </section>
      )}

      {match && matchPartner && (
        <section className="space-y-3">
          <h2 className="text-xl font-semibold">An explained match</h2>
          <p className="text-sm text-dim">
            Scoring is deterministic; the &quot;why&quot; is written in plain
            language so a suggestion can be argued with rather than taken on
            faith. Every card is addressed to the person reading it, so this is
            the card as {match.aName} sees it.
          </p>
          <div
            className="card p-4 space-y-2"
            style={{ borderColor: "var(--amber-dim)" }}
          >
            <div className="flex items-center gap-2">
              <span className="text-xs text-dim">
                Suggested for {match.aName}
              </span>
              <span className="font-semibold">{matchPartner}</span>
              <span className="tag tag-amber">{match.type}</span>
            </div>
            <p className="text-sm leading-relaxed">{match.explanation}</p>
          </div>
        </section>
      )}

      <section className="card p-5 space-y-3">
        <h2 className="text-lg font-semibold">What this page leaves out</h2>
        <ul className="text-sm text-dim space-y-1.5 list-disc pl-5 leading-relaxed">
          <li>
            Direct messages and the snug, which are private to their
            participants and excluded from search by design.
          </li>
          <li>
            The onboarding game that builds the collaborator map, and the
            bartender introduction that follows a match.
          </li>
          <li>
            Project tables, join requests, and the structured conversation
            types that run inside them.
          </li>
          <li>Posting, reacting, and notifications, all of which need an account.</li>
        </ul>
        <div className="pt-1">
          <Link href="/signin" className="btn">
            Sign in and see the rest
          </Link>
        </div>
      </section>
    </div>
  );
}
