import Link from "next/link";
import { redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";

import { currentUser } from "@/lib/current-user";
import { db } from "@/lib/db";
import { projectMembers, projects, users } from "@/lib/db/schema";

export default async function ProjectsPage() {
  const user = await currentUser();
  if (!user) redirect("/signin");

  const all = await db.query.projects.findMany({ orderBy: [asc(projects.id)] });

  const rows = await Promise.all(
    all.map(async (p) => {
      const members = await db
        .select({ id: users.id, name: users.name, isLeader: projectMembers.isLeader })
        .from(projectMembers)
        .innerJoin(users, eq(users.id, projectMembers.userId))
        .where(eq(projectMembers.projectId, p.id));
      return { ...p, members };
    })
  );

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Projects</h1>
        <p className="text-sm text-dim mt-1">
          The cohort&apos;s existing projects, seeded from week one. Ask to join;
          a leader decides. (New project spaces open in the rollout phase.)
        </p>
      </div>
      <div className="space-y-3">
        {rows.map((p) => (
          <Link
            key={p.id}
            href={`/projects/${p.id}`}
            className="card p-4 block hover:bg-hover transition-colors space-y-2"
          >
            <div className="flex items-center gap-3">
              <span className="font-semibold">{p.name}</span>
              {p.isSeed && <span className="tag">seeded from week one</span>}
              <span className="text-xs text-dim ml-auto">
                {p.members.length} member{p.members.length === 1 ? "" : "s"}
              </span>
            </div>
            <p className="text-sm text-dim">{p.goal}</p>
            <p className="text-xs text-dim">
              Leaders:{" "}
              {p.members.filter((m) => m.isLeader).map((m) => m.name).join(", ") || "—"}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
