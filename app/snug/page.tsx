import Link from "next/link";
import { redirect } from "next/navigation";

import { currentUser } from "@/lib/current-user";
import { sharedTablesFor, tavernSessionsFor } from "@/lib/messaging";
import { openTavernSessionAction } from "./actions";

export default async function TavernPage() {
  const user = await currentUser();
  if (!user) redirect("/signin");

  const sessions = await tavernSessionsFor(user.id);
  const sharedTables = await sharedTablesFor(user.id);

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">The snug</h1>
        <p className="text-sm text-dim mt-1 leading-relaxed">
          The private room in the back, for thinking through confusion before
          you bring it to the group. By default it&apos;s just you and the
          bartender, and nothing leaves the room unless you choose to share it.
          If a problem needs two heads, you can bring one collaborator in — the
          room stays private to the two of you, and the bartender switches to
          facilitator, answering only the bell. Every visit ends one of four
          ways: Act, Invite, Clarify, or Release.
        </p>
      </div>

      <form action={openTavernSessionAction}>
        <button className="btn">Pull up a stool</button>
      </form>

      {sharedTables.length > 0 && (
        <div className="space-y-2">
          <h2 className="label">Snugs you&apos;ve been brought into</h2>
          {sharedTables.map((s) => (
            <Link
              key={s.id}
              href={`/snug/${s.id}`}
              className="card p-3 flex items-center gap-3 text-sm hover:bg-hover"
            >
              <span>With {s.ownerName}</span>
              {s.outcome ? (
                <span className="tag tag-amber capitalize">{s.outcome}</span>
              ) : (
                <span className="tag">live</span>
              )}
              <span className="text-xs text-dim ml-auto">
                {new Date(s.createdAt).toLocaleDateString()}
              </span>
            </Link>
          ))}
        </div>
      )}

      {sessions.length > 0 && (
        <div className="space-y-2">
          <h2 className="label">Past sessions (only you can see these)</h2>
          {sessions.map((s) => (
            <Link
              key={s.id}
              href={`/snug/${s.id}`}
              className="card p-3 flex items-center gap-3 text-sm hover:bg-hover"
            >
              <span>Session #{s.id}</span>
              {s.outcome ? (
                <span className="tag tag-amber capitalize">{s.outcome}</span>
              ) : (
                <span className="tag">open</span>
              )}
              <span className="text-xs text-dim ml-auto">
                {new Date(s.createdAt).toLocaleDateString()}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
