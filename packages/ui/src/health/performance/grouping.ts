import type {
  PerformanceActionabilityState,
  PerformanceOpportunity,
  PerformanceQueueExclusion,
} from "@repowise-dev/types/health";

import { groupByArea, inArea, separatingDepth } from "../../lib/areas";
import type { PerformanceFilterState } from "./query";

/**
 * Pure derivations over the loaded result: the actionability split, the area
 * groups, and the "left out" review links. Nothing here re-ranks a cause; the
 * server's order survives inside every group.
 */

export type ActionabilityCounts = Record<PerformanceActionabilityState, number>;

export function actionabilityCounts(items: readonly PerformanceOpportunity[]): ActionabilityCounts {
  const counts: ActionabilityCounts = { plan_ready: 0, advisory: 0, investigate: 0, expected: 0 };
  for (const item of items) counts[item.actionability_state] += 1;
  return counts;
}

/** Plan ready and advisory: a named change exists, proven safe or not. */
export function actionableCount(counts: ActionabilityCounts): number {
  return counts.plan_ready + counts.advisory;
}

export interface PerformanceAreaGroup {
  area: string;
  items: PerformanceOpportunity[];
  counts: ActionabilityCounts;
}

/**
 * Causes grouped by the area of the file the edit goes in, at the depth where
 * the result's files first separate. Groups rank by plan-ready causes, then
 * advisory, then size, then the best rank inside them, so the area worth
 * opening first leads.
 */
export function areaGroups(items: readonly PerformanceOpportunity[]): PerformanceAreaGroup[] {
  const depth = separatingDepth(items.map((item) => item.file_path));
  return groupByArea(items, (item) => item.file_path, depth)
    .map((group) => ({ ...group, counts: actionabilityCounts(group.items) }))
    .sort(
      (a, b) =>
        b.counts.plan_ready - a.counts.plan_ready ||
        b.counts.advisory - a.counts.advisory ||
        b.items.length - a.items.length ||
        a.items[0]!.rank_position - b.items[0]!.rank_position,
    );
}

/**
 * The loaded result narrowed by the view filters: one actionability state,
 * and one area at any depth (an area named by another view, such as the map,
 * need not be one this result groups by).
 */
export function visibleItems(
  items: readonly PerformanceOpportunity[],
  state: PerformanceActionabilityState | null,
  area: string | null = null,
): PerformanceOpportunity[] {
  return items.filter(
    (item) =>
      (!state || item.actionability_state === state) &&
      (area === null || inArea(item.file_path, area)),
  );
}

export interface ExcludedReview {
  reason: PerformanceQueueExclusion;
  count: number;
  label: string;
  /** The server filters that list these causes. */
  patch: Partial<PerformanceFilterState>;
}

const REVIEWS: Record<
  PerformanceQueueExclusion,
  { label: string; patch: Partial<PerformanceFilterState> }
> = {
  unmeasured_cost: { label: "loop size unknown", patch: { proof: "unproven" } },
  background_unproven: {
    label: "scheduled, growth not shown",
    patch: { proof: "background_unproven" },
  },
  no_strategy: { label: "need investigation", patch: { actionability: "investigate" } },
  expected: { label: "expected repetition", patch: { actionability: "expected" } },
  gated_off: { label: "switched off by a flag", patch: { actionability: "expected" } },
  cold_path: { label: "run rarely", patch: { actionability: "expected" } },
  cold_role: { label: "startup, CLI or UI only", patch: { role: "all" } },
  test: { label: "in tests", patch: { context: "test" } },
  tooling: { label: "in tooling", patch: { context: "tooling" } },
  unknown: { label: "unclassified", patch: { context: "unknown" } },
};

/**
 * What the default queue left out, largest first, each with the filters that
 * list it. Zero counts are dropped: a reason with nothing behind it is not a
 * place worth sending anybody.
 */
export function excludedReviews(
  excluded: Partial<Record<PerformanceQueueExclusion, number>> | undefined,
): ExcludedReview[] {
  if (!excluded) return [];
  return (Object.entries(excluded) as [PerformanceQueueExclusion, number][])
    .filter(([reason, count]) => count > 0 && reason in REVIEWS)
    .map(([reason, count]) => ({ reason, count, ...REVIEWS[reason] }))
    .sort((a, b) => b.count - a.count);
}
