import { and, eq, inArray, or, sql } from "drizzle-orm";

import { bartenderNextStep } from "@/lib/ai";
import { db } from "@/lib/db";
import {
  conversationParticipants,
  conversations,
  messageReactions,
  messages,
  notifications,
  projectMembers,
  tavernSessions,
  users,
} from "@/lib/db/schema";
import { profileForMatching } from "@/lib/matching";
import { REACTION_EMOJIS, type ReactionSummary } from "@/lib/reactions";

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
  const excerpt = content.slice(0, 80);

  const notified = new Set<number>([senderId]);
  // Recipients accumulate here and are written in one statement at the end.
  // Reported as an N+1 by @arjun-singh2127 in #14: this used to run an access
  // check plus an insert per mentioned user, and canAccess re-read the
  // conversation and the user row every time, so a message naming ten people
  // cost roughly forty round trips. It is now two queries at most, whatever
  // the mention count.
  const rows: (typeof notifications.$inferInsert)[] = [];

  // @mentions: match @github-login tokens against users who can see this conversation.
  const handles = [...content.matchAll(/@([A-Za-z0-9-]{2,})/g)].map((m) => m[1].toLowerCase());
  if (handles.length) {
    const mentioned = await db
      .select()
      .from(users)
      .where(inArray(sql`lower(${users.githubLogin})`, handles));
    const candidates = mentioned.filter((m) => !notified.has(m.id));
    const visible = await visibleTo(
      convo,
      candidates.map((m) => m.id)
    );
    for (const m of candidates) {
      if (!visible.has(m.id)) continue;
      notified.add(m.id);
      rows.push({
        userId: m.id,
        kind: "mention",
        content: `${senderName} mentioned you: "${excerpt}"`,
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
      rows.push({
        userId: p.userId,
        kind: "dm",
        content: `${senderName}: "${excerpt}"`,
        href,
      });
    }
  }

  if (rows.length) await db.insert(notifications).values(rows);
}

/**
 * Which of `ids` can see `convo`, resolved in one query instead of one per
 * user. This is canAccess()'s `ok` branch and nothing more: canAccess stays
 * the single gate on every send path, and this exists only so notification
 * fan-out stops calling it in a loop.
 *
 * The per-kind rules must stay identical to canAccess or a mention could
 * notify someone who cannot open the room it was written in, which is the
 * leak the per-user check was there to prevent:
 *  - channel: visible to everyone (archived only removes canPost, not access)
 *  - dm / tavern: needs a participant row
 *  - project / thread: needs project membership, and a conversation with no
 *    projectId is visible to nobody
 */
async function visibleTo(
  convo: typeof conversations.$inferSelect,
  ids: number[]
): Promise<Set<number>> {
  if (!ids.length) return new Set();

  if (convo.kind === "channel") return new Set(ids);

  if (convo.kind === "dm" || convo.kind === "tavern") {
    const parts = await db
      .select({ userId: conversationParticipants.userId })
      .from(conversationParticipants)
      .where(
        and(
          eq(conversationParticipants.conversationId, convo.id),
          inArray(conversationParticipants.userId, ids)
        )
      );
    return new Set(parts.map((p) => p.userId));
  }

  // project or thread
  if (!convo.projectId) return new Set();
  const members = await db
    .select({ userId: projectMembers.userId })
    .from(projectMembers)
    .where(
      and(
        eq(projectMembers.projectId, convo.projectId),
        inArray(projectMembers.userId, ids)
      )
    );
  return new Set(members.map((m) => m.userId));
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
      return `/snug/${convo.id}`;
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

/**
 * Reaction summaries for a whole conversation, grouped message × emoji.
 * Returned on every poll (reactions land on old messages, so a since-cursor
 * can't carry them) — cheap at the 500-message conversation cap.
 */
export async function listReactions(
  conversationId: number,
  viewerId: number
): Promise<ReactionSummary[]> {
  const rows = await db
    .select({
      messageId: messageReactions.messageId,
      emoji: messageReactions.emoji,
      count: sql<number>`count(*)::int`,
      mine: sql<boolean>`bool_or(${messageReactions.userId} = ${viewerId})`,
      names: sql<string[]>`array_agg(${users.name} order by ${messageReactions.id})`,
    })
    .from(messageReactions)
    .innerJoin(messages, eq(messages.id, messageReactions.messageId))
    .innerJoin(users, eq(users.id, messageReactions.userId))
    .where(eq(messages.conversationId, conversationId))
    .groupBy(messageReactions.messageId, messageReactions.emoji);
  return rows;
}

/**
 * Toggle one user's reaction on a message. Read access to the conversation is
 * enough — you can raise a glass in #announcements or an archived channel
 * even where you can't post.
 */
export async function toggleReaction(
  userId: number,
  messageId: number,
  emoji: string
): Promise<{ ok: boolean }> {
  if (!REACTION_EMOJIS.has(emoji)) return { ok: false };
  const msg = await db.query.messages.findFirst({ where: eq(messages.id, messageId) });
  if (!msg) return { ok: false };
  const access = await canAccess(userId, msg.conversationId);
  if (!access.ok) return { ok: false };

  const removed = await db
    .delete(messageReactions)
    .where(
      and(
        eq(messageReactions.messageId, messageId),
        eq(messageReactions.userId, userId),
        eq(messageReactions.emoji, emoji)
      )
    )
    .returning({ id: messageReactions.id });
  if (removed.length === 0) {
    await db
      .insert(messageReactions)
      .values({ messageId, userId, emoji })
      .onConflictDoNothing();
  }
  return { ok: true };
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
