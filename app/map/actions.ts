"use server";

import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";

import { bartenderIntroduction } from "@/lib/ai";
import { currentUser } from "@/lib/current-user";
import { db } from "@/lib/db";
import { conversations, matches, messages, notifications, users } from "@/lib/db/schema";
import { profileForMatching } from "@/lib/matching";
import { getOrCreateDm } from "@/lib/messaging";

/**
 * Spec 5.4: no match-approval step. Selecting a suggested collaborator opens
 * the conversation immediately, with the bartender joining briefly.
 */
export async function openIntroductionAction(matchId: number) {
  const user = await currentUser();
  if (!user) redirect("/signin");

  const match = await db.query.matches.findFirst({
    where: and(eq(matches.id, matchId), eq(matches.userAId, user.id)),
  });
  if (!match) redirect("/map");
  if (match.conversationId) redirect(`/messages/${match.conversationId}`);

  const conversationId = await getOrCreateDm(user.id, match.userBId);

  // Only stage the bartender if this DM is brand new (no messages yet).
  const existing = await db.query.messages.findFirst({
    where: eq(messages.conversationId, conversationId),
  });
  if (!existing) {
    await db
      .update(conversations)
      .set({ introState: "opened" })
      .where(eq(conversations.id, conversationId));

    const [a, b] = await Promise.all([
      profileForMatching(user.id),
      profileForMatching(match.userBId),
    ]);
    const intro =
      (a &&
        b &&
        (await bartenderIntroduction({
          a,
          b,
          matchType: match.type,
          explanation: match.explanation,
        }))) ??
      `You two were suggested to each other: ${match.explanation} I'll keep this short — say hello, compare what you're each building, and I'll offer one next step once you've both spoken.`;

    await db.insert(messages).values({
      conversationId,
      senderKind: "bartender",
      content: intro,
    });

    const other = await db.query.users.findFirst({ where: eq(users.id, match.userBId) });
    if (other && !other.isSeed) {
      await db.insert(notifications).values({
        userId: other.id,
        kind: "introduction",
        content: `${user.name} opened an introduction with you.`,
        href: `/messages/${conversationId}`,
      });
    }
  }

  await db.update(matches).set({ conversationId }).where(eq(matches.id, match.id));
  redirect(`/messages/${conversationId}`);
}

/** Plain DM from a profile page — no bartender, no ceremony. */
export async function openDmAction(otherUserId: number) {
  const user = await currentUser();
  if (!user) redirect("/signin");
  if (otherUserId === user.id) redirect("/map");
  const other = await db.query.users.findFirst({ where: eq(users.id, otherUserId) });
  if (!other) redirect("/map");
  const conversationId = await getOrCreateDm(user.id, otherUserId);
  redirect(`/messages/${conversationId}`);
}
