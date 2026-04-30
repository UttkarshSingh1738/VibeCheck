import type { Scorecard } from "@/lib/types";

const ROWS: Array<{ key: keyof Scorecard; label: string }> = [
  { key: "cohesion", label: "Cohesion" },
  { key: "diversity", label: "Diversity" },
  { key: "discovery", label: "Discovery" },
  { key: "vibe", label: "Vibe" },
  { key: "lyrical_depth", label: "Lyrical depth" }
];

export function ScorecardDisplay({ scorecard, title }: { scorecard: Scorecard; title?: string }) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
      {title && <div className="mb-3 text-sm uppercase tracking-wide text-zinc-400">{title}</div>}
      <div className="space-y-3">
        {ROWS.map(({ key, label }) => {
          const v = scorecard[key] as number;
          return (
            <div key={key}>
              <div className="mb-1 flex items-center justify-between text-sm">
                <span>{label}</span>
                <span className="tabular-nums text-zinc-300">{v}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-zinc-800">
                <div className="h-full bg-spotify" style={{ width: `${v}%` }} />
              </div>
            </div>
          );
        })}
      </div>
      {scorecard.commentary && (
        <p className="mt-4 text-sm leading-relaxed text-zinc-300">{scorecard.commentary}</p>
      )}
    </div>
  );
}
