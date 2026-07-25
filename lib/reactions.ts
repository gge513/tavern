/**
 * The house reaction set. Fixed, not free-form — six marks that fit the room,
 * each with a plain meaning so a reaction says something. Shared by the API
 * validator and the picker UI.
 */
export const REACTIONS: { emoji: string; label: string }[] = [
  { emoji: "🍻", label: "Cheers — agreed, well done" },
  { emoji: "🥃", label: "Well said — raising a glass to the wording" },
  { emoji: "🎯", label: "Bullseye — exactly right" },
  { emoji: "🔥", label: "Hearth — this warms the room" },
  { emoji: "🎲", label: "Dicey — risky, not convinced" },
  { emoji: "🕯️", label: "Illuminating — I learned something" },
];

export const REACTION_EMOJIS = new Set(REACTIONS.map((r) => r.emoji));

export type ReactionSummary = {
  messageId: number;
  emoji: string;
  count: number;
  mine: boolean;
  names: string[];
};
