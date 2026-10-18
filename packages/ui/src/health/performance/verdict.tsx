"use client";

import type {
  PerformanceContextFilter,
  PerformanceExecutionContext,
  PerformanceOpportunity,
} from "@repowise-dev/types/health";

import { PageLede } from "../../shared/page-lede";
import { actionabilityCounts, actionableCount, type PerformanceAreaGroup } from "./grouping";
import { areaLabel } from "./area-groups";
import { contextLabel } from "./presentation";

/**
 * The lede: how many changes are worth making now and where they sit, then
 * the scope that number was counted over. The method notes live behind the
 * label's info tip; the page opens on the answer.
 */

export interface Verdict {
  value: number;
  unit: string;
  sentence: string;
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** The figure and its reading, from the loaded result and its area groups. */
export function verdictOf(
  items: readonly PerformanceOpportunity[],
  groups: readonly PerformanceAreaGroup[],
): Verdict {
  const actionable = actionableCount(actionabilityCounts(items));
  if (actionable === 0) {
    return {
      value: items.length,
      unit: plural(items.length, "cause to review", "causes to review"),
      sentence:
        "None has a named fix yet. Read the evidence before changing anything; the cause may be bounded or intended.",
    };
  }
  const areas = groups.filter((group) => actionableCount(group.counts) > 0);
  const lead = areaLabel(areas[0]!.area);
  return {
    value: actionable,
    unit: plural(actionable, "change worth making now", "changes worth making now"),
    sentence:
      areas.length === 1
        ? `All in ${lead}.`
        : `Concentrated in ${areas.length} areas, led by ${lead}.`,
  };
}

function scopeNoun(context: PerformanceContextFilter): string {
  return context === "all"
    ? "All code"
    : `${contextLabel(context as PerformanceExecutionContext)} code`;
}

export function PerformanceVerdict({
  verdict,
  context,
  analyzedCommit,
  shown,
  total,
  repositoryTotal,
}: {
  verdict: Verdict;
  context: PerformanceContextFilter;
  analyzedCommit: string | null | undefined;
  /** Causes loaded on this page. */
  shown: number;
  /** Causes the server result holds. */
  total: number;
  /** Causes analysed across the repository, in every context. */
  repositoryTotal: number;
}) {
  return (
    <PageLede
      label="Performance"
      labelHint="Static, high-precision signals read from the code's shape, not measured latency. Repeated call paths fold into one cause, one place to edit, so a row answers what to change once and every observation stays readable as evidence. Evidence confidence, actionability and fix safety are separate judgements."
      value={verdict.value.toLocaleString()}
      unit={verdict.unit}
    >
      <p>{verdict.sentence}</p>
      <p role="status" className="text-caption text-[var(--color-text-tertiary)]">
        {scopeNoun(context)}
        {analyzedCommit ? (
          <>
            {" "}
            at <span className="font-mono">{analyzedCommit.slice(0, 7)}</span>
          </>
        ) : null}
        . <span className="tabular-nums">{total.toLocaleString()}</span> of{" "}
        <span className="tabular-nums">{repositoryTotal.toLocaleString()}</span> analysed causes
        in this view
        {shown < total ? (
          <>
            , <span className="tabular-nums">{shown.toLocaleString()}</span> of them on this page
          </>
        ) : null}
        .
      </p>
    </PageLede>
  );
}
