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
- **Unfinished work goes on a branch.** Every branch push gets an automatic
  preview URL (check the commit status or `npx vercel ls`) — use previews to
  look at work-in-progress without touching the live app.
- `npx vercel deploy --prod` still works as a manual escape hatch, but it
  deploys the local working tree (including uncommitted edits). Prefer the git
  path so the live site always corresponds to a commit.
- Env-var changes only take effect on the NEXT deploy, whichever path made it.
- Preview deploys share prod env vars (AUTH_URL is pinned to the canonical
  domain, so OAuth on a preview URL redirects to prod — known quirk, fine).
- Schema changes: apply additive SQL BEFORE pushing the code that needs it
  (one shared Neon DB for prod and dev; `db:push` currently trips on
  pre-existing project_members constraint drift — never accept its truncate
  offer; use a targeted script like scripts/migrate-presence-reactions.mts).

## Commands

- `npm run dev` — dev server
- `npm run build` — production build (also the typecheck gate)
- `npm run db:push` — push schema to Postgres (needs DATABASE_URL in env)
- `npm run db:seed` — seed demo data
- `npx tsx scripts/integration-smoke.mts` — messaging/access integration test
- `npx tsx scripts/ai-smoke.mts` — live Anthropic call-site check (needs key)

Load env for scripts with: `set -a; source .env.local; set +a`.

## Product rules that are load-bearing

- Nothing about a student is cohort-visible before they approve it.
- AI output is always labeled as suggestion/inference, hedged, never a verdict.
- The bartender gives exactly one next step in introductions, then stops.
- Snug sessions are private to their owner and excluded from search.
- Public GitHub data only — never request private repository access.
- Tone everywhere: dry, direct, adult (users are 28+). No forced icebreaker energy.
