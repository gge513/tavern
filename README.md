# Tavern

*Slack moves messages. The Tavern builds understanding.*

A communication platform for a cohort of ~60 coding students moving from solo
GitHub submissions to shared projects. Students can see each other's code but
not each other — the Tavern fixes the second half: collaborator profiles
generated from real public GitHub work, a matching engine that explains
itself, a bartender who introduces people and then gets out of the way,
project tables with structured conversation, and the snug — a private room in
the back for thinking through confusion before bringing it to the group.

## The core journey

GitHub sign-in → hedged draft profile (you approve every word before anyone
sees it) → a short onboarding game that builds your collaborator map →
suggested collaborators (most alike + most complementary, each with a
plain-language why) → bartender-led introduction → project discovery → join
request → project communication → the snug when you need it.

## Feature map

**Discovery spine:** GitHub-generated profiles (public data only, approval
gate), 11-beat onboarding game with a three-dimension collaborator map
(explainable, editable percentages), cohort map with filters, matching with
explanations, DMs with bartender introductions (one next step, then he steps
back).

**Cohort baseline:** public channels (create / rename / archive), an
admin-only #announcements channel, in-app notifications on @mention and DM,
keyword search over everything you can see (the snug excluded by design),
30-day+ message persistence, ~2s polling on the message path.

**Projects:** directory seeded from week-one projects, join requests carrying
profile + reason + intent + a clearly-labeled AI fit suggestion, leader
accept/decline/follow-up, topic threads, five structured conversation types
(Question / Decision / Blocker / Request for help / Action item — optional,
one tap), a cadence-contract card, and each new member's onboarding
"assumption" posted as their first Question.

**The snug:** a private room with the bartender. Said / Inferring / Unknown
discipline on anything interpersonal; every visit ends in Act, Invite (with a
drafted message you own), Clarify, or Release. Invite a collaborator to make
it a shared room — a live thinking session where the bartender facilitates
only when you ring the bell. Never auto-shared, never searchable.

## Stack

Next.js 16 (App Router) · TypeScript · Tailwind 4 · Drizzle ORM · Neon
Postgres · Auth.js v5 (GitHub OAuth + email/password fallback) · Anthropic API
(claude-opus-4-8) for profile drafts, match explanations, and the bartender.
Every AI call site degrades to non-AI fallbacks — the loop never blocks on the
API.

PM-platform integration: accounts are keyed by the same email (and GitHub
identity) as the cohort's PM platform, per the course integration requirement.

## Run it

```sh
npm install
cp .env.example .env.local   # fill in values
set -a; source .env.local; set +a
npm run db:push              # create tables (reprise pg schema)
npm run db:seed              # seed demo cohort, projects, channels
npm run db:roster            # reserve unclaimed accounts for the real cohort
npm run dev
```

Seeded people are fictional and labeled "seeded demo profile" everywhere they
appear. Real profiles, matches, and conversations accumulate as the cohort
signs in.

## Test plan

- `npm run build` — typecheck + production build
- `npx tsx scripts/integration-smoke.mts` — DM creation/persistence, access
  control (participant vs outsider), channel vs announcements posting rules,
  mention notifications
- `npx tsx scripts/ai-smoke.mts` — live Anthropic call sites (needs
  `ANTHROPIC_API_KEY`)
- Manual loop: sign up → onboarding → map → introduction → join request →
  project chat with structured types → the snug → reload and confirm
  persistence
