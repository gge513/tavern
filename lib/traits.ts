/**
 * The collaborator map's three dimensions (spec 5.2) and the onboarding
 * game's beats. Scoring is deterministic on purpose: the output must be
 * explainable and editable, and "directional rather than scientific."
 */

export const THINKING = [
  "conceptual",
  "tactical",
  "analytical",
  "experimental",
  "systems-oriented",
  "detail-oriented",
] as const;

export const CONTRIBUTION = [
  "builder",
  "debugger",
  "designer",
  "researcher",
  "organizer",
  "documenter",
  "integrator",
] as const;

export const COLLABORATION = [
  "initiator",
  "connector",
  "challenger",
  "finisher",
  "supporter",
  "facilitator",
] as const;

export type Dimension = "thinking" | "contribution" | "collaboration";

export type GameOption = {
  label: string;
  weights: Partial<Record<string, number>>; // trait -> points
};

export type GameQuestion = {
  id: string;
  dimension: Dimension;
  prompt: string;
  options: GameOption[];
};

// Two questions per dimension. Each answer adds points; percentages are
// the normalized top three traits per dimension.
export const GAME_QUESTIONS: GameQuestion[] = [
  {
    id: "t1",
    dimension: "thinking",
    prompt: "A new project idea lands in front of you. Your first instinct:",
    options: [
      { label: "Sketch the big idea and where it could go", weights: { conceptual: 3, experimental: 1 } },
      { label: "Figure out the first three concrete steps", weights: { tactical: 3 } },
      { label: "Ask what evidence says this is worth doing", weights: { analytical: 3 } },
      { label: "Spin up a rough prototype tonight", weights: { experimental: 3, tactical: 1 } },
      { label: "Map how it connects to everything around it", weights: { "systems-oriented": 3, conceptual: 1 } },
      { label: "Spot the three edge cases everyone will miss", weights: { "detail-oriented": 3, analytical: 1 } },
    ],
  },
  {
    id: "t2",
    dimension: "thinking",
    prompt: "Something's broken and nobody knows why. You:",
    options: [
      { label: "Step back and rethink the model of how it should work", weights: { conceptual: 2, "systems-oriented": 2 } },
      { label: "Bisect: change one thing, test, repeat", weights: { analytical: 2, "detail-oriented": 2 } },
      { label: "Try the three most likely fixes fast", weights: { experimental: 2, tactical: 2 } },
      { label: "Read the code line by line until it confesses", weights: { "detail-oriented": 3, analytical: 1 } },
    ],
  },
  {
    id: "c1",
    dimension: "contribution",
    prompt: "On a team, the work you'd quietly claim first:",
    options: [
      { label: "Shipping the core feature", weights: { builder: 3 } },
      { label: "Hunting the bug nobody else can find", weights: { debugger: 3 } },
      { label: "Making it feel right to use", weights: { designer: 3 } },
      { label: "Reading everything before we commit to an approach", weights: { researcher: 3 } },
      { label: "Turning chaos into a plan people follow", weights: { organizer: 3 } },
      { label: "Writing it down so the next person isn't lost", weights: { documenter: 3 } },
      { label: "Wiring the pieces other people built into one thing", weights: { integrator: 3 } },
    ],
  },
  {
    id: "c2",
    dimension: "contribution",
    prompt: "Which compliment would land hardest?",
    options: [
      { label: "\"You built that fast.\"", weights: { builder: 2, integrator: 1 } },
      { label: "\"You found the thing nobody else could.\"", weights: { debugger: 2, researcher: 1 } },
      { label: "\"This is actually pleasant to use.\"", weights: { designer: 2 } },
      { label: "\"Because of your notes, I understood it in ten minutes.\"", weights: { documenter: 2, organizer: 1 } },
      { label: "\"You made five people's work fit together.\"", weights: { integrator: 2, organizer: 1 } },
    ],
  },
  {
    id: "x1",
    dimension: "collaboration",
    prompt: "In a group that's stalling, you're most likely to:",
    options: [
      { label: "Just start — motion beats debate", weights: { initiator: 3 } },
      { label: "Pull in the person who'd unstick this", weights: { connector: 3 } },
      { label: "Say the uncomfortable thing about why we're stuck", weights: { challenger: 3 } },
      { label: "Take the half-done thing and drive it to done", weights: { finisher: 3 } },
      { label: "Back whoever's closest to a real answer", weights: { supporter: 3 } },
      { label: "Get everyone's version on the table, then converge", weights: { facilitator: 3 } },
    ],
  },
  {
    id: "x2",
    dimension: "collaboration",
    prompt: "Your honest failure mode in teams:",
    options: [
      { label: "Starting more than I finish", weights: { initiator: 2, finisher: -1 } },
      { label: "Poking holes without offering the patch", weights: { challenger: 2 } },
      { label: "Saying yes to everyone until I'm the bottleneck", weights: { supporter: 2, connector: 1 } },
      { label: "Polishing past the point of value", weights: { finisher: 2 } },
      { label: "Talking about the work instead of doing it", weights: { facilitator: 2, connector: 1 } },
    ],
  },
];

export function scoreDimension(
  traits: readonly string[],
  answers: Partial<Record<string, number>>[]
): Record<string, number> {
  const raw: Record<string, number> = {};
  for (const t of traits) raw[t] = 0;
  for (const a of answers) {
    for (const [trait, pts] of Object.entries(a)) {
      if (trait in raw && typeof pts === "number") raw[trait] += pts;
    }
  }
  const top = Object.entries(raw)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);
  const total = top.reduce((s, [, v]) => s + v, 0);
  if (total === 0) return {};
  const out: Record<string, number> = {};
  let acc = 0;
  top.forEach(([trait, v], i) => {
    const pct =
      i === top.length - 1 ? 100 - acc : Math.round((v / total) * 100);
    acc += pct;
    out[trait] = pct;
  });
  return out;
}

export function formatTraits(map: Record<string, number> | null): string {
  if (!map) return "—";
  return Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${v}% ${k}`)
    .join(", ");
}
