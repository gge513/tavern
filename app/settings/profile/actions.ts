"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";

import { currentUser } from "@/lib/current-user";
import { db } from "@/lib/db";
import { profiles } from "@/lib/db/schema";

export async function updateProfileAction(formData: FormData) {
  const user = await currentUser();
  if (!user) redirect("/signin");

  const s = (k: string) => String(formData.get(k) ?? "").trim().slice(0, 800) || null;
  const skills = String(formData.get("skills") ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

  await db
    .update(profiles)
    .set({
      userSummary: s("summary"),
      skills,
      helpOffered: s("helpOffered"),
      helpWanted: s("helpWanted"),
      interests: s("interests"),
      learningGoals: s("learningGoals"),
      openToConnect: formData.get("openToConnect") === "on",
      updatedAt: new Date(),
    })
    .where(eq(profiles.userId, user.id));

  redirect(`/people/${user.id}`);
}
