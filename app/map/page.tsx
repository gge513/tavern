import Link from "next/link";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";

import { currentUser } from "@/lib/current-user";
import { db } from "@/lib/db";
import { profiles, users } from "@/lib/db/schema";
import { ensureMatches, matchesForUser } from "@/lib/matching";
import { formatTraits } from "@/lib/traits";
import { openIntroductionAction } from "./actions";

/**
 * The cohort map (spec 5.3): collaborator cards, not a username directory.
 * Filters via searchParams; two explained suggestions on top.
 */
export default async function MapPage(props: {
  searchParams: Promise<{ q?: string; style?: string; wants?: string }>;
}) {
  const user = await currentUser();
  if (!user) redirect("/signin");
  if (user.onboarding !== "done") redirect("/onboarding");

  const { q, style, wants } = await props.searchParams;

  // Self-heal: if matches are missing (e.g. seeded later), try again.
  try {
    await ensureMatches(user.id);
  } catch {}
  const myMatches = await matchesForUser(user.id);

  const rows = await db
    .select({
      userId: users.id,
      name: users.name,
      avatarUrl: users.avatarUrl,
      isSeed: users.isSeed,
      summary: profiles.userSummary,
      thinking: profiles.thinking,
      contribution: profiles.contribution,
      collaboration: profiles.collaboration,
      skills: profiles.skills,
      helpOffered: profiles.helpOffered,
      helpWanted: profiles.helpWanted,
      interests: profiles.interests,
      openToConnect: profiles.openToConnect,
    })
    .from(profiles)
    .innerJoin(users, eq(users.id, profiles.userId))
    .where(and(eq(profiles.approved, true)));

  const needle = (q ?? "").toLowerCase();
  const styleNeedle = (style ?? "").toLowerCase();
  const wantsHelp = wants === "1";

  const cards = rows.filter((r) => {
    if (r.userId === user.id) return false;
    if (wantsHelp && !r.helpWanted) return false;
    if (styleNeedle) {
      const traits = Object.keys({
        ...(r.thinking ?? {}),
        ...(r.contribution ?? {}),
        ...(r.collaboration ?? {}),
      })
        .join(" ")
        .toLowerCase();
      if (!traits.includes(styleNeedle)) return false;
    }
    if (needle) {
      const hay = [
        r.name,
        r.summary,
        (r.skills ?? []).join(" "),
        r.helpOffered,
        r.helpWanted,
        r.interests,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Cohort map</h1>
        <p className="text-sm text-dim mt-1">
          {rows.length - 1 >= 0 ? rows.length - 1 : 0} visible collaborators.
          Suggestions are suggestions — never assignments.
        </p>
      </div>

      {myMatches.length > 0 && (
        <div className="grid md:grid-cols-2 gap-4">
          {myMatches.map((m) => (
            <div key={m.id} className="card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="tag tag-amber">
                  {m.type === "alike" ? "Most alike" : "Most complementary"}
                </span>
                {m.otherIsSeed && <span className="tag">seeded demo profile</span>}
              </div>
              <div className="font-semibold">
                <Link href={`/people/${m.otherId}`} className="hover:underline">
                  {m.otherName}
                </Link>
              </div>
              <p className="text-sm text-dim leading-relaxed">
                <span className="ai-label">Why · AI suggestion</span>
                <br />
                {m.explanation}
              </p>
              <form
                action={openIntroductionAction.bind(null, m.id)}
              >
                <button className="btn text-sm">
                  {m.conversationId ? "Back to the conversation" : "Meet at the bar"}
                </button>
              </form>
            </div>
          ))}
        </div>
      )}

      <form className="card p-4 flex flex-wrap gap-3 items-end" method="GET">
        <div className="flex-1 min-w-48">
          <label className="label" htmlFor="q">Search skills, interests, help</label>
          <input className="input" id="q" name="q" defaultValue={q ?? ""} />
        </div>
        <div className="min-w-40">
          <label className="label" htmlFor="style">Style contains</label>
          <input
            className="input"
            id="style"
            name="style"
            defaultValue={style ?? ""}
            placeholder="e.g. debugger"
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-dim pb-2">
          <input type="checkbox" name="wants" value="1" defaultChecked={wantsHelp} />
          wants help
        </label>
        <button className="btn btn-ghost">Filter</button>
      </form>

      <div className="grid md:grid-cols-2 gap-4">
        {cards.map((c) => (
          <Link
            key={c.userId}
            href={`/people/${c.userId}`}
            className="card p-4 space-y-2 hover:bg-hover transition-colors block"
          >
            <div className="flex items-center justify-between">
              <span className="font-semibold">{c.name}</span>
              {c.isSeed && <span className="tag">seeded demo profile</span>}
            </div>
            <p className="text-sm text-dim line-clamp-3">{c.summary}</p>
            <p className="text-xs text-dim">
              <span className="text-amber">Thinks:</span> {formatTraits(c.thinking)}
            </p>
            <p className="text-xs text-dim">
              <span className="text-amber">Contributes:</span> {formatTraits(c.contribution)}
            </p>
            {(c.skills ?? []).length > 0 && (
              <div className="flex flex-wrap gap-1 pt-1">
                {(c.skills ?? []).slice(0, 6).map((s) => (
                  <span key={s} className="tag">{s}</span>
                ))}
              </div>
            )}
            {c.helpWanted && (
              <p className="text-xs text-blue">Wants help: {c.helpWanted}</p>
            )}
          </Link>
        ))}
        {cards.length === 0 && (
          <p className="text-dim text-sm">No one matches those filters.</p>
        )}
      </div>
    </div>
  );
}
