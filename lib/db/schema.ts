import {
  pgSchema,
  serial,
  text,
  integer,
  timestamp,
  boolean,
  jsonb,
  unique,
  index,
} from "drizzle-orm/pg-core";

// Everything lives in the `reprise` pg schema — the Neon instance is shared
// with another project and the schema boundary is the isolation.
export const reprise = pgSchema("reprise");

export const onboardingState = reprise.enum("onboarding_state", [
  "new", // signed in, nothing generated yet
  "draft", // draft profile generated, under review
  "game", // profile confirmed, playing the onboarding game
  "done", // profile approved and cohort-visible
]);

export const matchType = reprise.enum("match_type", ["alike", "complementary"]);

export const conversationKind = reprise.enum("conversation_kind", [
  "dm",
  "channel",
  "project",
  "thread",
  "tavern",
]);

export const senderKind = reprise.enum("sender_kind", [
  "user",
  "bartender",
  "system",
]);

// The five structured conversation types (spec 5.6). Intentional, one tap,
// skippable — a signal, not enforcement.
export const structuredType = reprise.enum("structured_type", [
  "question",
  "decision",
  "blocker",
  "help",
  "action",
]);

export const joinRequestStatus = reprise.enum("join_request_status", [
  "pending",
  "followup", // leader asked a follow-up question
  "accepted",
  "declined",
]);

// Every tavern visit ends in exactly one of these (spec 5.7).
export const tavernOutcome = reprise.enum("tavern_outcome", [
  "act",
  "invite",
  "clarify",
  "release",
]);

export const notificationKind = reprise.enum("notification_kind", [
  "dm",
  "mention",
  "join_request",
  "join_decision",
  "introduction",
  "announcement",
]);

export const users = reprise.table("users", {
  id: serial("id").primaryKey(),
  githubLogin: text("github_login").unique(),
  name: text("name").notNull(),
  email: text("email").unique(),
  avatarUrl: text("avatar_url"),
  passwordHash: text("password_hash"),
  isAdmin: boolean("is_admin").notNull().default(false),
  // Seeded demo people are labeled honestly everywhere they appear (spec 1).
  isSeed: boolean("is_seed").notNull().default(false),
  onboarding: onboardingState("onboarding").notNull().default("new"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const profiles = reprise.table("profiles", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .unique()
    .references(() => users.id),
  // The AI's hedged draft, never shown as fact. userSummary is the wording
  // the student approved — the only cohort-visible text.
  generatedSummary: text("generated_summary"),
  userSummary: text("user_summary"),
  // Percentage maps, e.g. { experimental: 45, analytical: 35, conceptual: 20 }
  thinking: jsonb("thinking").$type<Record<string, number>>(),
  contribution: jsonb("contribution").$type<Record<string, number>>(),
  collaboration: jsonb("collaboration").$type<Record<string, number>>(),
  skills: jsonb("skills").$type<string[]>().default([]),
  tools: jsonb("tools").$type<string[]>().default([]),
  interests: text("interests"),
  learningGoals: text("learning_goals"),
  helpOffered: text("help_offered"),
  helpWanted: text("help_wanted"),
  openToConnect: boolean("open_to_connect").notNull().default(true),
  // The fixed onboarding beat: "Name one thing you're assuming someone else
  // knows the answer to." Surfaces later as their first project Question.
  assumption: text("assumption"),
  // Raw public-GitHub evidence the draft was derived from (languages, repo
  // topics, activity counts). Public data only — never private repos.
  githubAnalysis: jsonb("github_analysis").$type<{
    languages?: string[];
    topics?: string[];
    repoCount?: number;
    recentRepos?: { name: string; description: string | null; language: string | null }[];
    degraded?: string;
  }>(),
  approved: boolean("approved").notNull().default(false),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const matches = reprise.table(
  "matches",
  {
    id: serial("id").primaryKey(),
    userAId: integer("user_a_id")
      .notNull()
      .references(() => users.id),
    userBId: integer("user_b_id")
      .notNull()
      .references(() => users.id),
    type: matchType("type").notNull(),
    // Plain-language "why", shown on the card and read by the bartender.
    explanation: text("explanation").notNull(),
    // Set once the DM + introduction has been opened from this match.
    conversationId: integer("conversation_id"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [unique().on(t.userAId, t.userBId, t.type)]
);

export const projects = reprise.table("projects", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  goal: text("goal").notNull(),
  currentState: text("current_state"),
  repoUrl: text("repo_url"),
  isSeed: boolean("is_seed").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const projectMembers = reprise.table(
  "project_members",
  {
    id: serial("id").primaryKey(),
    projectId: integer("project_id")
      .notNull()
      .references(() => projects.id),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    isLeader: boolean("is_leader").notNull().default(false),
    joinedAt: timestamp("joined_at").notNull().defaultNow(),
  },
  (t) => [unique().on(t.projectId, t.userId)]
);

export const joinRequests = reprise.table("join_requests", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id")
    .notNull()
    .references(() => projects.id),
  applicantId: integer("applicant_id")
    .notNull()
    .references(() => users.id),
  reason: text("reason").notNull(),
  intent: text("intent"),
  // Clearly labeled as an AI suggestion in the UI, never as a verdict.
  aiFitSuggestion: text("ai_fit_suggestion"),
  status: joinRequestStatus("status").notNull().default("pending"),
  followupQuestion: text("followup_question"),
  followupAnswer: text("followup_answer"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Simple editable card, not a negotiation flow (spec 5.5 "if time is tight").
export const cadenceContracts = reprise.table("cadence_contracts", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id")
    .notNull()
    .unique()
    .references(() => projects.id),
  terms: text("terms").notNull(),
  updatedBy: integer("updated_by").references(() => users.id),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const conversations = reprise.table("conversations", {
  id: serial("id").primaryKey(),
  kind: conversationKind("kind").notNull(),
  // Channels only: display name + admin-only posting for #announcements.
  name: text("name"),
  isAnnouncements: boolean("is_announcements").notNull().default(false),
  archived: boolean("archived").notNull().default(false),
  createdBy: integer("created_by").references(() => users.id),
  projectId: integer("project_id").references(() => projects.id),
  // Threads: the message this thread branched from.
  parentMessageId: integer("parent_message_id"),
  topic: text("topic"),
  // Bartender introduction state machine for DMs opened from a match:
  // null | "opened" | "stepped_back"
  introState: text("intro_state"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  lastActivityAt: timestamp("last_activity_at").notNull().defaultNow(),
});

export const conversationParticipants = reprise.table(
  "conversation_participants",
  {
    id: serial("id").primaryKey(),
    conversationId: integer("conversation_id")
      .notNull()
      .references(() => conversations.id),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    lastReadAt: timestamp("last_read_at"),
  },
  (t) => [unique().on(t.conversationId, t.userId)]
);

export const messages = reprise.table(
  "messages",
  {
    id: serial("id").primaryKey(),
    conversationId: integer("conversation_id")
      .notNull()
      .references(() => conversations.id),
    senderId: integer("sender_id").references(() => users.id),
    senderKind: senderKind("sender_kind").notNull().default("user"),
    content: text("content").notNull(),
    structuredType: structuredType("structured_type"),
    // Action items can carry an owner; Decisions can carry resolved state.
    ownerId: integer("owner_id").references(() => users.id),
    resolved: boolean("resolved"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("messages_conversation_idx").on(t.conversationId, t.id)]
);

export const tavernSessions = reprise.table("tavern_sessions", {
  id: serial("id").primaryKey(),
  ownerId: integer("owner_id")
    .notNull()
    .references(() => users.id),
  conversationId: integer("conversation_id")
    .notNull()
    .references(() => conversations.id),
  outcome: tavernOutcome("outcome"),
  // "Invite" produces a drafted message to bring back to the project —
  // never auto-shared (spec 5.7).
  draftMessage: text("draft_message"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const notifications = reprise.table(
  "notifications",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    kind: notificationKind("kind").notNull(),
    content: text("content").notNull(),
    href: text("href").notNull(),
    readAt: timestamp("read_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("notifications_user_idx").on(t.userId, t.readAt)]
);
