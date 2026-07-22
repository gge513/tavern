import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";

import { currentUser } from "@/lib/current-user";
import { db } from "@/lib/db";
import { profiles } from "@/lib/db/schema";
import { generateDraftAction, confirmDraftAction } from "./actions";
import { Game } from "./game";

export default async function OnboardingPage() {
  const user = await currentUser();
  if (!user) redirect("/signin");
  if (user.onboarding === "done") redirect("/map");

  const profile = await db.query.profiles.findFirst({
    where: eq(profiles.userId, user.id),
  });

  if (user.onboarding === "new" || !profile) {
    return (
      <div className="max-w-xl mx-auto pt-12 space-y-6">
        <h1 className="text-2xl font-bold">Before anyone sees anything</h1>
        <p className="text-dim leading-relaxed">
          We&apos;ll read your <strong className="text-ink">public</strong>{" "}
          GitHub work — repos, languages, topics; never private access — and
          draft an interpretation. It arrives hedged, you edit every word, and
          nothing is visible to the cohort until you approve it. Takes about
          eight minutes end to end.
        </p>
        <form action={generateDraftAction}>
          <button className="btn">Build my draft profile</button>
        </form>
      </div>
    );
  }

  if (user.onboarding === "draft") {
    return (
      <div className="max-w-xl mx-auto pt-12 space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Here&apos;s what your public work suggests</h1>
          <p className="text-sm text-dim mt-2">
            This is an interpretation, not a verdict. Edit anything —
            especially anything that doesn&apos;t sound like you.
          </p>
        </div>
        <form action={confirmDraftAction} className="space-y-4">
          <div>
            <label className="label" htmlFor="summary">
              Draft summary <span className="ai-label">AI-drafted, hedged</span>
            </label>
            <textarea
              className="input min-h-40"
              id="summary"
              name="summary"
              defaultValue={profile.userSummary ?? ""}
              required
            />
          </div>
          <div>
            <label className="label" htmlFor="skills">Skills (comma-separated)</label>
            <input
              className="input"
              id="skills"
              name="skills"
              defaultValue={(profile.skills ?? []).join(", ")}
            />
          </div>
          <div>
            <label className="label" htmlFor="tools">Tools (comma-separated)</label>
            <input
              className="input"
              id="tools"
              name="tools"
              defaultValue={(profile.tools ?? []).join(", ")}
            />
          </div>
          <button className="btn">This sounds like me — continue</button>
        </form>
      </div>
    );
  }

  // onboarding === "game"
  return <Game />;
}
