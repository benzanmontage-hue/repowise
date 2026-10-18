"use client";

import type {
  PerformanceOpportunity,
  PerformanceOpportunityPlanStep,
} from "@repowise-dev/types/health";
import type { StepVerify } from "@repowise-dev/types/refactoring";

import { CommandLine } from "../../../shared/command-line";
import { LowerPriorityTag } from "../../lower-priority-tag";
import { PreviewBadge } from "../../preview-badge";
import type { PerformanceViewAdapter } from "../adapter";
import { planMatches, usePlan } from "../cache";
import { fixStrategyLabel, planPresentation } from "../presentation";
import { Section } from "./layout";

/**
 * Fetch the stored plan and decide whether it names this exact opportunity.
 * A reindexed or reused row must never be handed over as this one's fix, so
 * both the link and the agent handoff wait on the same verdict.
 */
export function useVerifiedPlan(
  opportunity: PerformanceOpportunity | null,
  adapter: PerformanceViewAdapter,
  enabled: boolean,
) {
  const planId =
    opportunity && planPresentation(opportunity).actionable ? opportunity.plan_id : null;
  const { data, error, isLoading } = usePlan(adapter, enabled ? planId : null);
  const matches = Boolean(opportunity && planMatches(data, opportunity));
  return { planId, data, error, isLoading, matches };
}

/**
 * The plan's edits in order; only the rarer mechanical ones are marked.
 *
 * Consecutive steps that make the same edit at different call sites read as
 * one step with its locations: the server emits one step per site, and eight
 * copies of "Collect the keys before the loop" said nothing seven times.
 */
function PlanSteps({ steps }: { steps: PerformanceOpportunityPlanStep[] }) {
  const groups: PerformanceOpportunityPlanStep[][] = [];
  for (const step of [...steps].sort((a, b) => a.order - b.order)) {
    const last = groups[groups.length - 1];
    if (last && last[0]!.action === step.action && last[0]!.applicability === step.applicability) {
      last.push(step);
    } else {
      groups.push([step]);
    }
  }
  const where = (step: PerformanceOpportunityPlanStep) =>
    step.file_path ? `${step.file_path}${step.line ? `:${step.line}` : ""}` : null;
  return (
    <ol className="mt-3 space-y-1.5">
      {groups.map((group, index) => {
        const first = group[0]!;
        const places = group
          .map((step) => ({ place: where(step), verify: step.verify }))
          .filter((p): p is { place: string; verify: StepVerify | undefined } =>
            Boolean(p.place),
          );
        return (
          <li key={first.order} className="text-sm text-[var(--color-text-secondary)]">
            <span className="tabular-nums text-[var(--color-text-tertiary)]">{index + 1}.</span>{" "}
            {first.action}
            {group.length > 1 ? (
              <span className="ml-1.5 text-xs text-[var(--color-text-tertiary)]">
                {`at ${group.length} call sites`}
              </span>
            ) : null}
            {first.applicability === "mechanical" ? (
              <span className="ml-1.5 text-xs text-[var(--color-text-tertiary)]">mechanical</span>
            ) : null}
            {places.length === 1 ? (
              <>
                <span className="ml-1.5 break-all font-mono text-xs text-[var(--color-text-tertiary)]">
                  {places[0]!.place}
                </span>
                <StepCheck verify={places[0]!.verify} />
              </>
            ) : places.length > 1 ? (
              <ul className="mt-1 space-y-0.5 pl-5">
                {places.map((p) => (
                  <li key={p.place} className="break-all font-mono text-xs text-[var(--color-text-tertiary)]">
                    {p.place}
                    <StepCheck verify={p.verify} />
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * How to check one step, when it differs from the plan: the server omits
 * `verify` on a step the plan's validation already checks.
 */
function StepCheck({ verify }: { verify: StepVerify | undefined }) {
  if (!verify) return null;
  if (verify.coverage === "none") {
    return (
      <p className="mt-1 font-sans text-xs text-[var(--color-text-tertiary)]">
        No test reaches this step.
      </p>
    );
  }
  return (
    <>
      {verify.commands.map((command) => (
        <CommandLine key={command} command={command} />
      ))}
    </>
  );
}

export function PlanSection({
  opportunity,
  adapter,
  enabled,
  plan,
}: {
  opportunity: PerformanceOpportunity;
  adapter: PerformanceViewAdapter;
  enabled: boolean;
  plan: ReturnType<typeof useVerifiedPlan>;
}) {
  const presentation = planPresentation(opportunity);
  const { planId, data, error, isLoading, matches } = plan;
  const href =
    planId && matches
      ? adapter.refactoringPlanHref?.(planId, opportunity.opportunity_id)
      : undefined;
  const steps = opportunity.plan_steps;

  return (
    <Section title="Plan">
      <p className="text-sm font-medium text-[var(--color-text-primary)]">{presentation.label}</p>
      {opportunity.lower_priority ? (
        <p className="mt-1">
          <LowerPriorityTag reason={opportunity.lower_priority} />
        </p>
      ) : null}
      {opportunity.preview ? (
        <p className="mt-1">
          <PreviewBadge note={opportunity.preview} />
        </p>
      ) : null}
      <p className="mt-1 text-sm text-[var(--color-text-tertiary)]">{presentation.detail}</p>
      {opportunity.fix ? (
        <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
          Proposed intervention: {fixStrategyLabel(opportunity.fix.strategy).toLowerCase()}
          {opportunity.fix.api ? (
            <>
              {" "}
              (<code className="font-mono text-xs">{opportunity.fix.api}</code>)
            </>
          ) : null}
          . {opportunity.fix.rationale}
        </p>
      ) : null}
      {steps && steps.length > 0 ? <PlanSteps steps={steps} /> : null}
      {planId && !enabled ? (
        <p className="mt-2 text-xs text-[var(--color-text-tertiary)]">
          This host cannot open the stored plan. Its id is{" "}
          <span className="break-all font-mono">{planId}</span>.
        </p>
      ) : null}
      {planId && enabled && isLoading ? (
        <p className="mt-2 text-xs text-[var(--color-text-tertiary)]">Checking the stored plan.</p>
      ) : null}
      {planId && enabled && error ? (
        <p className="mt-2 text-xs text-[var(--color-text-tertiary)]">
          The stored plan could not be loaded, so it is not offered here.
        </p>
      ) : null}
      {data && !matches ? (
        <p className="mt-2 text-sm text-[var(--color-warning)]">
          The stored plan no longer names this opportunity. Update the index before handing it to
          an agent.
        </p>
      ) : null}
      {href ? (
        <a
          href={href}
          className="mt-2 inline-block rounded text-sm font-medium text-[var(--color-accent-primary)] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-primary)]"
        >
          Open the plan on Refactoring
        </a>
      ) : null}
    </Section>
  );
}
