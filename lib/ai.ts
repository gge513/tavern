import Anthropic from "@anthropic-ai/sdk";

import type { GithubAnalysis } from "@/lib/github";

/**
 * The three Anthropic call sites from spec section 9:
 *  1. profile generation + match explanations (structured)
 *  2. the bartender (introductions + tavern — one system-prompt family,
 *     different modes)
 *  3. chronicle summarization (stretch — not built in the Contest Cut)
 *
 * Every function degrades to null on failure; callers must have a
 * non-AI fallback so the P0 loop never blocks on the API.
 */

const client = new Anthropic();

const MODEL = "claude-opus-4-8";

/** Spec section 11, verbatim enough to govern every bartender mode. */
const BARTENDER_CORE = `You are the bartender of Reprise, a communication platform for a cohort of ~60 adult coding students (all 28+). You are dry, direct, and warm without being twee. No forced icebreaker energy, no exclamation marks unless truly earned, no emoji.

Hard rules you never break:
- Never diagnose a person, never label anyone toxic, lazy, manipulative, or incompetent.
- Never claim to know another person's intent.
- Never present inference as fact. Distinguish what was actually said, what you are inferring, and what you do not know.
- Never rank people by intelligence or turn traits into performance ratings.
- Recommendations are suggestions, never assignments. One suggestion, then step back — always.
- Acknowledge uncertainty. Encourage direct human communication. Preserve unresolved disagreement rather than inventing a falsely coherent story.`;

function textOf(res: Anthropic.Message): string | null {
  if (res.stop_reason === "refusal") return null;
  const block = res.content.find((b) => b.type === "text");
  return block && block.type === "text" ? block.text : null;
}

/** Call site 1a: hedged draft profile from public GitHub evidence. */
export async function generateProfileDraft(input: {
  name: string;
  githubLogin: string | null;
  analysis: GithubAnalysis | null;
}): Promise<{ summary: string; skills: string[]; tools: string[] } | null> {
  try {
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 1200,
      system: `You draft collaborator profiles for Reprise from public GitHub evidence only. Every inference must be hedged ("Your public work suggests…", "You appear to…"). Never make fixed claims about intelligence, ability, or competence. Address the student directly as "you". End the summary with a variant of: "We may be wrong about any of this — edit anything that doesn't sound like you." Keep the summary to 3–5 sentences, dry and adult in tone.`,
      output_config: {
        format: {
          type: "json_schema",
          schema: {
            type: "object",
            properties: {
              summary: { type: "string" },
              skills: { type: "array", items: { type: "string" } },
              tools: { type: "array", items: { type: "string" } },
            },
            required: ["summary", "skills", "tools"],
            additionalProperties: false,
          },
        },
      },
      messages: [
        {
          role: "user",
          content: `Draft a hedged profile for ${input.name} (GitHub: ${input.githubLogin ?? "not linked"}).\n\nPublic GitHub evidence:\n${JSON.stringify(input.analysis ?? { note: "no public data available" }, null, 2)}\n\nSkills = languages/frameworks/domains their work suggests. Tools = concrete tech. If evidence is thin, say so plainly and keep lists short rather than inventing.`,
        },
      ],
    });
    const text = textOf(res);
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

export type ProfileForMatching = {
  userId: number;
  name: string;
  summary: string | null;
  thinking: Record<string, number> | null;
  contribution: Record<string, number> | null;
  collaboration: Record<string, number> | null;
  skills: string[];
  helpOffered: string | null;
  helpWanted: string | null;
  interests: string | null;
};

/** Call site 1b: pick the best alike + complementary match with plain-language whys. */
export async function explainMatches(
  me: ProfileForMatching,
  candidates: { alike: ProfileForMatching[]; complementary: ProfileForMatching[] }
): Promise<{
  alike: { userId: number; explanation: string };
  complementary: { userId: number; explanation: string };
} | null> {
  try {
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 900,
      system: `You write match explanations for Reprise. Pick one "most alike" and one "most complementary" collaborator for the student from the candidate lists. Explanations are 1–2 plain sentences, second person, concrete, hedged where inferring (e.g. "You tend to begin conceptually and generate new directions. Jordan tends to turn uncertain ideas into concrete implementation steps."). Suggestions, never verdicts. Dry, adult tone.`,
      output_config: {
        format: {
          type: "json_schema",
          schema: {
            type: "object",
            properties: {
              alike: {
                type: "object",
                properties: {
                  userId: { type: "integer" },
                  explanation: { type: "string" },
                },
                required: ["userId", "explanation"],
                additionalProperties: false,
              },
              complementary: {
                type: "object",
                properties: {
                  userId: { type: "integer" },
                  explanation: { type: "string" },
                },
                required: ["userId", "explanation"],
                additionalProperties: false,
              },
            },
            required: ["alike", "complementary"],
            additionalProperties: false,
          },
        },
      },
      messages: [
        {
          role: "user",
          content: `Student:\n${JSON.stringify(me)}\n\nAlike candidates:\n${JSON.stringify(candidates.alike)}\n\nComplementary candidates:\n${JSON.stringify(candidates.complementary)}\n\nChoose one from each list (return their userId) and explain why in plain language.`,
        },
      ],
    });
    const text = textOf(res);
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

/** Call site 2a: the bartender's opening move in a fresh introduction DM. */
export async function bartenderIntroduction(input: {
  a: ProfileForMatching;
  b: ProfileForMatching;
  matchType: "alike" | "complementary";
  explanation: string;
}): Promise<string | null> {
  try {
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 700,
      system: `${BARTENDER_CORE}

Mode: introduction. Two students were matched and a conversation just opened with you as a brief third participant. Adapt your register to both profiles (playful, practical, personal, reflective, or technical — whatever fits them). In one short message: open with why this match exists (ground it in the explanation and their profiles), then ask each person one short, specific question by name. Do NOT offer a next step yet — that comes after they have both spoken. Under 120 words.`,
      messages: [
        {
          role: "user",
          content: `Match type: ${input.matchType}\nWhy: ${input.explanation}\n\nPerson A:\n${JSON.stringify(input.a)}\n\nPerson B:\n${JSON.stringify(input.b)}`,
        },
      ],
    });
    return textOf(res);
  } catch {
    return null;
  }
}

/** Call site 2b: the bartender's single next step, after both humans have spoken. Then it stops. */
export async function bartenderNextStep(input: {
  a: ProfileForMatching;
  b: ProfileForMatching;
  transcript: { speaker: string; content: string }[];
}): Promise<string | null> {
  try {
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 400,
      system: `${BARTENDER_CORE}

Mode: introduction, closing move. Both students have now spoken. Offer EXACTLY ONE next step, chosen from: continue privately, explore a project together, offer or request help, bring in a third student, or review each other's week-one work. Pick the one their exchange actually supports and say why in a sentence. Then bow out explicitly (e.g. "I'll leave you to it."). Under 60 words. This is your last message in this conversation.`,
      messages: [
        {
          role: "user",
          content: `Person A: ${JSON.stringify(input.a)}\nPerson B: ${JSON.stringify(input.b)}\n\nConversation so far:\n${input.transcript.map((t) => `${t.speaker}: ${t.content}`).join("\n")}`,
        },
      ],
    });
    return textOf(res);
  } catch {
    return null;
  }
}

/** Call site 2c: the tavern — private thinking space with the said/inferred/unknown discipline. */
export async function bartenderTavern(input: {
  ownerName: string;
  transcript: { speaker: "you" | "bartender"; content: string }[];
}): Promise<string | null> {
  try {
    // Cap context to control cost and latency (spec section 9).
    const recent = input.transcript.slice(-16);
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 700,
      system: `${BARTENDER_CORE}

Mode: tavern. This is a private, single-user space where ${input.ownerName} thinks through a confusion alone with you. Nothing here is shared unless they choose to share it, and you use only what they tell you in this session.

Work the questions naturally, not as a checklist: what happened; what do they know directly; what are they assuming; what outcome do they want; is this technical, communication, or both; who may have missing context.

Whenever interpersonal meaning is involved, apply the context discipline explicitly and visibly, formatted as three short labeled lines:
Said: what was actually said (e.g. "Jordan said the PR was ready for review")
Inferring: what you or they are inferring (e.g. "You may have understood that as finished")
Unknown: what remains unknown (e.g. "I don't know whether Jordan meant production-ready")

Steer, over the course of the session, toward one of four endings — Act, Invite (bring it back to the project, with a drafted message), Clarify (ask the person directly), or Release (let it go) — but never force it early. One question or one observation per turn. Under 130 words per reply.`,
      messages: recent.map((t) => ({
        role: t.speaker === "you" ? ("user" as const) : ("assistant" as const),
        content: t.content,
      })),
    });
    return textOf(res);
  } catch {
    return null;
  }
}

/**
 * Call site 2d: the shared table — two students brainstorming in real time,
 * bartender as neutral facilitator, speaking only when summoned (the bell).
 */
export async function bartenderTable(input: {
  names: string[];
  transcript: { speaker: string; content: string }[];
  ledger?: string;
}): Promise<string | null> {
  try {
    const recent = input.transcript.slice(-24);
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 600,
      system: `${BARTENDER_CORE}

Mode: shared table. ${input.names.join(" and ")} are working through something together at one table, in real time. You are the neutral facilitator, and you speak ONLY when they ring the bell — they just did.

Read the exchange and do the facilitator's job, briefly: name each person's perspective in their own terms; name what they already agree is true; name what remains unresolved or unknown; then offer exactly one concrete next move for the conversation (a question one should ask the other, a decision they're circling, a thing to write down). Never declare a winner, never smooth over a real disagreement — unresolved is an honest state. Under 130 words, then go back to the bar.`,
      messages: [
        {
          role: "user",
          content: `${input.ledger ? `Their shared ledger:\n${input.ledger}\n\n` : ""}The table so far:\n${recent.map((t) => `${t.speaker}: ${t.content}`).join("\n")}`,
        },
      ],
    });
    return textOf(res);
  } catch {
    return null;
  }
}

/** Tavern "Invite" ending: draft the message to bring back to the project. */
export async function bartenderInviteDraft(input: {
  transcript: { speaker: "you" | "bartender"; content: string }[];
}): Promise<string | null> {
  try {
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 400,
      system: `${BARTENDER_CORE}

Mode: tavern, Invite ending. Draft a short message (under 90 words) the student could post to their project to bring others into what they worked through here. First person, their voice not yours, non-blaming, states what they know vs. what they're unsure about, asks one concrete thing. Output only the draft message text.`,
      messages: [
        {
          role: "user",
          content: input.transcript
            .slice(-16)
            .map((t) => `${t.speaker}: ${t.content}`)
            .join("\n"),
        },
      ],
    });
    return textOf(res);
  } catch {
    return null;
  }
}

/** Join requests: the clearly-labeled AI fit suggestion (spec 5.5). */
export async function joinFitSuggestion(input: {
  applicant: ProfileForMatching;
  projectName: string;
  projectGoal: string;
  reason: string;
  intent: string | null;
}): Promise<string | null> {
  try {
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 300,
      system: `You write short fit suggestions for project join requests on Reprise. 2 sentences max, hedged, concrete about what the applicant's profile suggests they could contribute and one thing worth asking them. This is labeled as an AI suggestion in the UI — never phrase it as a verdict on the person. Dry, adult tone.`,
      messages: [
        {
          role: "user",
          content: `Project: ${input.projectName} — ${input.projectGoal}\n\nApplicant profile: ${JSON.stringify(input.applicant)}\n\nTheir stated reason: ${input.reason}\nTheir intent: ${input.intent ?? "not stated"}`,
        },
      ],
    });
    return textOf(res);
  } catch {
    return null;
  }
}
