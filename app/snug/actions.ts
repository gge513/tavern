"use server";

import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { bartenderInviteDraft, bartenderTable } from "@/lib/ai";
import { currentUser } from "@/lib/current-user";
import { db } from "@/lib/db";
import {
  conversationParticipants,
  conversations,
  messages,
  notifications,
  tavernSessions,
  users,
} from "@/lib/db/schema";
import { listMessages } from "@/lib/messaging";

export async function openTavernSessionAction() {
  const user = await currentUser();
  if (!user) redirect("/signin");

  const [convo] = await db
    .insert(conversations)
    .values({ kind: "tavern" })
    .returning({ id: conversations.id });
  await db.insert(conversationParticipants).values({ conversationId: convo.id, userId: user.id });
  const [session] = await db
    .insert(tavernSessions)
    .values({ ownerId: user.id, conversationId: convo.id })
    .returning({ id: tavernSessions.id });

  await db.insert(messages).values({
    conversationId: convo.id,
    senderKind: "bartender",
    content:
      "Quiet corner, just us — nothing here is shared unless you choose to share it. What happened? Start with the parts you know directly: what was actually said or done, before any reading of it.",
  });

  redirect(`/snug/${session.id}`);
}

export type LedgerColumn = "said" | "assuming" | "unknown";

const LEDGER_ORDER: LedgerColumn[] = ["said", "assuming", "unknown"];

async function ownSession(sessionId: number, userId: number) {
  return db.query.tavernSessions.findFirst({
    where: and(eq(tavernSessions.id, sessionId), eq(tavernSessions.ownerId, userId)),
  });
}

/** Owner always; an invited collaborator too, once the table is shared. */
async function sessionForParticipant(sessionId: number, userId: number) {
  const session = await db.query.tavernSessions.findFirst({
    where: eq(tavernSessions.id, sessionId),
  });
  if (!session) return null;
  if (session.ownerId === userId) return session;
  if (!session.shared) return null;
  const part = await db.query.conversationParticipants.findFirst({
    where: and(
      eq(conversationParticipants.conversationId, session.conversationId),
      eq(conversationParticipants.userId, userId)
    ),
  });
  return part ? session : null;
}

/**
 * Bring a collaborator into the snug. Owner-only, explicit, and loud about what it means:
 * the invitee sees everything already said in this session. The bartender
 * switches to facilitator mode and only speaks when summoned.
 */
export async function inviteToTableAction(sessionId: number, formData: FormData) {
  const user = await currentUser();
  if (!user) redirect("/signin");
  const session = await ownSession(sessionId, user.id);
  if (!session || session.outcome) return;

  const inviteeId = Number(formData.get("userId"));
  if (!Number.isInteger(inviteeId) || inviteeId === user.id) return;
  const invitee = await db.query.users.findFirst({ where: eq(users.id, inviteeId) });
  if (!invitee) return;

  await db
    .insert(conversationParticipants)
    .values({ conversationId: session.conversationId, userId: inviteeId })
    .onConflictDoNothing();
  await db
    .update(tavernSessions)
    .set({ shared: true })
    .where(eq(tavernSessions.id, sessionId));

  await db.insert(messages).values({
    conversationId: session.conversationId,
    senderKind: "system",
    content: `${user.name} brought ${invitee.name} into the snug. The room is now shared between the two of you — everything said here is visible to both. Ring the bell when you want the bartender's read.`,
  });

  if (!invitee.isSeed) {
    await db.insert(notifications).values({
      userId: inviteeId,
      kind: "introduction",
      content: `${user.name} brought you into the snug — a live thinking session for two.`,
      href: `/snug/${sessionId}`,
    });
  }
  revalidatePath(`/snug/${sessionId}`);
}

/** The bell: either participant summons the facilitator. */
export async function summonBartenderAction(sessionId: number) {
  const user = await currentUser();
  if (!user) redirect("/signin");
  const session = await sessionForParticipant(sessionId, user.id);
  if (!session || session.outcome || !session.shared) return;

  const parts = await db
    .select({ id: users.id, name: users.name })
    .from(conversationParticipants)
    .innerJoin(users, eq(users.id, conversationParticipants.userId))
    .where(eq(conversationParticipants.conversationId, session.conversationId));
  const names = new Map(parts.map((p) => [p.id, p.name]));

  const history = await listMessages(session.conversationId);
  const l = session.ledger;
  const ledgerText =
    l && (l.said?.length || l.assuming?.length || l.unknown?.length)
      ? `Said: ${l.said?.join("; ") || "none"}. Assuming: ${l.assuming?.join("; ") || "none"}. Unknown: ${l.unknown?.join("; ") || "none"}.`
      : undefined;

  const reply =
    (await bartenderTable({
      names: parts.map((p) => p.name),
      transcript: history.map((m) => ({
        speaker:
          m.senderKind === "bartender"
            ? "Bartender"
            : m.senderKind === "system"
              ? "(the room)"
              : names.get(m.senderId ?? -1) ?? "Someone",
        content: m.content,
      })),
      ledger: ledgerText,
    })) ??
    "Here's what I can offer from behind the bar: you each have a version of this, and at least one thing you both already treat as true. Say that shared thing out loud first, then name the one point where your readings split — that's the conversation. I'll be over here.";

  await db.insert(messages).values({
    conversationId: session.conversationId,
    senderKind: "bartender",
    content: reply,
  });
  await db
    .update(conversations)
    .set({ lastActivityAt: new Date() })
    .where(eq(conversations.id, session.conversationId));
  revalidatePath(`/snug/${sessionId}`);
}

/** Add a card to the thinking ledger. */
export async function addLedgerItemAction(
  sessionId: number,
  column: LedgerColumn,
  formData: FormData
) {
  const user = await currentUser();
  if (!user) redirect("/signin");
  const session = await sessionForParticipant(sessionId, user.id);
  if (!session || session.outcome) return;
  const text = String(formData.get("text") ?? "").trim().slice(0, 200);
  if (!text) return;
  const ledger = { said: [], assuming: [], unknown: [], ...(session.ledger ?? {}) };
  ledger[column] = [...(ledger[column] ?? []), text];
  await db.update(tavernSessions).set({ ledger }).where(eq(tavernSessions.id, sessionId));
  revalidatePath(`/snug/${sessionId}`);
}

/**
 * Reclassify a card: said → assuming → unknown → said. The point of the
 * discipline is noticing that something you filed as fact was a reading.
 */
export async function cycleLedgerItemAction(
  sessionId: number,
  column: LedgerColumn,
  index: number
) {
  const user = await currentUser();
  if (!user) redirect("/signin");
  const session = await sessionForParticipant(sessionId, user.id);
  if (!session || session.outcome) return;
  const ledger = { said: [], assuming: [], unknown: [], ...(session.ledger ?? {}) };
  const items = [...(ledger[column] ?? [])];
  const [item] = items.splice(index, 1);
  if (item === undefined) return;
  const next = LEDGER_ORDER[(LEDGER_ORDER.indexOf(column) + 1) % LEDGER_ORDER.length];
  ledger[column] = items;
  ledger[next] = [...(ledger[next] ?? []), item];
  await db.update(tavernSessions).set({ ledger }).where(eq(tavernSessions.id, sessionId));
  revalidatePath(`/snug/${sessionId}`);
}

export async function removeLedgerItemAction(
  sessionId: number,
  column: LedgerColumn,
  index: number
) {
  const user = await currentUser();
  if (!user) redirect("/signin");
  const session = await sessionForParticipant(sessionId, user.id);
  if (!session || session.outcome) return;
  const ledger = { said: [], assuming: [], unknown: [], ...(session.ledger ?? {}) };
  const items = [...(ledger[column] ?? [])];
  items.splice(index, 1);
  ledger[column] = items;
  await db.update(tavernSessions).set({ ledger }).where(eq(tavernSessions.id, sessionId));
  revalidatePath(`/snug/${sessionId}`);
}

/** Every visit ends in one of four states (spec 5.7). */
export async function endTavernSessionAction(
  sessionId: number,
  outcome: "act" | "invite" | "clarify" | "release"
) {
  const user = await currentUser();
  if (!user) redirect("/signin");

  const session = await db.query.tavernSessions.findFirst({
    where: and(eq(tavernSessions.id, sessionId), eq(tavernSessions.ownerId, user.id)),
  });
  if (!session || session.outcome) return;

  let draftMessage: string | null = null;
  if (outcome === "invite") {
    const history = await listMessages(session.conversationId);
    const transcript = history.map((m) => ({
      speaker: (m.senderKind === "bartender" ? "bartender" : "you") as "you" | "bartender",
      content: m.content,
    }));
    const l = session.ledger;
    if (l && (l.said?.length || l.assuming?.length || l.unknown?.length)) {
      transcript.push({
        speaker: "you",
        content: `My ledger — Said (facts): ${l.said?.join("; ") || "none"}. Assuming: ${l.assuming?.join("; ") || "none"}. Unknown: ${l.unknown?.join("; ") || "none"}.`,
      });
    }
    draftMessage =
      (await bartenderInviteDraft({
        transcript,
      })) ??
      "I've been chewing on something and want to bring it to the group: here's what I know, here's what I'm unsure about, and here's the one thing I'd like a read on.";
  }

  await db
    .update(tavernSessions)
    .set({ outcome, draftMessage })
    .where(eq(tavernSessions.id, sessionId));

  const closing: Record<string, string> = {
    act: "Ended in Act. You know your next move — go make it.",
    invite:
      "Ended in Invite. Below the session you'll find a drafted message to bring back to your project. It's yours to edit, post, or discard — nothing leaves this room on its own.",
    clarify:
      "Ended in Clarify. The move is a direct question to the person who has the missing context — ask them, not the room.",
    release:
      "Ended in Release. Some things don't need action; naming that is the action. Door's always open.",
  };
  await db.insert(messages).values({
    conversationId: session.conversationId,
    senderKind: "system",
    content: closing[outcome],
  });

  revalidatePath(`/snug/${sessionId}`);
}
