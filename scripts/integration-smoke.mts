import { eq } from "drizzle-orm";
import { db } from "../lib/db";
import { users, notifications } from "../lib/db/schema";
import {
  getOrCreateDm,
  sendMessage,
  canAccess,
  listMessages,
  listReactions,
  toggleReaction,
} from "../lib/messaging";

/**
 * Integration smoke over the messaging and access-control paths.
 *
 * This script WRITES: it sends real messages and toggles real reactions. In CI
 * it runs against a throwaway Neon branch (see .github/workflows/ci.yml). Run
 * locally and it writes to whatever DATABASE_URL points at, which is why the
 * target host is printed before anything happens.
 *
 * Every check goes through check(), which records a failure and drives the
 * exit code. A failing assertion must fail the process — an earlier version
 * logged booleans and exited 0, so a broken access rule still read as green.
 */

type Result = { name: string; ok: boolean; detail?: string };
const results: Result[] = [];

function check(name: string, ok: boolean, detail?: string) {
  results.push({ name, ok, detail });
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`
  );
}

function hostOf(url: string | undefined): string {
  if (!url) return "(DATABASE_URL unset)";
  try {
    return new URL(url).host;
  } catch {
    return "(unparseable DATABASE_URL)";
  }
}

async function main() {
  // Say out loud what is about to be written to. Silent prod writes are how
  // a smoke test quietly becomes a production incident.
  console.log(`smoke target: ${hostOf(process.env.DATABASE_URL)}\n`);

  const mara = await db.query.users.findFirst({
    where: eq(users.githubLogin, "seed-mara-v"),
  });
  const jordan = await db.query.users.findFirst({
    where: eq(users.githubLogin, "seed-jordan-k"),
  });
  const george = await db.query.users.findFirst({
    where: eq(users.githubLogin, "gge513"),
  });
  if (!mara || !jordan || !george) {
    throw new Error(
      "seed users missing — run `npm run db:seed` against this database first"
    );
  }

  // 1. DM path: create, send, persist, participants in, outsiders out.
  const dm = await getOrCreateDm(mara.id, jordan.id);
  const dm2 = await getOrCreateDm(mara.id, jordan.id);
  check("dm is idempotent", dm === dm2, `${dm} vs ${dm2}`);

  const sent = await sendMessage(
    mara.id,
    dm,
    "Testing the message path @seed-jordan-k"
  );
  check("dm send succeeds", sent.ok);

  const msgs = await listMessages(dm);
  check(
    "dm message persists",
    msgs.some((m) => m.content.includes("Testing the message path"))
  );

  const jordanAccess = await canAccess(jordan.id, dm);
  check("dm participant can access", jordanAccess.ok);
  const georgeAccess = await canAccess(george.id, dm);
  check("dm outsider is blocked", !georgeAccess.ok);

  // 2. Channels: #general open to all, #announcements admin-post only.
  const general = await db.query.conversations.findFirst({
    where: (c, { and, eq: e }) => and(e(c.kind, "channel"), e(c.name, "general")),
  });
  const ann = await db.query.conversations.findFirst({
    where: (c, { and, eq: e }) =>
      and(e(c.kind, "channel"), e(c.name, "announcements")),
  });
  if (!general || !ann) {
    throw new Error("#general or #announcements missing — reseed this database");
  }

  const gAcc = await canAccess(mara.id, general.id);
  check("general is postable by a member", gAcc.ok && gAcc.canPost);

  const aAccMara = await canAccess(mara.id, ann.id);
  check(
    "announcements is read-not-post for a member",
    aAccMara.ok && !aAccMara.canPost
  );

  const aAccGeorge = await canAccess(george.id, ann.id);
  check(
    "announcements is postable by an admin",
    aAccGeorge.ok && aAccGeorge.canPost
  );

  // 3. The @mention in the DM above notified the mentioned user.
  const notes = await db.query.notifications.findMany({
    where: eq(notifications.userId, jordan.id),
  });
  check(
    "mention/dm notification landed",
    notes.length >= 1,
    notes.map((n) => n.kind).join(",") || "none"
  );

  // 4. Reactions: toggle on, aggregate, outsider and off-set blocked, toggle off.
  const target = msgs[msgs.length - 1];
  const on = await toggleReaction(jordan.id, target.id, "🍻");
  const withR = await listReactions(dm, jordan.id);
  const pill = withR.find((r) => r.messageId === target.id && r.emoji === "🍻");
  check(
    "reaction toggles on and aggregates",
    on.ok && pill?.count === 1 && pill?.mine === true,
    `count=${pill?.count ?? 0} mine=${pill?.mine ?? false}`
  );

  const outsider = await toggleReaction(george.id, target.id, "🍻");
  check("reaction from an outsider is blocked", !outsider.ok);

  const badEmoji = await toggleReaction(jordan.id, target.id, "💀");
  check("reaction outside the house set is blocked", !badEmoji.ok);

  const off = await toggleReaction(jordan.id, target.id, "🍻");
  const cleared = await listReactions(dm, jordan.id);
  check(
    "reaction toggles back off",
    off.ok &&
      !cleared.some((r) => r.messageId === target.id && r.emoji === "🍻")
  );
}

main().then(
  () => {
    const failed = results.filter((r) => !r.ok);
    console.log(
      `\n${results.length - failed.length}/${results.length} checks passed`
    );
    if (failed.length > 0) {
      console.error(
        `\nFAILED: ${failed.map((r) => r.name).join(", ")}`
      );
      process.exit(1);
    }
    process.exit(0);
  },
  (err) => {
    console.error("\nsmoke aborted:", err);
    process.exit(1);
  }
);
