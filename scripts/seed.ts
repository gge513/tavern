/**
 * Seed the Contest Cut demo data. Run: npm run db:seed (needs DATABASE_URL).
 *
 * Honesty rule (spec section 1): seeded people are FICTIONAL and labeled
 * "seeded demo profile" everywhere they render. Seeded projects reference the
 * cohort's real week-one projects by name, with fictional caretaker leaders.
 * Idempotent: safe to run twice.
 */
import { eq } from "drizzle-orm";

import { db } from "../lib/db";
import {
  cadenceContracts,
  conversations,
  messages,
  profiles,
  projectMembers,
  projects,
  users,
} from "../lib/db/schema";

type SeedPerson = {
  githubLogin: string;
  name: string;
  summary: string;
  thinking: Record<string, number>;
  contribution: Record<string, number>;
  collaboration: Record<string, number>;
  skills: string[];
  tools: string[];
  interests: string;
  helpOffered: string;
  helpWanted: string;
  assumption: string;
};

const PEOPLE: SeedPerson[] = [
  {
    githubLogin: "seed-mara-v",
    name: "Mara Voss",
    summary:
      "Your public work suggests a systems thinker who reaches for TypeScript first and tests before believing anything. Appears happiest untangling other people's async bugs. We may be wrong about this — but the commit messages are suspiciously tidy.",
    thinking: { "systems-oriented": 45, analytical: 35, "detail-oriented": 20 },
    contribution: { debugger: 50, documenter: 30, builder: 20 },
    collaboration: { challenger: 45, finisher: 35, supporter: 20 },
    skills: ["TypeScript", "Node", "testing"],
    tools: ["Vitest", "Postgres", "GitHub Actions"],
    interests: "Reliability, developer tooling, making flaky things boring",
    helpOffered: "Debugging async code, writing tests that catch real bugs",
    helpWanted: "Frontend polish — my UIs look like tax forms",
    assumption: "I'm assuming someone knows why our deploys need three retries to go green.",
  },
  {
    githubLogin: "seed-jordan-k",
    name: "Jordan Kile",
    summary:
      "Your repos suggest someone who turns vague ideas into working prototypes fast — several projects with a burst of early commits and a README written at 2am. Appears experimental first, tidy later. Does this sound accurate?",
    thinking: { experimental: 50, tactical: 30, conceptual: 20 },
    contribution: { builder: 55, integrator: 25, designer: 20 },
    collaboration: { initiator: 50, connector: 30, supporter: 20 },
    skills: ["Python", "FastAPI", "React"],
    tools: ["Vercel", "Docker", "Figma"],
    interests: "Zero-to-one builds, AI features that actually ship",
    helpOffered: "Getting a prototype standing in an evening",
    helpWanted: "Someone to turn my prototypes into things that survive users",
    assumption: "I'm assuming someone knows the right way to structure a monorepo for this cohort.",
  },
  {
    githubLogin: "seed-priya-n",
    name: "Priya Nandakumar",
    summary:
      "Your public work suggests a researcher's approach: issues opened with reproductions, PRs with context, forks of papers-with-code. You appear to read before you build. We may be wrong — edit anything that isn't you.",
    thinking: { analytical: 45, conceptual: 35, "detail-oriented": 20 },
    contribution: { researcher: 45, documenter: 30, debugger: 25 },
    collaboration: { facilitator: 40, supporter: 35, challenger: 25 },
    skills: ["Python", "data analysis", "LLM evals"],
    tools: ["Jupyter", "pandas", "LangSmith"],
    interests: "Evaluation, model behavior, why things work not just that they work",
    helpOffered: "Literature dives, eval design, careful code review",
    helpWanted: "Shipping momentum — I polish too long",
    assumption: "I'm assuming someone knows how the review-week scoring actually weights criteria.",
  },
  {
    githubLogin: "seed-tomas-r",
    name: "Tomás Reyes",
    summary:
      "Your repos suggest a frontend instinct — design tokens, motion, and a suspicious number of CSS experiments. You appear to care how things feel, not just whether they run. Sound right?",
    thinking: { conceptual: 40, experimental: 35, tactical: 25 },
    contribution: { designer: 50, builder: 30, integrator: 20 },
    collaboration: { supporter: 40, connector: 35, initiator: 25 },
    skills: ["React", "CSS", "design systems"],
    tools: ["Tailwind", "Framer Motion", "Figma"],
    interests: "Interfaces with a point of view; making tools feel human",
    helpOffered: "Making your UI feel intentional in an afternoon",
    helpWanted: "Backend and data modeling — I wave my hands at databases",
    assumption: "I'm assuming someone knows how auth is supposed to work across our deployed apps.",
  },
  {
    githubLogin: "seed-anna-l",
    name: "Anna Lindqvist",
    summary:
      "Your public history suggests an organizer: project boards actually used, issues triaged, milestones that mean something. You appear to make groups faster rather than louder. We may be wrong about this.",
    thinking: { tactical: 45, "systems-oriented": 30, analytical: 25 },
    contribution: { organizer: 50, documenter: 25, integrator: 25 },
    collaboration: { facilitator: 45, finisher: 30, connector: 25 },
    skills: ["project coordination", "Python", "SQL"],
    tools: ["Linear", "Notion", "dbt"],
    interests: "Team mechanics, decision hygiene, shipping on purpose",
    helpOffered: "Turning a chaotic plan into a sequenced one",
    helpWanted: "Deeper frontend chops",
    assumption: "I'm assuming someone knows what 'done' means for the week-two submission.",
  },
  {
    githubLogin: "seed-dev-o",
    name: "Dev Okafor",
    summary:
      "Your repos suggest an integrator — glue code, API clients, webhooks, the unglamorous middle where systems meet. You appear to enjoy making other people's services talk. Edit freely.",
    thinking: { "systems-oriented": 40, tactical: 35, experimental: 25 },
    contribution: { integrator: 45, builder: 30, debugger: 25 },
    collaboration: { connector: 45, supporter: 30, initiator: 25 },
    skills: ["Node", "APIs", "webhooks"],
    tools: ["Express", "Redis", "Railway"],
    interests: "Interoperability, event-driven systems",
    helpOffered: "Wiring any two services together",
    helpWanted: "Writing — my READMEs are apologies",
    assumption: "I'm assuming someone knows which platform integrations are actually required this week.",
  },
  {
    githubLogin: "seed-sofia-m",
    name: "Sofia Marchetti",
    summary:
      "Your public work suggests a finisher: long tails of commits polishing edge cases after everyone else moved on. You appear to be the reason things actually ship. Does that ring true?",
    thinking: { "detail-oriented": 45, tactical: 35, analytical: 20 },
    contribution: { builder: 40, debugger: 35, documenter: 25 },
    collaboration: { finisher: 50, supporter: 30, challenger: 20 },
    skills: ["TypeScript", "Next.js", "accessibility"],
    tools: ["Playwright", "Sentry", "Vercel"],
    interests: "Quality, a11y, the last 10% that takes 50%",
    helpOffered: "Taking a feature from demo-ready to real",
    helpWanted: "Starting — blank pages scare me more than prod incidents",
    assumption: "I'm assuming someone knows our actual browser-support bar.",
  },
  {
    githubLogin: "seed-leo-b",
    name: "Leo Brandt",
    summary:
      "Your repos suggest a conceptual starter — ambitious scaffolds, manifesto READMEs, three frameworks tried in one month. You appear to generate directions faster than any team can chase them. We may be wrong. Are we?",
    thinking: { conceptual: 50, experimental: 30, "systems-oriented": 20 },
    contribution: { researcher: 35, designer: 35, builder: 30 },
    collaboration: { initiator: 45, challenger: 30, connector: 25 },
    skills: ["product thinking", "React", "prototyping"],
    tools: ["v0", "Figma", "Supabase"],
    interests: "New interaction paradigms, agentic UX",
    helpOffered: "Reframing a stuck problem in ten minutes",
    helpWanted: "A finisher. Genuinely. Please.",
    assumption: "I'm assuming someone knows which week-one ideas are worth resurrecting.",
  },
];

const PROJECTS: {
  name: string;
  goal: string;
  currentState: string;
  repoUrl: string | null;
  leaders: string[]; // seed githubLogins
  members: string[];
}[] = [
  {
    name: "Forth",
    goal: "The cohort's winning week-one PM platform — quests, parties, and adventurers. Now taking contributions from the whole cohort.",
    currentState: "Live; onboarding contributors via pull requests.",
    repoUrl: null,
    leaders: ["seed-anna-l"],
    members: ["seed-jordan-k", "seed-sofia-m"],
  },
  {
    name: "Rally",
    goal: "Week-one comms experiment — realtime channels and DMs. Kept alive as a reference implementation while week two runs.",
    currentState: "Stable; open to anyone who wants to study or extend it.",
    repoUrl: null,
    leaders: ["seed-dev-o"],
    members: ["seed-mara-v"],
  },
  {
    name: "Whose Ball",
    goal: "A momentum tracker for team projects: who holds the ball, what stage the work is in, and where it's stuck.",
    currentState: "Submitted week one; exploring what a cohort-wide version needs.",
    repoUrl: null,
    leaders: ["gge513"],
    members: ["seed-priya-n"],
  },
];

const CHANNELS = [
  { name: "general", isAnnouncements: false },
  { name: "help-wanted", isAnnouncements: false },
  { name: "show-your-work", isAnnouncements: false },
  { name: "announcements", isAnnouncements: true },
];

async function upsertUser(p: {
  githubLogin: string;
  name: string;
  isSeed: boolean;
  isAdmin?: boolean;
  onboarding?: "new" | "done";
}) {
  const [row] = await db
    .insert(users)
    .values({
      githubLogin: p.githubLogin,
      name: p.name,
      isSeed: p.isSeed,
      isAdmin: p.isAdmin ?? false,
      onboarding: p.onboarding ?? "done",
    })
    .onConflictDoUpdate({
      target: users.githubLogin,
      set: { isSeed: p.isSeed, isAdmin: p.isAdmin ?? false },
    })
    .returning({ id: users.id });
  return row.id;
}

async function main() {
  // George: real account, admin, leader of Whose Ball. His GitHub OAuth
  // sign-in links onto this row via the githubLogin conflict target.
  const georgeId = await upsertUser({
    githubLogin: "gge513",
    name: "George Eastwood",
    isSeed: false,
    isAdmin: true,
    onboarding: "new",
  });

  const ids = new Map<string, number>([["gge513", georgeId]]);

  for (const p of PEOPLE) {
    const id = await upsertUser({ githubLogin: p.githubLogin, name: p.name, isSeed: true });
    ids.set(p.githubLogin, id);
    await db
      .insert(profiles)
      .values({
        userId: id,
        generatedSummary: p.summary,
        userSummary: p.summary,
        thinking: p.thinking,
        contribution: p.contribution,
        collaboration: p.collaboration,
        skills: p.skills,
        tools: p.tools,
        interests: p.interests,
        helpOffered: p.helpOffered,
        helpWanted: p.helpWanted,
        assumption: p.assumption,
        approved: true,
        githubAnalysis: { degraded: "seeded demo profile — no live GitHub read" },
      })
      .onConflictDoNothing({ target: profiles.userId });
  }

  for (const proj of PROJECTS) {
    const existing = await db.query.projects.findFirst({ where: eq(projects.name, proj.name) });
    let projectId = existing?.id;
    if (!projectId) {
      const [row] = await db
        .insert(projects)
        .values({
          name: proj.name,
          goal: proj.goal,
          currentState: proj.currentState,
          repoUrl: proj.repoUrl,
          isSeed: true,
        })
        .returning({ id: projects.id });
      projectId = row.id;
    }
    for (const login of proj.leaders) {
      const uid = ids.get(login);
      if (uid)
        await db
          .insert(projectMembers)
          .values({ projectId, userId: uid, isLeader: true })
          .onConflictDoNothing();
    }
    for (const login of proj.members) {
      const uid = ids.get(login);
      if (uid)
        await db
          .insert(projectMembers)
          .values({ projectId, userId: uid })
          .onConflictDoNothing();
    }
    await db
      .insert(cadenceContracts)
      .values({
        projectId,
        terms:
          "One synchronous meeting a week (30 min, agenda in chat beforehand). Async check-ins in project chat — post when something moves, not on a timer. We expand the rhythm only after people have shown up regularly. Edit by consent.",
      })
      .onConflictDoNothing({ target: cadenceContracts.projectId });
  }

  for (const ch of CHANNELS) {
    const existing = await db.query.conversations.findFirst({
      where: (c, { and, eq: e }) => and(e(c.kind, "channel"), e(c.name, ch.name)),
    });
    if (!existing) {
      const [row] = await db
        .insert(conversations)
        .values({ kind: "channel", name: ch.name, isAnnouncements: ch.isAnnouncements })
        .returning({ id: conversations.id });
      if (ch.name === "general") {
        await db.insert(messages).values([
          {
            conversationId: row.id,
            senderId: ids.get("seed-anna-l"),
            senderKind: "user" as const,
            content:
              "Week two kickoff: if you're looking for a project to join, the directory is under Projects — every one of them takes join requests.",
          },
          {
            conversationId: row.id,
            senderId: ids.get("seed-jordan-k"),
            senderKind: "user" as const,
            content: "Anyone else find the cohort map slightly too accurate about them, or just me.",
          },
        ]);
      }
      if (ch.name === "announcements") {
        await db.insert(messages).values({
          conversationId: row.id,
          senderId: georgeId,
          senderKind: "user" as const,
          content:
            "Welcome to the Tavern. Staff posts land here; conversation happens in #general. First stop for everyone: finish onboarding and check your two suggested collaborators on the map.",
        });
      }
    }
  }

  console.log("Seeded:", {
    users: ids.size,
    projects: PROJECTS.length,
    channels: CHANNELS.length,
  });
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  }
);
