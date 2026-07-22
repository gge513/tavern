"use server";

import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { bartenderInviteDraft } from "@/lib/ai";
import { currentUser } from "@/lib/current-user";
import { db } from "@/lib/db";
import { conversationParticipants, conversations, messages, tavernSessions } from "@/lib/db/schema";
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

  redirect(`/tavern/${session.id}`);
}

export type LedgerColumn = "said" | "assuming" | "unknown";

const LEDGER_ORDER: LedgerColumn[] = ["said", "assuming", "unknown"];

async function ownSession(sessionId: number, userId: number) {
  return db.query.tavernSessions.findFirst({
    where: and(eq(tavernSessions.id, sessionId), eq(tavernSessions.ownerId, userId)),
  });
}

/** Add a card to the thinking ledger. */
export async function addLedgerItemAction(
  sessionId: number,
  column: LedgerColumn,
  formData: FormData
) {
  const user = await currentUser();
  if (!user) redirect("/signin");
  const session = await ownSession(sessionId, user.id);
  if (!session || session.outcome) return;
  const text = String(formData.get("text") ?? "").trim().slice(0, 200);
  if (!text) return;
  const ledger = { said: [], assuming: [], unknown: [], ...(session.ledger ?? {}) };
  ledger[column] = [...(ledger[column] ?? []), text];
  await db.update(tavernSessions).set({ ledger }).where(eq(tavernSessions.id, sessionId));
  revalidatePath(`/tavern/${sessionId}`);
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
  const session = await ownSession(sessionId, user.id);
  if (!session || session.outcome) return;
  const ledger = { said: [], assuming: [], unknown: [], ...(session.ledger ?? {}) };
  const items = [...(ledger[column] ?? [])];
  const [item] = items.splice(index, 1);
  if (item === undefined) return;
  const next = LEDGER_ORDER[(LEDGER_ORDER.indexOf(column) + 1) % LEDGER_ORDER.length];
  ledger[column] = items;
  ledger[next] = [...(ledger[next] ?? []), item];
  await db.update(tavernSessions).set({ ledger }).where(eq(tavernSessions.id, sessionId));
  revalidatePath(`/tavern/${sessionId}`);
}

export async function removeLedgerItemAction(
  sessionId: number,
  column: LedgerColumn,
  index: number
) {
  const user = await currentUser();
  if (!user) redirect("/signin");
  const session = await ownSession(sessionId, user.id);
  if (!session || session.outcome) return;
  const ledger = { said: [], assuming: [], unknown: [], ...(session.ledger ?? {}) };
  const items = [...(ledger[column] ?? [])];
  items.splice(index, 1);
  ledger[column] = items;
  await db.update(tavernSessions).set({ ledger }).where(eq(tavernSessions.id, sessionId));
  revalidatePath(`/tavern/${sessionId}`);
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

  revalidatePath(`/tavern/${sessionId}`);
}
