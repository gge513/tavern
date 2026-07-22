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
    draftMessage =
      (await bartenderInviteDraft({
        transcript: history.map((m) => ({
          speaker: m.senderKind === "bartender" ? "bartender" : "you",
          content: m.content,
        })),
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
