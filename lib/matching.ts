import { and, eq, ne, or } from "drizzle-orm";

import { explainMatches, type ProfileForMatching } from "@/lib/ai";
import { db } from "@/lib/db";
import { matches, profiles, users } from "@/lib/db/schema";

/**
 * Matching (spec 5.3): deterministic candidate scoring over the trait
 * percentages, then one AI call to pick winners and write the
 * plain-language "why". Template explanations if the API is down —
 * degrading is allowed on the never-cut chain, removing is not.
 */

function vec(p: {
  thinking: Record<string, number> | null;
  contribution: Record<string, number> | null;
  collaboration: Record<string, number> | null;
}): Record<string, number> {
  return {
    ...prefix("t:", p.thinking),
    ...prefix("c:", p.contribution),
    ...prefix("x:", p.collaboration),
  };
}

function prefix(pre: string, m: Record<string, number> | null) {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(m ?? {})) out[pre + k] = v;
  return out;
}

function cosine(a: Record<string, number>, b: Record<string, number>): number {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  let dot = 0,
    na = 0,
    nb = 0;
  for (const k of keys) {
    const x = a[k] ?? 0,
      y = b[k] ?? 0;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}

/** How much of what I lack (contribution-wise) the other person has. */
function complement(me: Record<string, number>, other: Record<string, number>): number {
  let score = 0;
  for (const [k, v] of Object.entries(other)) {
    if (!k.startsWith("c:") && !k.startsWith("t:")) continue;
    const mine = me[k] ?? 0;
    if (mine < 15 && v >= 30) score += v - mine;
  }
  return score;
}

export async function profileForMatching(userId: number): Promise<ProfileForMatching | null> {
  const row = await db
    .select({
      userId: users.id,
      name: users.name,
      summary: profiles.userSummary,
      thinking: profiles.thinking,
      contribution: profiles.contribution,
      collaboration: profiles.collaboration,
      skills: profiles.skills,
      helpOffered: profiles.helpOffered,
      helpWanted: profiles.helpWanted,
      interests: profiles.interests,
    })
    .from(profiles)
    .innerJoin(users, eq(users.id, profiles.userId))
    .where(eq(profiles.userId, userId))
    .limit(1);
  const p = row[0];
  if (!p) return null;
  return { ...p, skills: p.skills ?? [] };
}

/** Compute and store one alike + one complementary match for a user. Idempotent-ish: skips if both exist. */
export async function ensureMatches(userId: number): Promise<void> {
  const existing = await db.query.matches.findMany({
    where: eq(matches.userAId, userId),
  });
  if (existing.some((m) => m.type === "alike") && existing.some((m) => m.type === "complementary")) {
    return;
  }

  const me = await profileForMatching(userId);
  if (!me) return;

  const others = await db
    .select({
      userId: users.id,
      name: users.name,
      summary: profiles.userSummary,
      thinking: profiles.thinking,
      contribution: profiles.contribution,
      collaboration: profiles.collaboration,
      skills: profiles.skills,
      helpOffered: profiles.helpOffered,
      helpWanted: profiles.helpWanted,
      interests: profiles.interests,
      approved: profiles.approved,
      openToConnect: profiles.openToConnect,
    })
    .from(profiles)
    .innerJoin(users, eq(users.id, profiles.userId))
    .where(and(ne(profiles.userId, userId), eq(profiles.approved, true)));

  const pool: ProfileForMatching[] = others
    .filter((o) => o.approved && o.openToConnect)
    .map((o) => ({ ...o, skills: o.skills ?? [] }));
  if (pool.length === 0) return;

  const myVec = vec(me);
  const scoredAlike = [...pool]
    .map((p) => ({ p, s: cosine(myVec, vec(p)) }))
    .sort((a, b) => b.s - a.s);
  const scoredComp = [...pool]
    .map((p) => ({ p, s: complement(myVec, vec(p)) }))
    .sort((a, b) => b.s - a.s);

  const alikeCands = scoredAlike.slice(0, 3).map((x) => x.p);
  // Prefer a different person for the complementary slot when possible.
  const compCands = scoredComp
    .filter((x) => pool.length < 2 || x.p.userId !== alikeCands[0]?.userId)
    .slice(0, 3)
    .map((x) => x.p);

  const ai = await explainMatches(me, { alike: alikeCands, complementary: compCands });

  const pickAlike =
    (ai && alikeCands.find((c) => c.userId === ai.alike.userId)) ?? alikeCands[0];
  const pickComp =
    (ai && compCands.find((c) => c.userId === ai.complementary.userId)) ??
    compCands[0] ??
    alikeCands[0];

  const alikeWhy =
    (ai && pickAlike.userId === ai.alike.userId && ai.alike.explanation) ||
    `Your collaborator maps overlap: ${sharedTop(me, pickAlike)}. Similar instincts often make the first week of working together feel easy.`;
  const compWhy =
    (ai && pickComp.userId === ai.complementary.userId && ai.complementary.explanation) ||
    `${pickComp.name}'s strengths (${topOf(pickComp)}) sit where your map is lighter — a pairing that tends to cover more ground than two of the same.`;

  if (!existing.some((m) => m.type === "alike") && pickAlike) {
    await db
      .insert(matches)
      .values({ userAId: userId, userBId: pickAlike.userId, type: "alike", explanation: alikeWhy })
      .onConflictDoNothing();
  }
  if (!existing.some((m) => m.type === "complementary") && pickComp) {
    await db
      .insert(matches)
      .values({ userAId: userId, userBId: pickComp.userId, type: "complementary", explanation: compWhy })
      .onConflictDoNothing();
  }
}

function topOf(p: ProfileForMatching): string {
  const all = { ...(p.contribution ?? {}), ...(p.thinking ?? {}) };
  return (
    Object.entries(all)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([k]) => k)
      .join(" + ") || "a different mix"
  );
}

function sharedTop(a: ProfileForMatching, b: ProfileForMatching): string {
  const at = new Set(Object.keys({ ...(a.thinking ?? {}), ...(a.contribution ?? {}) }));
  const shared = Object.keys({ ...(b.thinking ?? {}), ...(b.contribution ?? {}) }).filter((k) =>
    at.has(k)
  );
  return shared.slice(0, 2).join(" and ") || "adjacent strengths";
}

export async function matchesForUser(userId: number) {
  return db
    .select({
      id: matches.id,
      type: matches.type,
      explanation: matches.explanation,
      conversationId: matches.conversationId,
      otherId: users.id,
      otherName: users.name,
      otherAvatar: users.avatarUrl,
      otherIsSeed: users.isSeed,
    })
    .from(matches)
    .innerJoin(users, eq(users.id, matches.userBId))
    .where(or(eq(matches.userAId, userId)));
}
