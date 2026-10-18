"use client";

import * as React from "react";
import type { KnowledgeMatrix } from "@repowise-dev/types/owners";
import { Slider } from "../ui/slider";
import { personAt, type KnowledgePerson } from "./knowledge-files";
import { simulateOffboarding } from "./offboarding";
import { OffboardingResultView } from "./offboarding-result";
import { PeoplePicker } from "./people-picker";

export interface OffboardingScenario {
  leaving: string[];
  /** 0-1. */
  threshold: number;
}

export interface OffboardingViewProps {
  matrix: KnowledgeMatrix;
  scenario: OffboardingScenario;
  onScenarioChange: (next: OffboardingScenario) => void;
  /** One-click starting points, e.g. the people behind the truck factor. */
  suggestions?: { label: string; keys: string[] }[];
  base?: string | undefined;
  repoName?: string | undefined;
  LinkComponent?: React.ElementType | undefined;
}

/**
 * The off-boarding what-if: pick people, set how much of a file's history the
 * people who stay must hold, read what would be at risk. The scenario lives
 * with the host (the URL), so every view is a link.
 */
export function OffboardingView({
  matrix,
  scenario,
  onScenarioChange,
  suggestions = [],
  base,
  repoName,
  LinkComponent,
}: OffboardingViewProps) {
  const people = React.useMemo<KnowledgePerson[]>(
    () => matrix.authors.map((_, i) => personAt(matrix, i)),
    [matrix],
  );
  // The slider moves locally and commits on release, so a drag recomputes
  // and rewrites the URL once rather than on every step.
  const [draft, setDraft] = React.useState(Math.round(scenario.threshold * 100));
  React.useEffect(() => setDraft(Math.round(scenario.threshold * 100)), [scenario.threshold]);

  const result = React.useMemo(
    () => simulateOffboarding(matrix, scenario.leaving, scenario.threshold),
    [matrix, scenario.leaving, scenario.threshold],
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-[minmax(0,1fr)_260px]">
        <div className="flex min-w-0 flex-col gap-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--color-text-tertiary)]">
            If these people left
          </span>
          <PeoplePicker
            people={people}
            selected={scenario.leaving}
            onChange={(leaving) => onScenarioChange({ ...scenario, leaving })}
            label="People leaving"
          />
          {scenario.leaving.length === 0 && suggestions.length > 0 && (
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs text-[var(--color-text-tertiary)]">
              Try:
              {suggestions.map((s) => (
                <button
                  key={s.label}
                  type="button"
                  onClick={() => onScenarioChange({ ...scenario, leaving: s.keys })}
                  className="text-[var(--color-accent-primary)] hover:underline"
                >
                  {s.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <span
            id="offboarding-threshold"
            className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--color-text-tertiary)]"
          >
            At risk below {draft}% kept
          </span>
          <Slider
            aria-labelledby="offboarding-threshold"
            min={10}
            max={90}
            step={5}
            value={[draft]}
            onValueChange={([v]) => v != null && setDraft(v)}
            onValueCommit={([v]) => v != null && onScenarioChange({ ...scenario, threshold: v / 100 })}
          />
          <span className="text-xs leading-relaxed text-[var(--color-text-tertiary)]">
            A file is at risk when the people who stay made less than this share of its commits.
          </span>
        </div>
      </div>

      {scenario.leaving.length === 0 ? (
        <p className="max-w-[62ch] text-[15px] leading-relaxed text-[var(--color-text-secondary)]">
          Pick one or more people to see which files would lose most of the knowledge behind them, and who
          is best placed to take each directory over. Nothing is saved; the scenario lives in the page
          address, so you can share it.
        </p>
      ) : (
        <OffboardingResultView result={result} base={base} repoName={repoName} LinkComponent={LinkComponent} />
      )}
    </div>
  );
}
