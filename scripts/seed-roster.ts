/**
 * Roster pre-seed: create UNCLAIMED accounts for the real cohort so everyone
 * claims their identity on first GitHub sign-in.
 *
 * Sources (all public): PRs on the course repo whose branches live under
 * participants/, plus the submissions/ filenames mirrored in those PRs.
 * We store name + GitHub handle only — no generated profiles, so the
 * approval gate holds: an unclaimed member is invisible on the map and shows
 * up solely in the "haven't come to the bar yet" tally.
 *
 * Re-runnable: onConflictDoNothing means claimed and seeded rows are never
 * touched. Run again during rollout as more PRs land.
 */
import { db } from "../lib/db";
import { users } from "../lib/db/schema";

const COURSE_REPO = "rogerSuperBuilderAlpha/hult-cohort-program";
const STAFF = new Set(["rogersuperbuilderalpha"]);

const GH = "https://api.github.com";

function ghHeaders(): Record<string, string> {
  const h: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "tavern-roster-seed",
  };
  if (process.env.GITHUB_PAT) h.Authorization = `Bearer ${process.env.GITHUB_PAT}`;
  return h;
}

async function fetchParticipants(): Promise<Map<string, string>> {
  // login (lowercase) -> display name
  const roster = new Map<string, string>();
  for (let page = 1; page <= 5; page++) {
    const res = await fetch(
      `${GH}/repos/${COURSE_REPO}/pulls?state=all&per_page=100&page=${page}`,
      { headers: ghHeaders() }
    );
    if (!res.ok) throw new Error(`GitHub API ${res.status}`);
    const prs = (await res.json()) as {
      head: { ref: string };
      user: { login: string; type: string } | null;
    }[];
    if (prs.length === 0) break;

    for (const pr of prs) {
      if (!pr.head.ref.startsWith("participants/")) continue;
      const author = pr.user;
      if (!author || author.type !== "User") continue;
      const login = author.login.toLowerCase();
      if (STAFF.has(login)) continue;
      // Guard against staff-submitted-on-behalf PRs: the branch tail must
      // actually reference the author's handle.
      const tail = pr.head.ref.split("/").pop() ?? "";
      if (!tail.toLowerCase().startsWith(login)) continue;
      if (!roster.has(login)) roster.set(login, author.login);
    }
    if (prs.length < 100) break;
  }
  return roster;
}

async function displayName(login: string): Promise<string> {
  try {
    const res = await fetch(`${GH}/users/${encodeURIComponent(login)}`, {
      headers: ghHeaders(),
    });
    if (!res.ok) return login;
    const u = (await res.json()) as { name: string | null; login: string };
    return u.name?.trim() || u.login;
  } catch {
    return login;
  }
}

async function main() {
  const roster = await fetchParticipants();
  console.log(`Found ${roster.size} cohort members in course-repo PRs.`);

  let created = 0;
  for (const [, login] of roster) {
    const name = await displayName(login);
    const inserted = await db
      .insert(users)
      .values({
        githubLogin: login,
        name,
        onboarding: "new",
      })
      .onConflictDoNothing({ target: users.githubLogin })
      .returning({ id: users.id });
    if (inserted.length) {
      created++;
      console.log(`  reserved: ${login} (${name})`);
    }
  }
  console.log(`Reserved ${created} new unclaimed accounts (existing rows untouched).`);
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  }
);
