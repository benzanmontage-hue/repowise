"use client";

import type { PerformanceActionabilityState } from "@repowise-dev/types/health";

import { ProportionBar } from "../../shared/proportion-bar";
import { Segmented, type SegmentOption } from "../../shared/segmented";
import type { ActionabilityCounts } from "./grouping";
import { ACTIONABILITY_HINT, ACTIONABILITY_LABEL } from "./presentation";

/**
 * The result's split by actionability, as one bar and the one control that
 * narrows by it. Counted from the loaded rows, so a segment's count is exactly
 * the rows choosing it shows.
 */

const STATES: PerformanceActionabilityState[] = ["plan_ready", "advisory", "investigate", "expected"];

/** Green where a fix is proven safe, amber where it is not, neutral otherwise. */
const STATE_COLOR: Record<PerformanceActionabilityState, string> = {
  plan_ready: "var(--color-success)",
  advisory: "var(--color-warning)",
  investigate: "var(--color-text-tertiary)",
  expected: "var(--color-border-default)",
};

type Choice = PerformanceActionabilityState | "all";

export function ActionabilityBar({
  counts,
  value,
  onChange,
  paged = false,
}: {
  counts: ActionabilityCounts;
  /** The result runs past this page, so the counts describe the page only. */
  paged?: boolean;
  value: PerformanceActionabilityState | null;
  onChange: (state: PerformanceActionabilityState | null) => void;
}) {
  const total = STATES.reduce((sum, state) => sum + counts[state], 0);
  // Expected causes are listed only when a review link asked for them; a
  // permanent zero segment for them would name a state nobody can reach here.
  const states = STATES.filter((state) => state !== "expected" || counts.expected > 0);
  const options: SegmentOption<Choice>[] = [
    { value: "all", label: "All", count: total.toLocaleString() },
    ...states.map((state) => ({
      value: state,
      label: ACTIONABILITY_LABEL[state],
      count: counts[state].toLocaleString(),
      hint: ACTIONABILITY_HINT[state],
      ...(counts[state] === 0 && value !== state
        ? { disabledReason: `No ${ACTIONABILITY_LABEL[state].toLowerCase()} causes in this view.` }
        : {}),
    })),
  ];
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <ProportionBar
        label="Causes by actionability"
        legend={false}
        sort={false}
        size="sm"
        segments={states.map((state) => ({
          key: state,
          label: ACTIONABILITY_LABEL[state],
          value: counts[state],
          color: STATE_COLOR[state],
        }))}
      />
      <Segmented
        label="Actionability"
        value={value ?? "all"}
        options={options}
        onChange={(next) => onChange(next === "all" ? null : next)}
      />
      {paged ? (
        <p className="text-xs text-[var(--color-text-tertiary)]">
          Counted over the causes on this page, as are the area counts below.
        </p>
      ) : null}
    </div>
  );
}
