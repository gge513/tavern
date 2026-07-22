import Link from "next/link";
import { redirect } from "next/navigation";

import { currentUser } from "@/lib/current-user";
import { tavernSessionsFor } from "@/lib/messaging";
import { openTavernSessionAction } from "./actions";

export default async function TavernPage() {
  const user = await currentUser();
  if (!user) redirect("/signin");

  const sessions = await tavernSessionsFor(user.id);

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">The tavern</h1>
        <p className="text-sm text-dim mt-1 leading-relaxed">
          A private room for thinking through confusion before you bring it to
          others. Just you and the bartender; nothing is shared unless you
          choose to share it. Every visit ends one of four ways: Act, Invite,
          Clarify, or Release.
        </p>
      </div>

      <form action={openTavernSessionAction}>
        <button className="btn">Pull up a stool</button>
      </form>

      {sessions.length > 0 && (
        <div className="space-y-2">
          <h2 className="label">Past sessions (only you can see these)</h2>
          {sessions.map((s) => (
            <Link
              key={s.id}
              href={`/tavern/${s.id}`}
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
