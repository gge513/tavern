import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, eq, ne } from "drizzle-orm";

import { Chat } from "@/app/components/chat";
import { currentUser } from "@/lib/current-user";
import { db } from "@/lib/db";
import { conversationParticipants, users } from "@/lib/db/schema";
import { canAccess } from "@/lib/messaging";

export default async function DmPage(props: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/signin");

  const { id } = await props.params;
  const conversationId = Number(id);
  if (!Number.isInteger(conversationId)) notFound();

  const access = await canAccess(user.id, conversationId);
  if (!access.ok || access.convo.kind !== "dm") notFound();

  const other = await db
    .select({ id: users.id, name: users.name, isSeed: users.isSeed })
    .from(conversationParticipants)
    .innerJoin(users, eq(users.id, conversationParticipants.userId))
    .where(
      and(
        eq(conversationParticipants.conversationId, conversationId),
        ne(conversationParticipants.userId, user.id)
      )
    )
    .limit(1);

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-bold">
          <Link href={`/people/${other[0]?.id}`} className="hover:underline">
            {other[0]?.name ?? "Conversation"}
          </Link>
        </h1>
        {other[0]?.isSeed && (
          <span className="tag" title="A seeded demo profile — replies won't come back">
            seeded demo profile
          </span>
        )}
        {access.convo.introState === "opened" && (
          <span className="tag tag-amber">bartender present</span>
        )}
      </div>
      <Chat
        conversationId={conversationId}
        currentUserId={user.id}
        canPost={access.canPost}
      />
    </div>
  );
}
