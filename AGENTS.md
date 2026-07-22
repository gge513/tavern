# Reprise — agent guide

Communication platform for the Hult cohort ("meet the people behind the pull
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
  (GET since-cursor, POST send). The Chat client polls it every 2s.
- `scripts/seed.ts` — idempotent demo data (seeded people are fictional and
  labeled "seeded demo profile" in the UI — keep it that way).

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
- Tavern sessions are private to their owner and excluded from search.
- Public GitHub data only — never request private repository access.
- Tone everywhere: dry, direct, adult (users are 28+). No forced icebreaker energy.
