"use client";

import type {
  PerformanceContextFilter,
  PerformanceExecutionContext,
  PerformanceFacetCount,
  PerformanceFacetKey,
  PerformanceFacets,
} from "@repowise-dev/types/health";

import { useState } from "react";
import { ChevronRight, X } from "lucide-react";

import { FilterSelect } from "../code-health-controls";
import { ViewTabs } from "../../shared/view-tabs";
import {
  CONTEXT_ORDER,
  FACET_LABEL,
  contextLabel,
  facetValueLabel,
} from "./presentation";
import {
  type NarrowingKey,
  type PerformanceFilterState,
  type PerformanceSort,
} from "./query";

/**
 * The filter surface. Every option and every count comes from the server's
 * facets, which are counted over the base result, so choosing a value never
 * removes its own alternatives from the list.
 */

function countOf(counts: PerformanceFacetCount[] | undefined, value: string): number {
  return counts?.find((entry) => entry.value === value)?.total ?? 0;
}

/**
 * The four canonical contexts stay separate and always visible, because a
 * context with no rows is a fact about the repository worth reading. When the
 * server predates the vocabulary they collapse to the pairing it understands.
 */
export function ContextTabs({
  value,
  facets,
  total,
  collapsed,
  onChange,
}: {
  value: PerformanceContextFilter;
  facets: PerformanceFacets;
  total: number;
  collapsed: boolean;
  onChange: (context: PerformanceContextFilter) => void;
}) {
  const counts = facets.context;
  const contexts: PerformanceExecutionContext[] = collapsed
    ? ["production", "test"]
    : CONTEXT_ORDER;
  // `total` is the unscoped repository_total; `counts` is facets.context,
  // which the server has already narrowed by every other active filter.
  // Badge "All" with the sum of the (narrowed) context facet so it agrees
  // with what clicking it actually returns. Fall back to `total` only when
  // the server sends no facets.context at all (a server predating context
  // scoping, which also won't send a narrowed repository_total).
  const scopedTotal = counts?.reduce((sum, entry) => sum + entry.total, 0) ?? total;
  const tabs = [
    { id: "all", label: "All", badge: scopedTotal },
    ...contexts.map((context) => ({
      id: context,
      label:
        collapsed && context === "production" ? "Production & tooling" : contextLabel(context),
      badge:
        collapsed && context === "production"
          ? countOf(counts, "production") + countOf(counts, "tooling")
          : countOf(counts, context),
    })),
  ];
  return (
    <ViewTabs
      tabs={tabs}
      value={value}
      onValueChange={(next) => onChange(next as PerformanceContextFilter)}
    />
  );
}

interface NarrowingSpec {
  key: Exclude<NarrowingKey, "actionability">;
  facet: PerformanceFacetKey;
  anyLabel: string;
}

/**
 * The server filters behind "More filters". Actionability is not among them:
 * the actionability bar is that axis's one control.
 */
const NARROWING: NarrowingSpec[] = [
  { key: "boundary", facet: "boundary", anyLabel: "Any" },
  { key: "confidence", facet: "confidence", anyLabel: "Any" },
  // Unproven causes (loop size unknown) are counted but never queued by default.
  { key: "proof", facet: "proof", anyLabel: "Measured only" },
  // Startup, CLI, tooling and test loops run once per process, so the default
  // leaves them out; each role stays one selection away.
  { key: "role", facet: "role", anyLabel: "Served paths" },
];

/**
 * A facet with one value is a fact, not a choice, so it is stated rather than
 * offered as a control that could only ever return the same rows.
 */
function SingleValueFact({ facet, only }: { facet: PerformanceFacetKey; only: PerformanceFacetCount }) {
  return (
    <p className="text-xs text-[var(--color-text-tertiary)]">
      <span className="uppercase tracking-wider">{FACET_LABEL[facet]}</span>{" "}
      <span className="text-[var(--color-text-secondary)]">
        {facetValueLabel(facet, only.value)}
      </span>{" "}
      <span className="tabular-nums">on {only.total.toLocaleString()} matching</span>
    </p>
  );
}

/**
 * Context and sort stay visible; the rest of the server filters sit behind
 * one disclosure, which states how many are active while it is closed.
 */
export function MoreFilters({
  filters,
  facets,
  onChange,
}: {
  filters: PerformanceFilterState;
  facets: PerformanceFacets;
  onChange: (key: NarrowingKey, value: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const active = NARROWING.filter(({ key }) => filters[key] !== null).length;
  const controls = NARROWING.map(({ key, facet, anyLabel }) => {
    const counts = facets[facet] ?? [];
    if (counts.length === 0) return null;
    if (counts.length === 1 && !filters[key]) {
      return <SingleValueFact key={key} facet={facet} only={counts[0]!} />;
    }
    return (
      <FilterSelect
        key={key}
        label={FACET_LABEL[facet]}
        value={filters[key] ?? ""}
        onChange={(next) => onChange(key, next || null)}
        options={[
          { value: "", label: anyLabel },
          ...counts.map((entry) => ({
            value: entry.value,
            label: `${facetValueLabel(facet, entry.value)} (${entry.total.toLocaleString()})`,
          })),
        ]}
      />
    );
  }).filter(Boolean);
  if (controls.length === 0) return null;
  return (
    <div className="min-w-0">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="inline-flex items-center gap-1 rounded text-xs font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-primary)]"
      >
        <ChevronRight
          aria-hidden="true"
          className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-90" : ""}`}
        />
        More filters
        {active > 0 ? <span className="tabular-nums text-[var(--color-text-tertiary)]">({active})</span> : null}
      </button>
      {open ? <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-3">{controls}</div> : null}
    </div>
  );
}

export interface ActiveChip {
  key: string;
  label: string;
  onRemove: () => void;
}

/** Every active narrowing, server or view, as a chip that removes it. */
export function ActiveChips({ chips, onClearAll }: { chips: ActiveChip[]; onClearAll: () => void }) {
  if (chips.length === 0) return null;
  return (
    <ul aria-label="Active filters" className="flex flex-wrap items-center gap-2">
      {chips.map((chip) => (
        <li key={chip.key}>
          <button
            type="button"
            onClick={chip.onRemove}
            aria-label={`Remove filter ${chip.label}`}
            className="inline-flex items-center gap-1 rounded-full border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] px-2.5 py-0.5 text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-primary)]"
          >
            {chip.label}
            <X aria-hidden="true" className="h-3 w-3" />
          </button>
        </li>
      ))}
      {chips.length > 1 ? (
        <li>
          <button
            type="button"
            onClick={onClearAll}
            className="rounded text-xs font-medium text-[var(--color-accent-primary)] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-primary)]"
          >
            Clear all
          </button>
        </li>
      ) : null}
    </ul>
  );
}

/** The chip label for one active narrowing, "Boundary: Database". */
export function narrowingChipLabel(key: NarrowingKey, value: string): string {
  return `${FACET_LABEL[key]}: ${facetValueLabel(key, value)}`;
}

const SORT_OPTIONS: { value: PerformanceSort; label: string }[] = [
  { value: "rank", label: "Rank" },
  { value: "leverage", label: "Call sites" },
  { value: "observations", label: "Observations" },
];

/** How the queue is ordered. A separate axis from the narrowing filters, so
 * it gets its own control rather than sharing theirs. */
export function SortControl({
  value,
  onChange,
}: {
  value: PerformanceSort;
  onChange: (value: PerformanceSort) => void;
}) {
  return (
    <FilterSelect
      label="Sort"
      value={value}
      onChange={(next) => onChange(next as PerformanceSort)}
      options={SORT_OPTIONS}
    />
  );
}
