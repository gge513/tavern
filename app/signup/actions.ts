"use server";

import bcrypt from "bcryptjs";
import { eq, sql } from "drizzle-orm";
import { redirect } from "next/navigation";

import { signIn } from "@/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

export async function signUpAction(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const github = String(formData.get("github") ?? "").trim() || null;
  const password = String(formData.get("password") ?? "");

  if (!name || !email || password.length < 8) {
    redirect("/signup?error=invalid");
  }

  const existing = await db.query.users.findFirst({ where: eq(users.email, email) });
  if (existing) redirect("/signup?error=exists");

  const passwordHash = await bcrypt.hash(password, 10);

  // Roster claim: if this GitHub handle has a reserved, unclaimed row
  // (pre-seeded from the course roster — no email, no password yet), this
  // signup claims it instead of creating a duplicate person.
  // GitHub logins are case-insensitive; reserved rows store canonical casing.
  const reserved = github
    ? await db.query.users.findFirst({
        where: sql`lower(${users.githubLogin}) = ${github.toLowerCase()}`,
      })
    : null;
  if (reserved && !reserved.email && !reserved.passwordHash) {
    await db
      .update(users)
      .set({ name, email, passwordHash })
      .where(eq(users.id, reserved.id));
  } else {
    try {
      await db.insert(users).values({ name, email, githubLogin: github, passwordHash });
    } catch {
      // Most likely a githubLogin collision with a claimed account —
      // retry without claiming the handle.
      await db.insert(users).values({ name, email, passwordHash });
    }
  }

  await signIn("credentials", { email, password, redirectTo: "/" });
}
