# Tavern

*Slack moves messages. The Tavern builds understanding.*

**Live: https://tavern-cohort.vercel.app** — this is the canonical host. Other
Vercel aliases may resolve, but they are aliases of this same deployment and
the same database; sign-in on any of them redirects here.

**Want to see it without an account?**
[https://tavern-cohort.vercel.app/preview](https://tavern-cohort.vercel.app/preview)
is a read-only look at the channel surface, a collaborator profile, and an
explained match. It renders only the seeded demo people (fictional, labeled),
never a real member's writing, so it can be public without an auth check.

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
- `npm test` — the integration smoke: DM creation/persistence, access control
  (participant vs outsider), channel vs announcements posting rules, mention
  notifications, and the reaction rules (house set only, participants only).
  13 checks. **It fails the process on any failed check** and prints which one.
- `npm run test:ai` — live Anthropic call sites (needs `ANTHROPIC_API_KEY`)
- Manual loop: sign up → onboarding → map → introduction → join request →
  project chat with structured types → the snug → reload and confirm
  persistence

### CI

`.github/workflows/ci.yml` runs on every push to `main` and every PR:

- **Lint and build** — always runs, needs no credentials. Lint is currently
  reported but not enforced (one pre-existing `react-hooks` error in the chat
  poll); the build is a hard gate.
- **Integration smoke** — creates a throwaway Neon branch, seeds it, runs
  `npm test` against it, and deletes the branch in an `always()` step. This
  matters because the smoke script writes: it sends real messages and toggles
  real reactions, and it must never do that to production. The job self-skips
  unless `NEON_API_KEY` and `NEON_PROJECT_ID` repository secrets are set.

`npm test` run locally writes to whatever `DATABASE_URL` points at, so it
prints the target host before it does anything.
- Manual loop: sign up → onboarding → map → introduction → join request →
  project chat with structured types → the snug → reload and confirm
  persistence

## Known limitations

- Realtime is 2-second polling, not sockets — within the course's ≤5s bar,
  and the message path is isolated so a socket upgrade is contained.
- The bartender's AI calls degrade to written fallbacks under API failure;
  fallback text is visibly plainer than the live bartender.
- Notifications are in-app only (no email delivery).
- New project spaces can't be created in-app yet (seeded week-one projects
  only, per the contest scope); rollout unlocks creation.
- Seeded demo profiles are fictional and labeled; they don't reply to
  messages.
- GitHub profile analysis uses unauthenticated API calls unless GITHUB_PAT
  is set; heavy simultaneous onboarding could hit rate limits.
