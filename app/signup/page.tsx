import Link from "next/link";
import { redirect } from "next/navigation";

import { currentUser } from "@/lib/current-user";
import { signUpAction } from "./actions";

export default async function SignUpPage(props: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await currentUser();
  if (user) redirect("/");
  const { error } = await props.searchParams;

  return (
    <div className="max-w-sm mx-auto pt-16 space-y-6">
      <h1 className="text-2xl font-bold">Create an account</h1>
      <p className="text-sm text-dim">
        GitHub sign-in is the fast path — it builds your profile from your
        public work. This form is the fallback: add your GitHub username so we
        can still find your public repos (public data only, never private
        access).
      </p>

      {error === "exists" && (
        <p className="text-red text-sm">An account with that email already exists.</p>
      )}
      {error === "invalid" && (
        <p className="text-red text-sm">
          All fields are required; password must be at least 8 characters.
        </p>
      )}

      <form action={signUpAction} className="space-y-3">
        <div>
          <label className="label" htmlFor="name">Name</label>
          <input className="input" id="name" name="name" required />
        </div>
        <div>
          <label className="label" htmlFor="email">Email (same one you use on the PM platform)</label>
          <input className="input" id="email" name="email" type="email" required />
        </div>
        <div>
          <label className="label" htmlFor="github">GitHub username (optional)</label>
          <input className="input" id="github" name="github" placeholder="e.g. gge513" />
        </div>
        <div>
          <label className="label" htmlFor="password">Password</label>
          <input className="input" id="password" name="password" type="password" required minLength={8} />
        </div>
        <button className="btn w-full justify-center">Create account</button>
      </form>

      <p className="text-sm text-dim">
        Already have one?{" "}
        <Link href="/signin" className="text-amber hover:underline">Sign in</Link>
      </p>
    </div>
  );
}
