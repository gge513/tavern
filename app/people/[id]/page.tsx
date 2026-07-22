import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";

import { currentUser } from "@/lib/current-user";
import { db } from "@/lib/db";
import { profiles, users } from "@/lib/db/schema";
import { formatTraits } from "@/lib/traits";
import { openDmAction } from "@/app/map/actions";

export default async function PersonPage(props: {
  params: Promise<{ id: string }>;
}) {
  const me = await currentUser();
  if (!me) redirect("/signin");

  const { id } = await props.params;
  const userId = Number(id);
  if (!Number.isInteger(userId)) notFound();

  const person = await db.query.users.findFirst({ where: eq(users.id, userId) });
  const profile = await db.query.profiles.findFirst({
    where: eq(profiles.userId, userId),
  });
  if (!person) notFound();

  const isMe = person.id === me.id;
  // Approval gate: nothing is cohort-visible before the student approves it.
  if (!isMe && !profile?.approved) notFound();

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        {person.avatarUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={person.avatarUrl} alt="" className="w-14 h-14 rounded-full" />
        )}
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-3">
            {person.name}
            {person.isSeed && <span className="tag">seeded demo profile</span>}
          </h1>
          {person.githubLogin && (
            <a
              href={`https://github.com/${person.githubLogin}`}
              className="text-sm text-dim hover:text-ink"
              target="_blank"
              rel="noreferrer"
            >
              github.com/{person.githubLogin}
            </a>
          )}
        </div>
        {!isMe && (
          <form action={openDmAction.bind(null, person.id)} className="ml-auto">
            <button className="btn text-sm">Message</button>
          </form>
        )}
      </div>

      {profile?.userSummary && (
        <div className="card p-5">
          <p className="leading-relaxed text-sm">{profile.userSummary}</p>
          <p className="text-xs text-dim mt-3">
            Written from public GitHub work and their own edits; approved by{" "}
            {isMe ? "you" : person.name} before becoming visible.
          </p>
        </div>
      )}

      <div className="grid sm:grid-cols-3 gap-3 text-sm">
        <div className="card p-4">
          <div className="label">Thinking</div>
          {formatTraits(profile?.thinking ?? null)}
        </div>
        <div className="card p-4">
          <div className="label">Contribution</div>
          {formatTraits(profile?.contribution ?? null)}
        </div>
        <div className="card p-4">
          <div className="label">Collaboration</div>
          {formatTraits(profile?.collaboration ?? null)}
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-3 text-sm">
        <div className="card p-4">
          <div className="label">Help offered</div>
          {profile?.helpOffered ?? "—"}
        </div>
        <div className="card p-4">
          <div className="label">Help wanted</div>
          {profile?.helpWanted ?? "—"}
        </div>
        <div className="card p-4">
          <div className="label">Interests</div>
          {profile?.interests ?? "—"}
        </div>
        <div className="card p-4">
          <div className="label">Learning goals</div>
          {profile?.learningGoals ?? "—"}
        </div>
      </div>

      {(profile?.skills ?? []).length > 0 && (
        <div className="flex flex-wrap gap-1">
          {(profile?.skills ?? []).map((s) => (
            <span key={s} className="tag">{s}</span>
          ))}
        </div>
      )}

      {isMe && (
        <p className="text-sm text-dim">
          Want different wording or numbers?{" "}
          <Link className="text-amber hover:underline" href="/settings/profile">
            Edit your profile
          </Link>
          .
        </p>
      )}
    </div>
  );
}
