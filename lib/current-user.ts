import { eq } from "drizzle-orm";

import { getSession } from "@/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

/**
 * The signed-in user's row id in the users table, or null.
 * The single source of "who is acting" for every server action.
 */
export async function currentDbUserId(): Promise<number | null> {
  const session = await getSession();
  return session?.user?.dbUserId ?? null;
}

export async function currentUser() {
  const id = await currentDbUserId();
  if (!id) return null;
  return (await db.query.users.findFirst({ where: eq(users.id, id) })) ?? null;
}
