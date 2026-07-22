import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";

import { Chat } from "@/app/components/chat";
import { currentUser } from "@/lib/current-user";
import { db } from "@/lib/db";
import { tavernSessions } from "@/lib/db/schema";
import { endTavernSessionAction } from "../actions";

export default async function TavernSessionPage(props: {
  params: Promise<{ id: string }>;
}) {
  const user = await currentUser();
  if (!user) redirect("/signin");

  const { id } = await props.params;
  const sessionId = Number(id);
  if (!Number.isInteger(sessionId)) notFound();

  const session = await db.query.tavernSessions.findFirst({
    where: and(eq(tavernSessions.id, sessionId), eq(tavernSessions.ownerId, user.id)),
  });
  if (!session) notFound();

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <Link href="/tavern" className="text-xs text-dim hover:text-ink">← tavern</Link>
        <h1 className="text-xl font-bold">Private session</h1>
        <span className="tag">only you can see this</span>
        {session.outcome && (
          <span className="tag tag-amber capitalize">ended: {session.outcome}</span>
        )}
      </div>

      <Chat
        conversationId={session.conversationId}
        currentUserId={user.id}
        canPost={!session.outcome}
        readOnlyReason="This session has ended. Open a new one whenever you need the room."
        placeholder="Think out loud — what happened, what do you actually know, what are you assuming?"
      />

      {!session.outcome && (
        <div className="card p-4 space-y-2">
          <div className="label">End this visit</div>
          <div className="flex gap-2 flex-wrap">
            {(
              [
                ["act", "Act — I know my move"],
                ["invite", "Invite — draft a message for the project"],
                ["clarify", "Clarify — I'll ask them directly"],
                ["release", "Release — letting this one go"],
              ] as const
            ).map(([key, label]) => (
              <form key={key} action={endTavernSessionAction.bind(null, sessionId, key)}>
                <button className="btn btn-ghost text-xs">{label}</button>
              </form>
            ))}
          </div>
        </div>
      )}

      {session.outcome === "invite" && session.draftMessage && (
        <div className="card p-4 space-y-2">
          <div className="label">
            Drafted message to bring back — yours to edit, post, or discard
          </div>
          <p className="text-sm whitespace-pre-wrap leading-relaxed">{session.draftMessage}</p>
          <p className="text-xs text-dim">
            Copy it into your project chat if and when you&apos;re ready. Nothing is
            shared automatically.
          </p>
        </div>
      )}
    </div>
  );
}
