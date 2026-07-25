import { eq } from "drizzle-orm";
import { db } from "../lib/db";
import { users, conversations } from "../lib/db/schema";
import {
  getOrCreateDm,
  sendMessage,
  canAccess,
  listMessages,
  listReactions,
  toggleReaction,
} from "../lib/messaging";

const mara = await db.query.users.findFirst({ where: eq(users.githubLogin, "seed-mara-v") });
const jordan = await db.query.users.findFirst({ where: eq(users.githubLogin, "seed-jordan-k") });
const george = await db.query.users.findFirst({ where: eq(users.githubLogin, "gge513") });
if (!mara || !jordan || !george) throw new Error("seed users missing");

// 1. DM path: create, send, persist, both sides see it
const dm = await getOrCreateDm(mara.id, jordan.id);
const dm2 = await getOrCreateDm(mara.id, jordan.id);
console.log("dm idempotent:", dm === dm2);
const sent = await sendMessage(mara.id, dm, "Testing the message path @seed-jordan-k");
console.log("dm send ok:", sent.ok);
const msgs = await listMessages(dm);
console.log("dm persisted:", msgs.some((m) => m.content.includes("Testing the message path")));
const jordanAccess = await canAccess(jordan.id, dm);
const georgeAccess = await canAccess(george.id, dm);
console.log("participant can access:", jordanAccess.ok, "| outsider blocked:", !georgeAccess.ok);

// 2. Channels: general open to all; announcements admin-only
const general = await db.query.conversations.findFirst({
  where: (c, { and, eq: e }) => and(e(c.kind, "channel"), e(c.name, "general")),
});
const ann = await db.query.conversations.findFirst({
  where: (c, { and, eq: e }) => and(e(c.kind, "channel"), e(c.name, "announcements")),
});
const gAcc = await canAccess(mara.id, general!.id);
const aAccMara = await canAccess(mara.id, ann!.id);
const aAccGeorge = await canAccess(george.id, ann!.id);
console.log("general postable:", gAcc.ok && gAcc.canPost);
console.log("announcements read-not-post for member:", aAccMara.ok && !aAccMara.canPost);
console.log("announcements postable by admin:", aAccGeorge.ok && aAccGeorge.canPost);

// 3. Mention notification landed for jordan
const { notifications } = await import("../lib/db/schema");
const notes = await db.query.notifications.findMany({ where: eq(notifications.userId, jordan.id) });
console.log("mention+dm notifications:", notes.length >= 1, notes.map((n) => n.kind).join(","));

// 4. Reactions: toggle on, aggregate, toggle off; outsider + off-set emoji blocked
const target = msgs[msgs.length - 1];
const on = await toggleReaction(jordan.id, target.id, "🍻");
const withR = await listReactions(dm, jordan.id);
const pill = withR.find((r) => r.messageId === target.id && r.emoji === "🍻");
console.log("reaction on:", on.ok && pill?.count === 1 && pill?.mine === true);
const outsider = await toggleReaction(george.id, target.id, "🍻");
const badEmoji = await toggleReaction(jordan.id, target.id, "💀");
console.log("reaction outsider blocked:", !outsider.ok, "| off-set emoji blocked:", !badEmoji.ok);
const off = await toggleReaction(jordan.id, target.id, "🍻");
const cleared = await listReactions(dm, jordan.id);
console.log(
  "reaction off:",
  off.ok && !cleared.some((r) => r.messageId === target.id && r.emoji === "🍻")
);
process.exit(0);
