import { notFound, redirect } from "next/navigation";

import { Chat } from "@/app/components/chat";
import { currentUser } from "@/lib/current-user";
import { canAccess } from "@/lib/messaging";
import { archiveChannelAction, renameChannelAction } from "../actions";

export default async function ChannelPage(props: {
  params: Promise<{ id: string }>;
}) {
  const user = await currentUser();
  if (!user) redirect("/signin");

  const { id } = await props.params;
  const channelId = Number(id);
  if (!Number.isInteger(channelId)) notFound();

  const access = await canAccess(user.id, channelId);
  if (!access.ok || access.convo.kind !== "channel") notFound();
  const convo = access.convo;

  const canManage =
    !convo.isAnnouncements &&
    (user.isAdmin || convo.createdBy === user.id || convo.createdBy === null);

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="text-xl font-bold">#{convo.name}</h1>
        {convo.isAnnouncements && (
          <span className="tag tag-amber">staff posts only</span>
        )}
        {convo.archived && <span className="tag">archived</span>}
        {canManage && (
          <div className="ml-auto flex gap-2 items-center">
            <form
              action={renameChannelAction.bind(null, channelId)}
              className="flex gap-1"
            >
              <input
                className="input text-xs py-1 w-32"
                name="name"
                placeholder="rename to…"
              />
              <button className="btn btn-ghost text-xs">Rename</button>
            </form>
            <form action={archiveChannelAction.bind(null, channelId)}>
              <button className="btn btn-ghost text-xs">
                {convo.archived ? "Unarchive" : "Archive"}
              </button>
            </form>
          </div>
        )}
      </div>
      <Chat
        conversationId={channelId}
        currentUserId={user.id}
        canPost={access.canPost}
        readOnlyReason={
          convo.archived
            ? "This channel is archived."
            : "Only cohort staff can post announcements."
        }
      />
    </div>
  );
}
