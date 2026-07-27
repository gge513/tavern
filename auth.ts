import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import GitHub from "next-auth/providers/github";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

/**
 * Auth.js v5, two doors into the same users table (spec section 1):
 *  - GitHub OAuth — the target, because the generated profile depends on
 *    GitHub identity.
 *  - Email + password with a manual GitHub-username field — the
 *    pre-authorized fallback, and the door the staff test account uses.
 *
 * Both resolve to a row in `users`; the row id rides the JWT as dbUserId.
 * The email on the row is the PM-platform integration: same email, same
 * person, across Forth and Reprise.
 */
/**
 * A real bcrypt hash of a random string nobody holds. Compared against when no
 * account matches, so the "no such user" path costs the same as the "wrong
 * password" path.
 *
 * Returning the same null for both was only half the guard: bcrypt.compare is
 * deliberately slow, so returning early on a missing user made non-accounts
 * answer measurably faster than accounts. That timing difference enumerates
 * the roster just as well as a different error message would.
 */
const DUMMY_PASSWORD_HASH =
  "$2b$10$NglLmSARCHIJY4ra0mxHIu.Ettm2Tn1b/vxhG21eRzgOibP4X7HWK";

/**
 * GitHub's own userinfo step, narrowed to verified addresses.
 *
 * The stock provider reads the public profile email (which GitHub requires you
 * to verify before publishing, so it is fine), and when that is null falls back
 * to /user/emails picking `find(primary) ?? emails[0]` — without ever looking at
 * the `verified` flag the API returns. That fallback can therefore yield an
 * unverified address, and this app treats an email match as proof of identity
 * when linking a GitHub login onto an existing password account.
 *
 * So: only accept an address GitHub reports as verified, and prefer the primary
 * one. No verified address means no email on the row, which the roster claim
 * already handles.
 */
const githubUserinfo = {
  url: "https://api.github.com/user",
  async request({ tokens }: { tokens: { access_token?: string } }) {
    const headers = {
      Authorization: `Bearer ${tokens.access_token}`,
      "User-Agent": "authjs",
    };
    const profile = await fetch("https://api.github.com/user", { headers }).then(
      (res) => res.json()
    );

    const res = await fetch("https://api.github.com/user/emails", { headers });
    let verifiedEmail: string | null = null;
    if (res.ok) {
      const emails = (await res.json()) as {
        email: string;
        primary: boolean;
        verified: boolean;
      }[];
      const verified = emails.filter((e) => e.verified);
      verifiedEmail =
        (verified.find((e) => e.primary) ?? verified[0])?.email ?? null;
    }

    // Trust the verified list over the profile field, and never fall back to an
    // address we could not confirm.
    profile.email = verifiedEmail;
    return profile;
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  providers: [
    GitHub({ userinfo: githubUserinfo }),
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(creds) {
        const email = String(creds?.email ?? "")
          .toLowerCase()
          .trim();
        const password = String(creds?.password ?? "");
        if (!email || !password) return null;

        const user = await db.query.users.findFirst({
          where: eq(users.email, email),
        });

        // Always pay the bcrypt cost, then decide. Same null and same timing
        // for "no such user" and "wrong password": sign-in must not reveal
        // which emails have accounts, by message or by stopwatch.
        const ok = await bcrypt.compare(
          password,
          user?.passwordHash ?? DUMMY_PASSWORD_HASH
        );
        if (!user?.passwordHash || !ok) return null;

        return { id: String(user.id), name: user.name, email: user.email };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, account, profile }) {
      if (account?.provider === "github" && profile) {
        const p = profile as {
          login?: string;
          name?: string | null;
          email?: string | null;
          avatar_url?: string | null;
        };
        const login = p.login;
        if (login) {
          token.login = login;
          try {
            const [row] = await db
              .insert(users)
              .values({
                githubLogin: login,
                name: p.name ?? login,
                email: p.email?.toLowerCase() ?? null,
                avatarUrl: p.avatar_url ?? null,
              })
              .onConflictDoUpdate({
                target: users.githubLogin,
                set: {
                  // Never clobber an existing name with the login fallback.
                  ...(p.name ? { name: p.name } : {}),
                  // Claiming a reserved roster row: attach the email that
                  // keys the PM-platform integration.
                  ...(p.email ? { email: p.email.toLowerCase() } : {}),
                  avatarUrl: p.avatar_url ?? null,
                },
              })
              .returning({ id: users.id });
            token.dbUserId = row.id;
          } catch (err) {
            // Rare edge: the GitHub email already belongs to a password
            // account. Link GitHub onto that row instead. The email is only
            // trustworthy for this because githubUserinfo above refuses
            // anything GitHub has not marked verified.
            if (p.email) {
              const existing = await db.query.users.findFirst({
                where: eq(users.email, p.email.toLowerCase()),
              });
              if (existing) {
                await db
                  .update(users)
                  .set({ githubLogin: login, avatarUrl: p.avatar_url ?? null })
                  .where(eq(users.id, existing.id));
                token.dbUserId = existing.id;
              }
            }

            // Anything else that lands here — the database unreachable, an
            // unexpected constraint — must not pass silently. Almost every
            // surface keys off dbUserId, so a swallowed failure hands back a
            // session that looks signed in and has no identity behind it.
            // Fail the sign-in visibly instead.
            if (!token.dbUserId) {
              console.error("[auth] GitHub sign-in could not resolve a user row", err);
              throw new Error("Could not complete GitHub sign-in.");
            }
          }
        }
      }
      if (account?.provider === "credentials" && user?.id) {
        token.dbUserId = Number(user.id);
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        if (token.login) session.user.login = token.login as string;
        if (token.dbUserId) session.user.dbUserId = token.dbUserId as number;
      }
      return session;
    },
  },
});

/**
 * Safe session read for surfaces that must render even before auth is
 * configured. Returns null instead of throwing.
 */
export async function getSession() {
  try {
    return await auth();
  } catch {
    return null;
  }
}
