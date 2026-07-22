import Link from "next/link";
import { redirect } from "next/navigation";
import { and, desc, eq, isNull } from "drizzle-orm";

import { currentUser } from "@/lib/current-user";
import { db } from "@/lib/db";
import { notifications } from "@/lib/db/schema";

export default async function NotificationsPage() {
  const user = await currentUser();
  if (!user) redirect("/signin");

  const rows = await db.query.notifications.findMany({
    where: eq(notifications.userId, user.id),
    orderBy: [desc(notifications.id)],
    limit: 50,
  });

  // Opening the page reads them — simple and honest.
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, user.id), isNull(notifications.readAt)));

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Alerts</h1>
      <div className="space-y-2">
        {rows.map((n) => (
          <Link
            key={n.id}
            href={n.href}
            className={`card p-3 block text-sm hover:bg-hover ${n.readAt ? "opacity-70" : ""}`}
          >
            <div className="flex gap-2 items-center">
              <span className="tag capitalize">{n.kind.replace("_", " ")}</span>
              <span className="text-xs text-dim ml-auto">
                {new Date(n.createdAt).toLocaleString([], {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </div>
            <p className="mt-1">{n.content}</p>
          </Link>
        ))}
        {rows.length === 0 && <p className="text-sm text-dim">Nothing yet.</p>}
      </div>
    </div>
  );
}
