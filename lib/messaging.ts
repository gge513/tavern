import { and, eq, inArray, or, sql } from "drizzle-orm";

import { bartenderNextStep } from "@/lib/ai";
import { db } from "@/lib/db";
import {
  conversationParticipants,
  conversations,
  messages,
  notifications,
  projectMembers,
  tavernSessions,
  users,
} from "@/lib/db/schema";
import { profileForMatching } from "@/lib/matching";

/**
 * Conversation access + the message send path. One model for DMs, channels,
 * project chat, threads, and tavern sessions — access rules differ by kind:
 *  - channel: any signed-in user (announcements: only admins may post)
 *  - dm: participants only
 *  - project / thread: project members only
 *  - tavern: the owner only
 */
export async function canAccess(userId: number, conversationId: number): Promise<
  | { ok: false }
  | { ok: true; canPost: boolean; convo: typeof conversations.$inferSelect }
> {
  const convo = await db.query.conversations.findFirst({
    where: eq(conversations.id, conversationId),
  });
  if (!convo) return { ok: false };

  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user) return { ok: false };

  if (convo.kind === "channel") {
    if (convo.archived) return { ok: true, canPost: false, convo };
    return { ok: true, canPost: convo.isAnnouncements ? user.isAdmin : true, convo };
  }

  if (convo.kind === "dm" || convo.kind === "tavern") {
    const part = await db.query.conversationParticipants.findFirst({
      where: and(
        eq(conversationParticipants.conversationId, conversationId),
        eq(conversationParticipants.userId, userId)
      ),
    });
    return part ? { ok: true, canPost: true, convo } : { ok: false };
  }

  // project or thread
  const projectId = convo.projectId;
  if (!projectId) return { ok: false };
  const member = await db.query.projectMembers.findFirst({
    where: and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)),
  });
  return member ? { ok: true, canPost: true, convo } : { ok: false };
}

export type SendOptions = {
  structuredType?: "question" | "decision" | "blocker" | "help" | "action" | null;
  ownerId?: number | null;
};

export async function sendMessage(
  userId: number,
  conversationId: number,
  content: string,
  opts: SendOptions = {}
): Promise<{ ok: boolean }> {
  const trimmed = content.trim();
  if (!trimmed) return { ok: false };
  const access = await canAccess(userId, conversationId);
  if (!access.ok || !access.canPost) return { ok: false };

  await db.insert(messages).values({
    conversationId,
    senderId: userId,
    senderKind: "user",
    content: trimmed.slice(0, 4000),
    structuredType: opts.structuredType ?? null,
    ownerId: opts.ownerId ?? null,
    resolved: opts.structuredType === "decision" ? false : null,
  });
  await db
    .update(conversations)
    .set({ lastActivityAt: new Date() })
    .where(eq(conversations.id, conversationId));

  await fanOutNotifications(userId, access.convo, trimmed);

  if (access.convo.kind === "dm" && access.convo.introState === "opened") {
    await maybeBartenderNextStep(access.convo.id);
  }
  return { ok: true };
}

/** In-app notifications on DM and @mention (course baseline). */
async function fanOutNotifications(
  senderId: number,
  convo: typeof conversations.$inferSelect,
  content: string
) {
  const sender = await db.query.users.findFirst({ where: eq(users.id, senderId) });
  const senderName = sender?.name ?? "Someone";
  const href = hrefFor(convo);

  const notified = new Set<number>([senderId]);

  // @mentions: match @github-login tokens against users who can see this conversation.
  const handles = [...content.matchAll(/@([A-Za-z0-9-]{2,})/g)].map((m) => m[1].toLowerCase());
  if (handles.length) {
    const mentioned = await db
      .select()
      .from(users)
      .where(inArray(sql`lower(${users.githubLogin})`, handles));
    for (const m of mentioned) {
      if (notified.has(m.id)) continue;
      const access = await canAccess(m.id, convo.id);
      if (!access.ok) continue;
      notified.add(m.id);
      await db.insert(notifications).values({
        userId: m.id,
        kind: "mention",
        content: `${senderName} mentioned you: "${content.slice(0, 80)}"`,
        href,
      });
    }
  }

  if (convo.kind === "dm") {
    const parts = await db.query.conversationParticipants.findMany({
      where: eq(conversationParticipants.conversationId, convo.id),
    });
    for (const p of parts) {
      if (notified.has(p.userId)) continue;
      notified.add(p.userId);
      await db.insert(notifications).values({
        userId: p.userId,
        kind: "dm",
        content: `${senderName}: "${content.slice(0, 80)}"`,
        href,
      });
    }
  }
}

export function hrefFor(convo: {
  id: number;
  kind: string;
  projectId: number | null;
}): string {
  switch (convo.kind) {
    case "channel":
      return `/channels/${convo.id}`;
    case "dm":
      return `/messages/${convo.id}`;
    case "tavern":
      return `/tavern/${convo.id}`;
    case "thread":
      return `/projects/${convo.projectId}/threads/${convo.id}`;
    default:
      return `/projects/${convo.projectId}`;
  }
}

/**
 * Introduction state machine (spec 5.4): after the intro message, once both
 * humans have spoken, the bartender offers exactly one next step and steps
 * back — permanently, for this conversation.
 */
async function maybeBartenderNextStep(conversationId: number) {
  const parts = await db.query.conversationParticipants.findMany({
    where: eq(conversationParticipants.conversationId, conversationId),
  });
  if (parts.length !== 2) return;
  const msgs = await db.query.messages.findMany({
    where: eq(messages.conversationId, conversationId),
    orderBy: (m, { asc }) => [asc(m.id)],
  });
  const spoken = new Set(
    msgs.filter((m) => m.senderKind === "user" && m.senderId).map((m) => m.senderId)
  );
  if (!(spoken.has(parts[0].userId) && spoken.has(parts[1].userId))) return;

  // Claim the closing move before the slow AI call so a concurrent send
  // doesn't produce two next-step messages.
  const claimed = await db
    .update(conversations)
    .set({ introState: "stepped_back" })
    .where(and(eq(conversations.id, conversationId), eq(conversations.introState, "opened")))
    .returning({ id: conversations.id });
  if (claimed.length === 0) return;

  const [a, b] = await Promise.all([
    profileForMatching(parts[0].userId),
    profileForMatching(parts[1].userId),
  ]);
  const names = new Map<number, string>();
  for (const p of parts) {
    const u = await db.query.users.findFirst({ where: eq(users.id, p.userId) });
    names.set(p.userId, u?.name ?? "Student");
  }
  const transcript = msgs.map((m) => ({
    speaker: m.senderKind === "bartender" ? "Bartender" : names.get(m.senderId ?? -1) ?? "Student",
    content: m.content,
  }));

  const text =
    (a && b && (await bartenderNextStep({ a, b, transcript }))) ??
    "One suggestion before I step back: compare your week-one submissions and each name one thing you'd borrow from the other's. I'll leave you to it.";

  await db.insert(messages).values({
    conversationId,
    senderKind: "bartender",
    content: text,
  });
}

/** Find or create the plain DM between two users (excluding intro-DMs is unnecessary — one DM per pair). */
export async function getOrCreateDm(a: number, b: number): Promise<number> {
  const mine = await db
    .select({ conversationId: conversationParticipants.conversationId })
    .from(conversationParticipants)
    .innerJoin(conversations, eq(conversations.id, conversationParticipants.conversationId))
    .where(and(eq(conversationParticipants.userId, a), eq(conversations.kind, "dm")));
  if (mine.length) {
    const theirs = await db.query.conversationParticipants.findFirst({
      where: and(
        inArray(
          conversationParticipants.conversationId,
          mine.map((m) => m.conversationId)
        ),
        eq(conversationParticipants.userId, b)
      ),
    });
    if (theirs) return theirs.conversationId;
  }
  const [convo] = await db
    .insert(conversations)
    .values({ kind: "dm" })
    .returning({ id: conversations.id });
  await db.insert(conversationParticipants).values([
    { conversationId: convo.id, userId: a },
    { conversationId: convo.id, userId: b },
  ]);
  return convo.id;
}

/** All conversations of kind tavern owned by the user, via tavern_sessions. */
export async function tavernSessionsFor(userId: number) {
  return db.query.tavernSessions.findMany({
    where: eq(tavernSessions.ownerId, userId),
    orderBy: (t, { desc }) => [desc(t.id)],
  });
}

/** Shared tables the user was invited to (participant, not owner). */
export async function sharedTablesFor(userId: number) {
  const rows = await db
    .select({
      id: tavernSessions.id,
      outcome: tavernSessions.outcome,
      createdAt: tavernSessions.createdAt,
      ownerName: users.name,
    })
    .from(tavernSessions)
    .innerJoin(
      conversationParticipants,
      eq(conversationParticipants.conversationId, tavernSessions.conversationId)
    )
    .innerJoin(users, eq(users.id, tavernSessions.ownerId))
    .where(
      and(
        eq(conversationParticipants.userId, userId),
        eq(tavernSessions.shared, true),
        sql`${tavernSessions.ownerId} <> ${userId}`
      )
    )
    .orderBy(sql`${tavernSessions.id} desc`);
  return rows;
}

export async function listMessages(conversationId: number, afterId?: number) {
  return db
    .select({
      id: messages.id,
      content: messages.content,
      senderKind: messages.senderKind,
      structuredType: messages.structuredType,
      ownerId: messages.ownerId,
      resolved: messages.resolved,
      createdAt: messages.createdAt,
      senderId: messages.senderId,
      senderName: users.name,
      senderAvatar: users.avatarUrl,
      senderIsSeed: users.isSeed,
    })
    .from(messages)
    .leftJoin(users, eq(users.id, messages.senderId))
    .where(
      afterId
        ? and(eq(messages.conversationId, conversationId), sql`${messages.id} > ${afterId}`)
        : eq(messages.conversationId, conversationId)
    )
    .orderBy(messages.id)
    .limit(500);
}
