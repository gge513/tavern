import Link from "next/link";
import { redirect } from "next/navigation";

import { currentUser } from "@/lib/current-user";

export default async function Home() {
  const user = await currentUser();
  if (user) {
    redirect(user.onboarding === "done" ? "/map" : "/onboarding");
  }

  return (
    <div className="max-w-2xl mx-auto pt-16 space-y-8">
      <div className="space-y-4">
        <h1 className="text-4xl font-bold tracking-tight">
          Meet the people behind the{" "}
          <span className="text-amber">pull requests</span>.
        </h1>
        <p className="text-dim text-lg leading-relaxed">
          Slack moves messages. The Tavern builds understanding. For a cohort of
          sixty students who can see each other&apos;s code but not each other:
          profiles from your real GitHub work, a matching engine that explains
          itself, a bartender that introduces you, and a quiet room to think
          before you bring a problem to the group.
        </p>
      </div>
      <div className="flex gap-3">
        <Link href="/signin" className="btn">
          Sign in with GitHub
        </Link>
        <Link href="/signup" className="btn btn-ghost">
          Create an account
        </Link>
        <Link href="/preview" className="btn btn-ghost">
          Look inside first
        </Link>
      </div>
      <div className="card p-5 text-sm text-dim leading-relaxed">
        <p>
          How it works: sign in, review the profile your public GitHub work
          suggests (you approve every word before anyone sees it), play a short
          onboarding game, and get two suggested collaborators — one like you,
          one who covers what you don&apos;t. From there: conversations,
          projects, and the snug — the quiet room in the back.
        </p>
      </div>
    </div>
  );
}
