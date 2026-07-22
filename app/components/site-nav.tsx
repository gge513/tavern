import Link from "next/link";
import { and, count, eq, isNull } from "drizzle-orm";

import { signOut } from "@/auth";
import { currentUser } from "@/lib/current-user";
import { db } from "@/lib/db";
import { notifications } from "@/lib/db/schema";

export async function SiteNav() {
  const user = await currentUser();

  let unread = 0;
  if (user) {
    const [row] = await db
      .select({ n: count() })
      .from(notifications)
      .where(and(eq(notifications.userId, user.id), isNull(notifications.readAt)));
    unread = row?.n ?? 0;
  }

  const onboarded = user?.onboarding === "done";

  return (
    <header className="border-b border-line bg-raised/60">
      <div className="max-w-5xl mx-auto px-4 h-14 flex items-center gap-5">
        <Link href="/" className="font-bold tracking-tight text-lg">
          <span className="text-amber">Reprise</span>
        </Link>
        {user && onboarded && (
          <nav className="flex items-center gap-4 text-sm text-dim">
            <Link href="/map" className="hover:text-ink">Cohort map</Link>
            <Link href="/messages" className="hover:text-ink">Messages</Link>
            <Link href="/channels" className="hover:text-ink">Channels</Link>
            <Link href="/projects" className="hover:text-ink">Projects</Link>
            <Link href="/tavern" className="hover:text-ink">Tavern</Link>
            <Link href="/search" className="hover:text-ink">Search</Link>
          </nav>
        )}
        <div className="ml-auto flex items-center gap-3">
          {user ? (
            <>
              <Link
                href="/notifications"
                className="relative text-sm text-dim hover:text-ink"
                title="Notifications"
              >
                Alerts
                {unread > 0 && (
                  <span className="absolute -top-2 -right-3 bg-amber text-[10px] text-black font-bold rounded-full px-1.5 py-0.5">
                    {unread}
                  </span>
                )}
              </Link>
              <Link
                href={`/people/${user.id}`}
                className="text-sm text-dim hover:text-ink"
              >
                {user.name}
              </Link>
              <form
                action={async () => {
                  "use server";
                  await signOut({ redirectTo: "/" });
                }}
              >
                <button className="btn-ghost btn text-xs">Sign out</button>
              </form>
            </>
          ) : (
            <Link href="/signin" className="btn text-sm">
              Sign in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
