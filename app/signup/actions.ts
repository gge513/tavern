"use server";

import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
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
  try {
    await db.insert(users).values({ name, email, githubLogin: github, passwordHash });
  } catch {
    // Most likely a githubLogin collision — retry without claiming the handle.
    await db.insert(users).values({ name, email, passwordHash });
  }

  await signIn("credentials", { email, password, redirectTo: "/" });
}
