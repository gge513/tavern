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
    <header className="top-rail">
      <div className="max-w-5xl mx-auto px-4 h-16 flex items-center gap-5">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="brand-tankard" aria-hidden>
            <span className="brand-tankard-foam" />
            <span className="brand-tankard-body" />
            <span className="brand-tankard-handle" />
          </span>
          <span className="brand-word">
            T<em>a</em>vern
          </span>
        </Link>
        {user && onboarded && (
          <nav className="flex items-center gap-1">
            <Link href="/map" className="rail-link">Map</Link>
            <Link href="/messages" className="rail-link">Messages</Link>
            <Link href="/channels" className="rail-link">Channels</Link>
            <Link href="/projects" className="rail-link">Projects</Link>
            <Link href="/snug" className="rail-link">The Snug</Link>
            <Link href="/search" className="rail-link">Search</Link>
          </nav>
        )}
        <div className="ml-auto flex items-center gap-2">
          {user ? (
            <>
              <Link href="/notifications" className="rail-link flex items-center gap-1.5">
                Alerts
                {unread > 0 && <span className="rail-badge">{unread}</span>}
              </Link>
              <Link href={`/people/${user.id}`} className="rail-link">
                {user.name.split(" ")[0]}
              </Link>
              <form
                action={async () => {
                  "use server";
                  await signOut({ redirectTo: "/" });
                }}
              >
                <button className="rail-link">Sign out</button>
              </form>
            </>
          ) : (
            <Link href="/signin" className="rail-link">
              Sign in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
