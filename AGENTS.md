# Tavern — agent guide

The Tavern: communication platform for the Hult cohort ("meet the people behind the pull
requests"). Next.js 16 App Router + TypeScript + Tailwind 4 + Drizzle ORM on
Neon Postgres + Auth.js v5 + the Anthropic API.

## Next.js version warning

This repo uses Next.js 16 — APIs and conventions may differ from your training
data. Read the relevant guide in `node_modules/next/dist/docs/` before writing
code. Notably: `params` and `searchParams` are Promises (`await` them).

## Layout

- `auth.ts` — Auth.js config: GitHub OAuth + email/password, both landing in `users`.
- `lib/db/schema.ts` — all tables, in the `reprise` pg schema (the Neon
  instance is shared; drizzle is fenced via `schemaFilter`).
- `lib/ai.ts` — every Anthropic call site (profile drafts, match explanations,
  bartender introduction/next-step/tavern, join-fit suggestions). All degrade
  to null; callers must keep a non-AI fallback.
- `lib/messaging.ts` — conversation access rules + the message send path
  (mentions, notifications, the bartender introduction state machine).
- `lib/matching.ts` — deterministic candidate scoring + AI-written "why".
- `lib/traits.ts` — the collaborator-map dimensions and onboarding game.
- `app/api/conversations/[id]/messages/route.ts` — the polling message API
  (GET since-cursor, POST send). The Chat client polls it every 2s. The GET
  also carries reaction summaries for the whole conversation.
- `lib/reactions.ts` — the fixed house reaction set (🍻🥃🎯🔥🎲🕯️); toggle via
  `app/api/messages/[id]/reactions`. Read access is enough to react.
- `lib/presence.ts` + `app/api/presence/route.ts` — presence heartbeat
  (nav widget polls every 30s; online = seen within 2 minutes; seeds and
  un-onboarded users never appear online).
- `scripts/seed.ts` — idempotent demo data (seeded people are fictional and
  labeled "seeded demo profile" in the UI — keep it that way).

## Deploys (git-connected since 2026-07-24)

The Vercel project is connected to github.com/gge513/tavern. That means:

- **Push to `main` = production deploy** to tavern-cohort.vercel.app. Main is
  always shippable; nothing lands on main that shouldn't be live minutes later.
- **Unfinished work goes on a branch, and branches do NOT deploy.**
  `vercel.json` sets `git.deploymentEnabled` so only `main` builds. Verify
  branch work **locally** (`npm run dev`, `npm run build`, `npm test`) plus CI,
  which runs on every pull request.
- **There is no usable preview environment, and previously there was no
  working one either.** All seven Vercel env vars are scoped to Production
  only, so any preview build died at module load on
  `DATABASE_URL is not set` — every route pulls in `lib/db` through `SiteNav`
  in the root layout. An older version of this file claimed previews shared
  prod env vars; that was never true, and the branch-preview workflow built on
  it could not have worked. Production-only scoping is the correct posture: it
  is what keeps the live database and the Anthropic key out of branch deploys.
  If previews are ever needed (outside contributors), give them their own Neon
  branch and a scoped key, do not copy prod credentials sideways.
- Note that a preview could not have tested auth anyway: `AUTH_URL` is pinned
  to the canonical domain, so OAuth from any other host redirects to prod.
  Auth changes are verified locally against `localhost:3000` (an allowed
  callback on the OAuth app) before merging to `main`.
- `npx vercel deploy --prod` still works as a manual escape hatch, but it
  deploys the local working tree (including uncommitted edits). Prefer the git
  path so the live site always corresponds to a commit.
- Env-var changes only take effect on the NEXT deploy, whichever path made it.
- Schema changes: apply additive SQL BEFORE pushing the code that needs it
  (one shared Neon DB for prod and dev; `db:push` currently trips on
  pre-existing project_members constraint drift — never accept its truncate
  offer; use a targeted script like scripts/migrate-presence-reactions.mts).

## Commands

- `npm run dev` — dev server
- `npm run build` — production build (also the typecheck gate)
- `npm run db:push` — push schema to Postgres (needs DATABASE_URL in env)
- `npm run db:seed` — seed demo data
- `npm test` — messaging/access integration smoke (13 checks; exits non-zero on
  any failure and names it). WRITES to `DATABASE_URL` — it sends real messages
  and toggles real reactions, so it prints the target host first. CI runs it
  against a throwaway Neon branch, never prod.
- `npm run test:ai` — live Anthropic call-site check (needs key)
- CI (`.github/workflows/ci.yml`): build is a hard gate on every push and PR;
  lint is reported but not enforced (one pre-existing chat.tsx error); the
  smoke job self-skips without `NEON_API_KEY` + `NEON_PROJECT_ID` secrets.

Load env for scripts with: `set -a; source .env.local; set +a`.

## Product rules that are load-bearing

- Nothing about a student is cohort-visible before they approve it.
- AI output is always labeled as suggestion/inference, hedged, never a verdict.
- The bartender gives exactly one next step in introductions, then stops.
- Snug sessions are private to their owner and excluded from search.
- Public GitHub data only — never request private repository access.
- Tone everywhere: dry, direct, adult (users are 28+). No forced icebreaker energy.
