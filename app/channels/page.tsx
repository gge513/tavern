import Link from "next/link";
import { redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";

import { currentUser } from "@/lib/current-user";
import { db } from "@/lib/db";
import { conversations } from "@/lib/db/schema";
import { createChannelAction } from "./actions";

export default async function ChannelsPage() {
  const user = await currentUser();
  if (!user) redirect("/signin");

  const channels = await db.query.conversations.findMany({
    where: eq(conversations.kind, "channel"),
    orderBy: [asc(conversations.id)],
  });

  const live = channels.filter((c) => !c.archived);
  const archived = channels.filter((c) => c.archived);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Channels</h1>
      <div className="space-y-2">
        {live.map((c) => (
          <Link
            key={c.id}
            href={`/channels/${c.id}`}
            className="card p-4 flex items-center gap-3 hover:bg-hover transition-colors"
          >
            <span className="font-medium">#{c.name}</span>
            {c.isAnnouncements && (
              <span className="tag tag-amber">announcements · staff posts only</span>
            )}
          </Link>
        ))}
      </div>

      <form action={createChannelAction} className="card p-4 flex gap-3 items-end">
        <div className="flex-1">
          <label className="label" htmlFor="name">New channel</label>
          <input className="input" id="name" name="name" placeholder="#topic" required />
        </div>
        <button className="btn">Create</button>
      </form>

      {archived.length > 0 && (
        <div className="space-y-2">
          <h2 className="label">Archived</h2>
          {archived.map((c) => (
            <Link
              key={c.id}
              href={`/channels/${c.id}`}
              className="card p-3 block text-sm text-dim hover:bg-hover"
            >
              #{c.name} (archived)
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
