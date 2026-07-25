import { NextResponse } from "next/server";
import { and, eq, gt, ne, sql } from "drizzle-orm";

import { currentDbUserId } from "@/lib/current-user";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { ONLINE_WINDOW_MS } from "@/lib/presence";

/**
 * Presence heartbeat. Each GET stamps the caller's last_seen_at and returns
 * everyone seen in the last two minutes. Seeded demo people are excluded —
 * they are fictional and labeled as such; showing them "at the bar" would
 * break the honesty rule.
 */
export async function GET() {
  const userId = await currentDbUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  await db.update(users).set({ lastSeenAt: new Date() }).where(eq(users.id, userId));

  const cutoff = new Date(Date.now() - ONLINE_WINDOW_MS);
  const online = await db
    .select({
      id: users.id,
      name: users.name,
      githubLogin: users.githubLogin,
      avatarUrl: users.avatarUrl,
    })
    .from(users)
    .where(
      and(
        gt(users.lastSeenAt, cutoff),
        eq(users.isSeed, false),
        ne(users.id, userId),
        // Only cohort-visible people appear on the presence list.
        eq(users.onboarding, "done"),
        sql`exists (select 1 from reprise.profiles p where p.user_id = ${users.id} and p.approved)`
      )
    )
    .orderBy(users.name);

  return NextResponse.json({ online });
}
