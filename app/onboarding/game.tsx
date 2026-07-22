"use client";

import { useMemo, useState, useTransition } from "react";

import {
  COLLABORATION,
  CONTRIBUTION,
  GAME_QUESTIONS,
  THINKING,
  scoreDimension,
} from "@/lib/traits";
import { completeOnboardingAction } from "./actions";

/**
 * The onboarding game (spec 5.2): ~11 beats, completion over completeness.
 * Deterministic scoring so the map is explainable; every number editable
 * before approval.
 */

type FreeBeat = {
  id: "assumption" | "interests" | "help";
  title: string;
};

const FREE_BEATS: FreeBeat[] = [
  { id: "assumption", title: "The question you're carrying" },
  { id: "interests", title: "What you're here for" },
  { id: "help", title: "Trade routes" },
];

export function Game() {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({}); // questionId -> optionIndex
  const [free, setFree] = useState({
    assumption: "",
    interests: "",
    learningGoals: "",
    helpOffered: "",
    helpWanted: "",
  });
  const [openToConnect, setOpenToConnect] = useState(true);
  const [edited, setEdited] = useState<null | {
    thinking: Record<string, number>;
    contribution: Record<string, number>;
    collaboration: Record<string, number>;
  }>(null);
  const [pending, startTransition] = useTransition();

  const totalSteps = GAME_QUESTIONS.length + FREE_BEATS.length + 1; // + map reveal/approve

  const computed = useMemo(() => {
    const byDim = (dim: string) =>
      GAME_QUESTIONS.filter((q) => q.dimension === dim && answers[q.id] != null).map(
        (q) => q.options[answers[q.id]].weights
      );
    return {
      thinking: scoreDimension(THINKING, byDim("thinking")),
      contribution: scoreDimension(CONTRIBUTION, byDim("contribution")),
      collaboration: scoreDimension(COLLABORATION, byDim("collaboration")),
    };
  }, [answers]);

  const map = edited ?? computed;

  function submit() {
    startTransition(async () => {
      await completeOnboardingAction({
        ...map,
        assumption: free.assumption,
        interests: free.interests,
        learningGoals: free.learningGoals,
        helpOffered: free.helpOffered,
        helpWanted: free.helpWanted,
        openToConnect,
      });
    });
  }

  const progress = Math.round(((step + 1) / totalSteps) * 100);

  return (
    <div className="max-w-xl mx-auto pt-10 space-y-6">
      <div className="h-1.5 rounded bg-raised overflow-hidden">
        <div className="h-full bg-amber transition-all" style={{ width: `${progress}%` }} />
      </div>

      {step < GAME_QUESTIONS.length && (
        <QuestionBeat
          key={GAME_QUESTIONS[step].id}
          prompt={GAME_QUESTIONS[step].prompt}
          options={GAME_QUESTIONS[step].options.map((o) => o.label)}
          selected={answers[GAME_QUESTIONS[step].id]}
          onPick={(i) => {
            setAnswers((a) => ({ ...a, [GAME_QUESTIONS[step].id]: i }));
            setTimeout(() => setStep((s) => s + 1), 150);
          }}
        />
      )}

      {step === GAME_QUESTIONS.length && (
        <div className="space-y-4">
          <h2 className="text-xl font-bold">Name one thing you&apos;re assuming someone else knows the answer to.</h2>
          <p className="text-sm text-dim">
            Everyone is carrying one. Yours becomes your first Question when you
            join a project — asking is a contribution here, not a confession.
          </p>
          <textarea
            className="input min-h-28"
            value={free.assumption}
            onChange={(e) => setFree((f) => ({ ...f, assumption: e.target.value }))}
            placeholder="e.g. I'm assuming someone knows how auth is supposed to work across our deploys."
          />
          <NextBtn onClick={() => setStep(step + 1)} disabled={!free.assumption.trim()} />
        </div>
      )}

      {step === GAME_QUESTIONS.length + 1 && (
        <div className="space-y-4">
          <h2 className="text-xl font-bold">What you&apos;re here for</h2>
          <div>
            <label className="label">Interests — what kind of work pulls you in</label>
            <input
              className="input"
              value={free.interests}
              onChange={(e) => setFree((f) => ({ ...f, interests: e.target.value }))}
            />
          </div>
          <div>
            <label className="label">Learning goals for this phase</label>
            <input
              className="input"
              value={free.learningGoals}
              onChange={(e) => setFree((f) => ({ ...f, learningGoals: e.target.value }))}
            />
          </div>
          <NextBtn onClick={() => setStep(step + 1)} disabled={false} />
        </div>
      )}

      {step === GAME_QUESTIONS.length + 2 && (
        <div className="space-y-4">
          <h2 className="text-xl font-bold">Trade routes</h2>
          <div>
            <label className="label">Help you can offer</label>
            <input
              className="input"
              value={free.helpOffered}
              onChange={(e) => setFree((f) => ({ ...f, helpOffered: e.target.value }))}
              placeholder="e.g. debugging async code, code review, naming things"
            />
          </div>
          <div>
            <label className="label">Help you want</label>
            <input
              className="input"
              value={free.helpWanted}
              onChange={(e) => setFree((f) => ({ ...f, helpWanted: e.target.value }))}
              placeholder="e.g. CSS that doesn't fight back, deployment"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-dim">
            <input
              type="checkbox"
              checked={openToConnect}
              onChange={(e) => setOpenToConnect(e.target.checked)}
            />
            Open to being suggested as a collaborator
          </label>
          <NextBtn onClick={() => setStep(step + 1)} disabled={false} />
        </div>
      )}

      {step === totalSteps - 1 + 0 && step === GAME_QUESTIONS.length + 3 && (
        <div className="space-y-5">
          <div>
            <h2 className="text-xl font-bold">Your collaborator map</h2>
            <p className="text-sm text-dim mt-1">
              Directional, not scientific — built from your answers, nothing
              else. Adjust any number, then approve. Only after you approve does
              any of this become visible to the cohort.
            </p>
          </div>
          {(
            [
              ["Thinking", "thinking"],
              ["Contribution", "contribution"],
              ["Collaboration", "collaboration"],
            ] as const
          ).map(([title, key]) => (
            <div key={key} className="card p-4 space-y-2">
              <div className="label">{title} style</div>
              {Object.entries(map[key]).map(([trait, pct]) => (
                <div key={trait} className="flex items-center gap-3 text-sm">
                  <span className="w-40 capitalize">{trait}</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    className="input w-20"
                    value={pct}
                    onChange={(e) =>
                      setEdited({
                        ...map,
                        [key]: { ...map[key], [trait]: Number(e.target.value) },
                      })
                    }
                  />
                  <div className="flex-1 h-2 rounded bg-bg overflow-hidden">
                    <div className="h-full bg-amber-dim" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              ))}
              {Object.keys(map[key]).length === 0 && (
                <p className="text-sm text-dim">No strong signal — that&apos;s fine.</p>
              )}
            </div>
          ))}
          <button className="btn" onClick={submit} disabled={pending}>
            {pending ? "Setting you up…" : "Approve my profile — make it visible"}
          </button>
        </div>
      )}
    </div>
  );
}

function QuestionBeat(props: {
  prompt: string;
  options: string[];
  selected?: number;
  onPick: (i: number) => void;
}) {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">{props.prompt}</h2>
      <div className="grid gap-2">
        {props.options.map((label, i) => (
          <button
            key={i}
            onClick={() => props.onPick(i)}
            className={`card text-left p-3 text-sm hover:bg-hover transition-colors ${
              props.selected === i ? "border-amber-dim" : ""
            }`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

function NextBtn(props: { onClick: () => void; disabled: boolean }) {
  return (
    <button className="btn" onClick={props.onClick} disabled={props.disabled}>
      Next
    </button>
  );
}
