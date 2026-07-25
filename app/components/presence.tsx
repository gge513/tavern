"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

/**
 * "At the bar" — live presence in the top rail. Heartbeats /api/presence
 * every 30s (the endpoint stamps the caller and returns everyone seen in the
 * last two minutes), so opening any page keeps you visible.
 */

type OnlinePerson = {
  id: number;
  name: string;
  githubLogin: string | null;
  avatarUrl: string | null;
};

export function Presence() {
  const [online, setOnline] = useState<OnlinePerson[]>([]);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    async function beat() {
      try {
        const res = await fetch("/api/presence", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { online: OnlinePerson[] };
        if (alive) setOnline(data.online);
      } catch {}
    }
    beat();
    const t = setInterval(beat, 30_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        className="rail-link flex items-center gap-1.5"
        onClick={() => setOpen((o) => !o)}
        title="Who's at the bar right now"
      >
        <span className="presence-dot" aria-hidden />
        At the bar
        {online.length > 0 && <span className="rail-badge">{online.length}</span>}
      </button>
      {open && (
        <div className="card absolute right-0 top-full mt-2 w-64 p-3 z-20 space-y-2">
          <p className="text-xs text-dim">
            {online.length === 0
              ? "Just you tonight. The bartender is around."
              : `In the room with you right now:`}
          </p>
          {online.map((p) => (
            <Link
              key={p.id}
              href={`/people/${p.id}`}
              className="flex items-center gap-2 text-sm hover:bg-hover rounded px-1 py-0.5"
              onClick={() => setOpen(false)}
            >
              {p.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.avatarUrl} alt="" className="w-5 h-5 rounded-full" />
              ) : (
                <span className="w-5 h-5 rounded-full bg-hover inline-block" />
              )}
              <span>{p.name}</span>
              <span className="presence-dot ml-auto" aria-hidden />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
