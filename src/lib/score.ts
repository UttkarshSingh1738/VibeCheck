import type { Scorecard } from "./types";

export function aiAverage(s: Scorecard): number {
  return (s.cohesion + s.diversity + s.discovery + s.vibe + s.lyrical_depth) / 5;
}

export function hybridScore(scorecard: Scorecard, votesForSide: number, totalVotes: number): number {
  const aiAvg = aiAverage(scorecard);
  const votePct = totalVotes === 0 ? 50 : (votesForSide / totalVotes) * 100;
  return 0.5 * aiAvg + 0.5 * votePct;
}

// Tie → host wins (documented in DECISIONS.md).
export function pickWinner(
  hostCard: Scorecard,
  oppCard: Scorecard,
  hostVotes: number,
  oppVotes: number
): { winner: "host" | "opponent"; hostHybrid: number; oppHybrid: number } {
  const total = hostVotes + oppVotes;
  const h = hybridScore(hostCard, hostVotes, total);
  const o = hybridScore(oppCard, oppVotes, total);
  return { winner: o > h ? "opponent" : "host", hostHybrid: h, oppHybrid: o };
}
