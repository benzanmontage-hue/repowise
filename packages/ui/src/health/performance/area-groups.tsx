"use client";

import { memo, useState } from "react";
import { ChevronRight } from "lucide-react";
import type { PerformanceOpportunity } from "@repowise-dev/types/health";

import { bulkAgentPromptLabel } from "../ai-prompt-action";
import { AiPromptButton } from "../ai-prompt-button";
import type { PerformanceViewAdapter } from "./adapter";
import type { PerformanceAreaGroup } from "./grouping";
import { ACTIONABILITY_LABEL } from "./presentation";
import { OpportunityList, type RowCallbacks } from "./queue";

/**
 * The queue grouped by area: one card per directory, the area with the most
 * plan-ready causes first, each showing its leading causes and a way to the
 * rest. A card is an object here, since it can be opened, collapsed and
 * handed to an agent as a batch.
 */

/** Causes a card lists before "Show all". */
export const AREA_PREVIEW = 3;

export function areaLabel(area: string): string {
  return area || "Repository root";
}

function countsLine(group: PerformanceAreaGroup): string {
  const parts = (["plan_ready", "advisory", "investigate", "expected"] as const)
    .filter((state) => group.counts[state] > 0)
    .map((state) => `${group.counts[state].toLocaleString()} ${ACTIONABILITY_LABEL[state].toLowerCase()}`);
  return parts.join(" · ");
}

export function AreaGroups({
  groups,
  adapter,
  selectedId,
  callbacks,
  onOpenArea,
  onAreaPrompt,
  preview = AREA_PREVIEW,
}: {
  groups: PerformanceAreaGroup[];
  adapter: PerformanceViewAdapter;
  selectedId: string | null;
  callbacks: RowCallbacks;
  /** Open one area on its own, every cause listed. */
  onOpenArea: (area: string) => void;
  onAreaPrompt: (area: string, items: PerformanceOpportunity[]) => void;
  /** Causes each card lists before "Show all"; `Infinity` lists every one. */
  preview?: number;
}) {
  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <AreaCard
          key={group.area}
          group={group}
          adapter={adapter}
          selectedId={selectedId}
          callbacks={callbacks}
          onOpenArea={onOpenArea}
          onAreaPrompt={onAreaPrompt}
          preview={preview}
        />
      ))}
    </div>
  );
}

const AreaCard = memo(function AreaCard({
  group,
  adapter,
  selectedId,
  callbacks,
  onOpenArea,
  onAreaPrompt,
  preview,
}: {
  group: PerformanceAreaGroup;
  adapter: PerformanceViewAdapter;
  selectedId: string | null;
  callbacks: RowCallbacks;
  onOpenArea: (area: string) => void;
  onAreaPrompt: (area: string, items: PerformanceOpportunity[]) => void;
  preview: number;
}) {
  const [open, setOpen] = useState(true);
  const label = areaLabel(group.area);
  const shown = group.items.slice(0, preview);
  const rest = group.items.length - shown.length;
  return (
    <section
      aria-label={`${label}, ${group.items.length} causes`}
      className="rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-surface)]"
    >
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-2 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-primary)]"
        >
          <ChevronRight
            aria-hidden="true"
            className={`h-4 w-4 shrink-0 text-[var(--color-text-tertiary)] transition-transform ${open ? "rotate-90" : ""}`}
          />
          <span className="min-w-0 font-mono text-sm font-semibold text-[var(--color-text-primary)] [overflow-wrap:anywhere]">
            {label}
          </span>
          <span className="shrink-0 text-xs tabular-nums text-[var(--color-text-tertiary)]">
            {countsLine(group)}
          </span>
        </button>
        <AiPromptButton
          label={bulkAgentPromptLabel(group.items.length)}
          onClick={() => onAreaPrompt(group.area, group.items)}
        />
      </header>
      {open ? (
        <div className="px-3 pb-3">
          <OpportunityList
            items={shown}
            adapter={adapter}
            selectedId={selectedId}
            callbacks={callbacks}
            label={`Causes in ${label}`}
          />
          {rest > 0 ? (
            <button
              type="button"
              onClick={() => onOpenArea(group.area)}
              className="mt-2 rounded px-1 text-xs font-medium text-[var(--color-accent-primary)] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-primary)]"
            >
              Show all {group.items.length.toLocaleString()} in {label}
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
});
