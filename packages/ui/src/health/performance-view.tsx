"use client";

import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import type { PerformanceOpportunity } from "@repowise-dev/types/health";

import { ActiveFilterChips, type ActiveFilterChip } from "../shared/more-filters";
import { PaginationControls } from "../shared/pagination-controls";
import { useAiPromptAction } from "./ai-prompt-action";
import { ActionabilityBar } from "./performance/actionability-bar";
import type { PerformanceViewAdapter } from "./performance/adapter";
import { AREA_PREVIEW, AreaGroups, areaLabel } from "./performance/area-groups";
import { useOpportunityDetail, usePrefetchDetail } from "./performance/cache";
import { ContextTabs, NarrowingFilters, narrowingChipLabel, SortControl } from "./performance/filters";
import {
  actionabilityCounts,
  areaGroups,
  excludedReviews,
  visibleItems,
  type ExcludedReview,
} from "./performance/grouping";
import { LegacyPerformanceFindings } from "./performance/legacy";
import { ACTIONABILITY_LABEL, contextLabel } from "./performance/presentation";
import { usePerformancePrompts } from "./performance/prompts";
import {
  clearNarrowing,
  INITIAL_FILTERS,
  NARROWING_KEYS,
  narrowingCount,
  PAGE_SIZE,
  readFilters,
  withFilter,
  withFilters,
  writeFilters,
  type PerformanceFilterState,
} from "./performance/query";
import { QUIET_LINK_CLS, type RowCallbacks } from "./performance/queue";
import {
  FilteredEmpty,
  GoodState,
  IgnoredArgumentsNotice,
  LeftOut,
  LinkedCauseUnavailable,
  QueueError,
  QueueSkeleton,
  StaleModelNotice,
  UnavailableQueue,
} from "./performance/states";
import { usePerformanceFilters } from "./performance/use-filters";
import { usePerformanceQueue } from "./performance/use-queue";
import { PerformanceVerdict, verdictOf } from "./performance/verdict";

/**
 * The Performance tab: how many changes are worth making now, where they sit,
 * and a prompt for an agent to make each one.
 *
 * Composition and state only. Ranking, eligibility, facets and plan linkage
 * are the server's; grouping by area and the actionability split are pure
 * derivations over the loaded result (`performance/grouping`).
 */

export type { PerformanceViewAdapter, PerformanceFilterState };
export { readFilters as readPerformanceFilters, writeFilters as writePerformanceFilters };

const OpportunityDrawer = lazy(() => import("./performance/drawer"));

export function PerformanceView({
  adapter,
  initialFilters,
  onFiltersChange,
  openOpportunityId,
  onOpenOpportunityChange,
}: {
  adapter: PerformanceViewAdapter;
  /** The tab's URL parameters (or a pre-flat `perf` blob), so a shared link opens the same view. */
  initialFilters?: string | undefined;
  /** Called on every change with the flat parameters and the state they encode. */
  onFiltersChange?: ((search: string, state: PerformanceFilterState) => void) | undefined;
  /**
   * A cause to open on arrival, by its stable id. A link from the map or the
   * file drawer names one, and it need not be on the loaded page, so it is
   * resolved by id rather than looked for in the queue.
   */
  openOpportunityId?: string | null;
  /** Called with the open cause's id, or null when the drawer closes. */
  onOpenOpportunityChange?: ((opportunityId: string | null) => void) | undefined;
}) {
  const { filters, current, apply } = usePerformanceFilters(initialFilters, onFiltersChange);

  const { data, error, isLoading, mutate, capabilities, supported } = usePerformanceQueue(
    adapter,
    filters,
  );

  // The open cause. A click holds the row so the drawer paints at once; a
  // link or a sibling names an id, resolved through the same detail key.
  const [selected, setSelected] = useState<PerformanceOpportunity | null>(null);
  const [internalOpenId, setInternalOpenId] = useState<string | null>(null);
  const select = useCallback(
    (next: PerformanceOpportunity | null) => {
      setSelected(next);
      setInternalOpenId(null);
      onOpenOpportunityChange?.(next?.opportunity_id ?? null);
    },
    [onOpenOpportunityChange],
  );
  const openById = useCallback(
    (opportunityId: string) => {
      setInternalOpenId(opportunityId);
      onOpenOpportunityChange?.(opportunityId);
    },
    [onOpenOpportunityChange],
  );
  const effectiveOpenId = openOpportunityId ?? internalOpenId;
  const pendingId =
    effectiveOpenId && effectiveOpenId !== selected?.opportunity_id ? effectiveOpenId : null;
  const { data: linked, error: linkError } = useOpportunityDetail(
    adapter,
    capabilities.detailById ? pendingId : null,
  );
  useEffect(() => {
    // An id from a retired model resolves to a state, not a cause; opening a
    // drawer on it would render an empty panel.
    if (linked?.found) setSelected(linked);
  }, [linked]);

  const { openPrompt, promptModal } = useAiPromptAction();
  const prompts = usePerformancePrompts(adapter);
  const prefetch = usePrefetchDetail(adapter);
  const detailById = capabilities.detailById;
  const callbacks: RowCallbacks = useMemo(
    () => ({
      onInspect: select,
      onPrompt: (opportunity) => openPrompt(prompts.forOpportunity(opportunity)),
      onPrefetch: (id) => {
        if (detailById) prefetch(id);
      },
    }),
    [select, openPrompt, prompts, prefetch, detailById],
  );
  // Areas group the loaded page; a prompt says so when the queue runs past it.
  const paged = data ? data.total > data.items.length : false;
  const onAreaPrompt = useCallback(
    (area: string, rows: PerformanceOpportunity[]) => openPrompt(prompts.forArea(area, rows, paged)),
    [openPrompt, prompts, paged],
  );
  const onOpenArea = useCallback(
    (area: string) => apply(withFilter(current.current, "area", area)),
    [apply],
  );

  const items = useMemo(() => data?.items ?? [], [data]);
  const counts = useMemo(() => actionabilityCounts(items), [items]);
  const allGroups = useMemo(() => areaGroups(items), [items]);
  // An open area lists every cause in it, grouped by its own sub-areas.
  const groups = useMemo(
    () => areaGroups(visibleItems(items, filters.state, filters.area)),
    [items, filters.state, filters.area],
  );
  const focused = filters.area !== null;

  if (!supported) return <LegacyPerformanceFindings adapter={adapter} />;
  if (error && [404, 405].includes(Number((error as { status?: number }).status))) {
    return <LegacyPerformanceFindings adapter={adapter} />;
  }
  if (error) return <QueueError onRetry={() => void mutate()} />;
  if (isLoading && !data) return <QueueSkeleton />;
  if (!data) return null;

  const { summary, facets } = data;
  if (summary.status === "unavailable") return <UnavailableQueue summary={summary} />;

  // A server that predates context scoping sends no repository_total.
  const repositoryTotal = summary.repository_total ?? summary.total;
  const isDefaultQueue =
    filters.context === INITIAL_FILTERS.context && narrowingCount(filters) === 0;
  // The left-out counts describe the default queue, so only it offers them.
  const reviews = isDefaultQueue ? excludedReviews(summary.default_queue?.excluded) : [];
  const onReview = (review: ExcludedReview) => apply(withFilters(filters, review.patch));
  const scope =
    filters.context === "all" ? "all code" : `${contextLabel(filters.context).toLowerCase()} code`;

  const chips: ActiveFilterChip[] = [
    ...NARROWING_KEYS.flatMap((key) => {
      const value = filters[key];
      return value
        ? [
            {
              key,
              label: narrowingChipLabel(key, value),
              onRemove: () => apply(withFilter(filters, key, null)),
            },
          ]
        : [];
    }),
    ...(filters.state
      ? [
          {
            key: "state",
            label: `Showing: ${ACTIONABILITY_LABEL[filters.state]}`,
            onRemove: () => apply(withFilter(filters, "state", null)),
          },
        ]
      : []),
    ...(filters.area !== null
      ? [
          {
            key: "area",
            label: `Area: ${areaLabel(filters.area)}`,
            onRemove: () => apply(withFilter(filters, "area", null)),
          },
        ]
      : []),
  ];

  const selectedId = selected?.opportunity_id ?? null;

  return (
    <div className="space-y-8">
      {items.length > 0 ? (
        <PerformanceVerdict
          verdict={verdictOf(items, allGroups)}
          context={filters.context}
          analyzedCommit={summary.analyzed_commit}
          shown={items.length}
          total={data.total}
          repositoryTotal={repositoryTotal}
        />
      ) : null}

      <section aria-label="Performance causes" className="space-y-4">
        {summary.status === "stale_model" ? <StaleModelNotice summary={summary} /> : null}
        {data.ignored_arguments ? (
          <IgnoredArgumentsNotice ignored={data.ignored_arguments} />
        ) : null}

        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <ContextTabs
            value={filters.context}
            facets={facets}
            total={repositoryTotal}
            collapsed={!capabilities.canonicalContexts}
            onChange={(context) => apply(withFilter(filters, "context", context))}
          />
          <SortControl
            value={filters.sort}
            onChange={(sort) => apply(withFilter(filters, "sort", sort))}
          />
        </div>
        {capabilities.serverFacets ? (
          <NarrowingFilters
            filters={filters}
            facets={facets}
            onChange={(key, value) => apply(withFilter(filters, key, value as never))}
          />
        ) : null}
        <ActiveFilterChips chips={chips} onClearAll={() => apply(clearNarrowing(filters))} />

        {items.length > 0 ? (
          <ActionabilityBar
            paged={paged}
            counts={counts}
            value={filters.state}
            onChange={(state) => apply(withFilter(filters, "state", state))}
          />
        ) : null}

        {items.length === 0 ? (
          // A context with no causes is a clean context, not a failed filter.
          narrowingCount(filters) > 0 && repositoryTotal > 0 ? (
            <FilteredEmpty onClear={() => apply({ ...clearNarrowing(filters), context: "all" })} />
          ) : (
            <GoodState
              scope={scope}
              analyzedCommit={summary.analyzed_commit}
              repositoryTotal={repositoryTotal}
              reviews={reviews}
              onReview={onReview}
            />
          )
        ) : (
          <div className="space-y-3">
            {focused ? (
              <button
                type="button"
                onClick={() => apply(withFilter(filters, "area", null))}
                className={`${QUIET_LINK_CLS} text-xs`}
              >
                Back to all areas
              </button>
            ) : null}
            <AreaGroups
              groups={groups}
              adapter={adapter}
              selectedId={selectedId}
              callbacks={callbacks}
              onOpenArea={onOpenArea}
              onAreaPrompt={onAreaPrompt}
              preview={focused ? Number.POSITIVE_INFINITY : AREA_PREVIEW}
            />
          </div>
        )}

        {items.length > 0 ? <LeftOut reviews={reviews} onReview={onReview} /> : null}

        {data.total > PAGE_SIZE ? (
          <PaginationControls
            offset={(filters.page - 1) * PAGE_SIZE}
            shown={items.length}
            total={data.total}
            label="causes"
            onPrevious={
              filters.page > 1
                ? () => apply(withFilter(filters, "page", filters.page - 1))
                : undefined
            }
            onNext={
              data.next_offset != null
                ? () => apply(withFilter(filters, "page", filters.page + 1))
                : undefined
            }
          />
        ) : null}
      </section>

      {pendingId && (linkError || linked?.found === false) ? (
        <LinkedCauseUnavailable
          opportunityId={pendingId}
          detail={linked && !linked.found ? linked.detail : null}
          onDismiss={() => onOpenOpportunityChange?.(null)}
        />
      ) : null}

      {selected ? (
        <Suspense fallback={null}>
          <OpportunityDrawer
            opportunity={selected}
            adapter={adapter}
            detailEnabled={detailById}
            planEnabled={capabilities.planById}
            onClose={() => select(null)}
            onAgentPrompt={callbacks.onPrompt}
            onSelectById={openById}
          />
        </Suspense>
      ) : null}

      {promptModal}
    </div>
  );
}
