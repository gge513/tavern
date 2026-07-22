import Link from "next/link";
import { redirect } from "next/navigation";

import { signIn } from "@/auth";
import { currentUser } from "@/lib/current-user";
import { credentialsSignInAction } from "./actions";

export default async function SignInPage(props: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await currentUser();
  if (user) redirect("/");
  const { error } = await props.searchParams;

  return (
    <div className="max-w-sm mx-auto pt-16 space-y-6">
      <h1 className="text-2xl font-bold">Sign in</h1>

      <form
        action={async () => {
          "use server";
          await signIn("github", { redirectTo: "/" });
        }}
      >
        <button className="btn w-full justify-center">
          Continue with GitHub
        </button>
      </form>

      <div className="text-center text-xs text-dim uppercase tracking-widest">
        or with email
      </div>

      {error && (
        <p className="text-red text-sm">
          That didn&apos;t work — check the email and password.
        </p>
      )}

      <form action={credentialsSignInAction} className="space-y-3">
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input className="input" id="email" name="email" type="email" required />
        </div>
        <div>
          <label className="label" htmlFor="password">Password</label>
          <input className="input" id="password" name="password" type="password" required />
        </div>
        <button className="btn btn-ghost w-full justify-center">Sign in</button>
      </form>

      <p className="text-sm text-dim">
        New here?{" "}
        <Link href="/signup" className="text-amber hover:underline">
          Create an account
        </Link>
      </p>
    </div>
  );
}
