import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import GitHub from "next-auth/providers/github";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

/**
 * A real cost-10 hash of a passphrase nothing can supply, used only to give
 * the "no such user" path the same bcrypt cost as the "wrong password" path.
 * Must stay at the same cost factor as app/signup/actions.ts, or the timings
 * diverge again and the guard below silently stops working.
 */
const DUMMY_PASSWORD_HASH =
  "$2b$10$ee/pVcX/w7T5hoqAQjBdru4M3PGrhmfUgswPvCFoYvhqGMBaIpJmm";

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
export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  providers: [
    GitHub,
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
        // Same null for "no such user" and "wrong password": sign-in errors
        // must not reveal which emails have accounts. Matching the messages
        // is not enough: bcrypt is deliberately slow, so returning early on
        // a missing row made the two cases separable with a stopwatch. Always
        // pay the compare, against a dummy hash when there is no row, and
        // decide afterwards.
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
          } catch {
            // Rare edge: the GitHub email already belongs to a password
            // account. Link GitHub onto that row instead.
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
