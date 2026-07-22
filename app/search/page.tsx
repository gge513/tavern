import Link from "next/link";
import { redirect } from "next/navigation";
import { and, desc, eq, ilike, inArray, or } from "drizzle-orm";

import { currentUser } from "@/lib/current-user";
import { db } from "@/lib/db";
import {
  conversationParticipants,
  conversations,
  messages,
  projectMembers,
  users,
} from "@/lib/db/schema";
import { hrefFor } from "@/lib/messaging";

/**
 * Keyword search over message content (course baseline), scoped to what the
 * user can actually see: public channels, their DMs, their projects.
 * Tavern sessions are deliberately excluded — private processing stays private.
 */
export default async function SearchPage(props: {
  searchParams: Promise<{ q?: string }>;
}) {
  const user = await currentUser();
  if (!user) redirect("/signin");
  const { q } = await props.searchParams;
  const needle = (q ?? "").trim();

  let results: {
    id: number;
    content: string;
    createdAt: Date;
    senderName: string | null;
    convo: { id: number; kind: string; name: string | null; topic: string | null; projectId: number | null };
  }[] = [];

  if (needle.length >= 2) {
    const myDms = (
      await db
        .select({ id: conversationParticipants.conversationId })
        .from(conversationParticipants)
        .where(eq(conversationParticipants.userId, user.id))
    ).map((r) => r.id);
    const myProjects = (
      await db
        .select({ id: projectMembers.projectId })
        .from(projectMembers)
        .where(eq(projectMembers.userId, user.id))
    ).map((r) => r.id);

    const visible = [
      eq(conversations.kind, "channel"),
      myDms.length ? and(eq(conversations.kind, "dm"), inArray(conversations.id, myDms)) : undefined,
      myProjects.length
        ? and(
            inArray(conversations.kind, ["project", "thread"]),
            inArray(conversations.projectId, myProjects)
          )
        : undefined,
    ].filter((x): x is NonNullable<typeof x> => !!x);

    const rows = await db
      .select({
        id: messages.id,
        content: messages.content,
        createdAt: messages.createdAt,
        senderName: users.name,
        convoId: conversations.id,
        kind: conversations.kind,
        name: conversations.name,
        topic: conversations.topic,
        projectId: conversations.projectId,
      })
      .from(messages)
      .innerJoin(conversations, eq(conversations.id, messages.conversationId))
      .leftJoin(users, eq(users.id, messages.senderId))
      .where(and(ilike(messages.content, `%${needle}%`), or(...visible)))
      .orderBy(desc(messages.id))
      .limit(50);

    results = rows.map((r) => ({
      id: r.id,
      content: r.content,
      createdAt: r.createdAt,
      senderName: r.senderName,
      convo: { id: r.convoId, kind: r.kind, name: r.name, topic: r.topic, projectId: r.projectId },
    }));
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Search</h1>
      <form method="GET" className="flex gap-2">
        <input
          className="input"
          name="q"
          defaultValue={needle}
          placeholder="Search messages you can see…"
          autoFocus
        />
        <button className="btn">Search</button>
      </form>

      {needle.length >= 2 && (
        <p className="text-sm text-dim">
          {results.length} result{results.length === 1 ? "" : "s"} in channels,
          your messages, and your projects. Tavern sessions are never searchable.
        </p>
      )}

      <div className="space-y-2">
        {results.map((r) => (
          <Link
            key={r.id}
            href={hrefFor(r.convo)}
            className="card p-3 block text-sm hover:bg-hover space-y-1"
          >
            <div className="flex gap-2 text-xs text-dim">
              <span>{r.senderName ?? "The Bartender"}</span>
              <span>
                in{" "}
                {r.convo.kind === "channel"
                  ? `#${r.convo.name}`
                  : r.convo.kind === "dm"
                    ? "a direct message"
                    : r.convo.topic
                      ? `thread: ${r.convo.topic}`
                      : "a project"}
              </span>
              <span className="ml-auto">{new Date(r.createdAt).toLocaleDateString()}</span>
            </div>
            <p className="line-clamp-2">{r.content}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
