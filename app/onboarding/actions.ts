"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { generateProfileDraft } from "@/lib/ai";
import { currentUser } from "@/lib/current-user";
import { db } from "@/lib/db";
import { profiles, users } from "@/lib/db/schema";
import { analyzeGithub } from "@/lib/github";
import { ensureMatches } from "@/lib/matching";

/** Beat 2: build the hedged draft from public GitHub work. */
export async function generateDraftAction() {
  const user = await currentUser();
  if (!user) redirect("/signin");

  const analysis = user.githubLogin ? await analyzeGithub(user.githubLogin) : null;
  const draft = await generateProfileDraft({
    name: user.name,
    githubLogin: user.githubLogin,
    analysis,
  });

  // Degrade gracefully (spec section 1): AI draft → evidence-only draft → manual.
  const summary =
    draft?.summary ??
    (analysis?.languages?.length
      ? `Your public repos suggest you work in ${analysis.languages.slice(0, 3).join(", ")}${
          analysis.topics?.length ? `, around ${analysis.topics.slice(0, 3).join(", ")}` : ""
        }. That's all we could read from the outside — we may be wrong about any of it. Edit this into something that sounds like you.`
      : "We couldn't read much from public GitHub, so this one's on you: a few sentences on what you build, how you think, and what you want from this cohort.");

  await db
    .insert(profiles)
    .values({
      userId: user.id,
      generatedSummary: summary,
      userSummary: summary,
      skills: draft?.skills ?? analysis?.languages ?? [],
      tools: draft?.tools ?? [],
      githubAnalysis: analysis ?? { degraded: "no public data" },
    })
    .onConflictDoUpdate({
      target: profiles.userId,
      set: {
        generatedSummary: summary,
        userSummary: summary,
        skills: draft?.skills ?? analysis?.languages ?? [],
        tools: draft?.tools ?? [],
        githubAnalysis: analysis ?? { degraded: "no public data" },
        updatedAt: new Date(),
      },
    });

  await db.update(users).set({ onboarding: "draft" }).where(eq(users.id, user.id));
  revalidatePath("/onboarding");
}

/** Beat 3: student edits + confirms the draft wording. Nothing is public yet. */
export async function confirmDraftAction(formData: FormData) {
  const user = await currentUser();
  if (!user) redirect("/signin");

  const summary = String(formData.get("summary") ?? "").trim();
  const skills = String(formData.get("skills") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const tools = String(formData.get("tools") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!summary) return;

  await db
    .update(profiles)
    .set({ userSummary: summary, skills, tools, updatedAt: new Date() })
    .where(eq(profiles.userId, user.id));
  await db.update(users).set({ onboarding: "game" }).where(eq(users.id, user.id));
  revalidatePath("/onboarding");
}

export type GameSubmission = {
  thinking: Record<string, number>;
  contribution: Record<string, number>;
  collaboration: Record<string, number>;
  assumption: string;
  interests: string;
  learningGoals: string;
  helpOffered: string;
  helpWanted: string;
  openToConnect: boolean;
};

/** Final beats: save the collaborator map, approve the profile, compute matches. */
export async function completeOnboardingAction(submission: GameSubmission) {
  const user = await currentUser();
  if (!user) redirect("/signin");

  const clean = (m: Record<string, number>) => {
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(m)) {
      const n = Math.max(0, Math.min(100, Math.round(Number(v) || 0)));
      if (n > 0) out[k.slice(0, 40)] = n;
    }
    return out;
  };

  await db
    .update(profiles)
    .set({
      thinking: clean(submission.thinking),
      contribution: clean(submission.contribution),
      collaboration: clean(submission.collaboration),
      assumption: submission.assumption.trim().slice(0, 500) || null,
      interests: submission.interests.trim().slice(0, 500) || null,
      learningGoals: submission.learningGoals.trim().slice(0, 500) || null,
      helpOffered: submission.helpOffered.trim().slice(0, 500) || null,
      helpWanted: submission.helpWanted.trim().slice(0, 500) || null,
      openToConnect: submission.openToConnect,
      approved: true,
      updatedAt: new Date(),
    })
    .where(eq(profiles.userId, user.id));

  await db.update(users).set({ onboarding: "done" }).where(eq(users.id, user.id));

  // Discovery is the spine: compute the two suggestions now so the map is
  // never empty when they land on it. Failure here must not block onboarding.
  try {
    await ensureMatches(user.id);
  } catch {}

  redirect("/map");
}
