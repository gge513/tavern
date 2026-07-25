import Link from "next/link";
import { redirect } from "next/navigation";
import { and, desc, eq, ne } from "drizzle-orm";

import { currentUser } from "@/lib/current-user";
import { db } from "@/lib/db";
import { conversationParticipants, conversations, users } from "@/lib/db/schema";
import { isOnline } from "@/lib/presence";

export default async function MessagesPage() {
  const user = await currentUser();
  if (!user) redirect("/signin");

  const mine = await db
    .select({ id: conversations.id, lastActivityAt: conversations.lastActivityAt })
    .from(conversations)
    .innerJoin(
      conversationParticipants,
      eq(conversationParticipants.conversationId, conversations.id)
    )
    .where(
      and(eq(conversationParticipants.userId, user.id), eq(conversations.kind, "dm"))
    )
    .orderBy(desc(conversations.lastActivityAt));

  const withOthers = await Promise.all(
    mine.map(async (c) => {
      const other = await db
        .select({
          id: users.id,
          name: users.name,
          isSeed: users.isSeed,
          lastSeenAt: users.lastSeenAt,
        })
        .from(conversationParticipants)
        .innerJoin(users, eq(users.id, conversationParticipants.userId))
        .where(
          and(
            eq(conversationParticipants.conversationId, c.id),
            ne(conversationParticipants.userId, user.id)
          )
        )
        .limit(1);
      return { ...c, other: other[0] };
    })
  );

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Messages</h1>
      <div className="space-y-2">
        {withOthers.map((c) => (
          <Link
            key={c.id}
            href={`/messages/${c.id}`}
            className="card p-4 flex items-center gap-3 hover:bg-hover transition-colors"
          >
            <span className="font-medium">{c.other?.name ?? "Conversation"}</span>
            {c.other && !c.other.isSeed && isOnline(c.other.lastSeenAt) && (
              <span className="presence-dot" title="At the bar right now" />
            )}
            {c.other?.isSeed && <span className="tag">seeded</span>}
            <span className="text-xs text-dim ml-auto">
              {new Date(c.lastActivityAt).toLocaleDateString()}
            </span>
          </Link>
        ))}
        {withOthers.length === 0 && (
          <p className="text-sm text-dim">
            No conversations yet. Start from the{" "}
            <Link href="/map" className="text-amber hover:underline">cohort map</Link>{" "}
            — your suggested collaborators come with an introduction.
          </p>
        )}
      </div>
    </div>
  );
}
