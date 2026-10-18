/**
 * What a commit or a change did to code health, read from its finding counts.
 * Pure, so the list cell, the detail lede and the prompt all agree.
 */

export type HealthDeltaKind = "improved" | "worsened" | "mixed" | "neutral";

/** The counts every health delta carries. `improved` is null until stored
 *  deltas carry the analyzer's improved bucket. A server rollup may also send
 *  its own `kind`, which wins over the one read from the counts. */
export interface HealthDeltaCounts {
  introduced: number;
  worsened: number;
  resolved: number;
  improved?: number | null | undefined;
  kind?: HealthDeltaKind | undefined;
  /** `partial` when part of the change was not compared. */
  status?: string | undefined;
}

/** Findings the change made better: resolved, plus improved when known. */
export function betterCount(d: HealthDeltaCounts): number {
  return d.resolved + (d.improved ?? 0);
}

/** Findings the change made worse: new ones plus ones it made more severe. */
export function worseCount(d: HealthDeltaCounts): number {
  return d.introduced + d.worsened;
}

export function healthDeltaKind(d: HealthDeltaCounts): HealthDeltaKind {
  if (d.kind) return d.kind;
  const better = betterCount(d) > 0;
  const worse = worseCount(d) > 0;
  if (better && worse) return "mixed";
  if (better) return "improved";
  return worse ? "worsened" : "neutral";
}
