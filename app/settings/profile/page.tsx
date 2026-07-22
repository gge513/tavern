import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";

import { currentUser } from "@/lib/current-user";
import { db } from "@/lib/db";
import { profiles } from "@/lib/db/schema";
import { updateProfileAction } from "./actions";

export default async function ProfileSettingsPage() {
  const user = await currentUser();
  if (!user) redirect("/signin");
  const profile = await db.query.profiles.findFirst({
    where: eq(profiles.userId, user.id),
  });
  if (!profile) redirect("/onboarding");

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Edit profile</h1>
      <p className="text-sm text-dim">
        Everything here is yours to change — the map, the words, all of it.
      </p>
      <form action={updateProfileAction} className="space-y-4">
        <div>
          <label className="label" htmlFor="summary">Summary</label>
          <textarea
            className="input min-h-32"
            id="summary"
            name="summary"
            defaultValue={profile.userSummary ?? ""}
          />
        </div>
        <div>
          <label className="label" htmlFor="skills">Skills (comma-separated)</label>
          <input className="input" id="skills" name="skills" defaultValue={(profile.skills ?? []).join(", ")} />
        </div>
        <div>
          <label className="label" htmlFor="helpOffered">Help offered</label>
          <input className="input" id="helpOffered" name="helpOffered" defaultValue={profile.helpOffered ?? ""} />
        </div>
        <div>
          <label className="label" htmlFor="helpWanted">Help wanted</label>
          <input className="input" id="helpWanted" name="helpWanted" defaultValue={profile.helpWanted ?? ""} />
        </div>
        <div>
          <label className="label" htmlFor="interests">Interests</label>
          <input className="input" id="interests" name="interests" defaultValue={profile.interests ?? ""} />
        </div>
        <div>
          <label className="label" htmlFor="learningGoals">Learning goals</label>
          <input className="input" id="learningGoals" name="learningGoals" defaultValue={profile.learningGoals ?? ""} />
        </div>
        <label className="flex items-center gap-2 text-sm text-dim">
          <input type="checkbox" name="openToConnect" defaultChecked={profile.openToConnect} />
          Open to being suggested as a collaborator
        </label>
        <button className="btn">Save</button>
      </form>
    </div>
  );
}
