import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";

import { Chat } from "@/app/components/chat";
import { currentUser } from "@/lib/current-user";
import { db } from "@/lib/db";
import { conversations, projectMembers, users } from "@/lib/db/schema";
import { canAccess } from "@/lib/messaging";

export default async function ThreadPage(props: {
  params: Promise<{ id: string; threadId: string }>;
}) {
  const user = await currentUser();
  if (!user) redirect("/signin");

  const { id, threadId } = await props.params;
  const projectId = Number(id);
  const conversationId = Number(threadId);
  if (!Number.isInteger(projectId) || !Number.isInteger(conversationId)) notFound();

  const thread = await db.query.conversations.findFirst({
    where: and(
      eq(conversations.id, conversationId),
      eq(conversations.kind, "thread"),
      eq(conversations.projectId, projectId)
    ),
  });
  if (!thread) notFound();

  const access = await canAccess(user.id, conversationId);
  if (!access.ok) notFound();

  const members = await db
    .select({ id: users.id, name: users.name })
    .from(projectMembers)
    .innerJoin(users, eq(users.id, projectMembers.userId))
    .where(eq(projectMembers.projectId, projectId));

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div>
        <Link href={`/projects/${projectId}`} className="text-xs text-dim hover:text-ink">
          ← back to project
        </Link>
        <h1 className="text-xl font-bold mt-1">Thread: {thread.topic}</h1>
      </div>
      <Chat
        conversationId={conversationId}
        currentUserId={user.id}
        canPost
        showStructured
        members={members}
      />
    </div>
  );
}
