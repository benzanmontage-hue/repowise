"use client";

import * as React from "react";
import { Users, Search } from "lucide-react";
import type { OwnerListEntry } from "@repowise-dev/types/owners";
import { Input } from "../ui/input";
import { Skeleton } from "../ui/skeleton";
import { Switch } from "../ui/switch";
import { EmptyState } from "../shared/empty-state";
import { ResultsFooter } from "../shared/results-footer";
import { OverviewSection } from "../overview/section";
import { OwnerTable, type OwnerSortKey } from "./owner-table";

export type { OwnerSortKey };

export interface OwnerDirectoryFilters {
  q: string;
  sort: OwnerSortKey;
  /** List bots and coding agents beside people. Off by default. */
  includeAutomation: boolean;
}

export interface OwnerDirectoryProps {
  owners: OwnerListEntry[];
  isLoading: boolean;
  isValidating: boolean;
  total: number;
  hasMore: boolean;
  filters: OwnerDirectoryFilters;
  onFiltersChange: (next: OwnerDirectoryFilters) => void;
  onLoadMore: () => void;
  onSelect: (owner: OwnerListEntry) => void;
  /** Bot and agent identities in the index; the toggle shows only when there are some. */
  automationCount?: number;
  /** Preferred over `onSelect`: gives every row a real URL. */
  hrefFor?: (owner: OwnerListEntry) => string;
  LinkComponent?: React.ElementType | undefined;
  /** Rendered in place of the table when the list could not load. */
  error?: React.ReactNode;
}

/**
 * Everyone, as one aligned table, collapsed under the page's lede and tabs:
 * the table is disclosure, the lede is the reading. People only by default;
 * bots and coding agents are a toggle away.
 */
export function OwnerDirectory({
  owners,
  isLoading,
  isValidating,
  total,
  hasMore,
  filters,
  onFiltersChange,
  onLoadMore,
  onSelect,
  automationCount = 0,
  hrefFor,
  LinkComponent,
  error,
}: OwnerDirectoryProps) {
  const noun = filters.includeAutomation
    ? total === 1 ? "contributor" : "contributors"
    : total === 1 ? "person" : "people";
  return (
    <OverviewSection
      title="All contributors"
      description="A dot marks sole-owned files held by someone who has stopped committing, so a clean column means nothing to chase."
      collapsible
      // Collapsed by default: the table is disclosure. A link that carries a
      // search or the automation toggle opens on the result it asked for.
      defaultOpen={filters.q !== "" || filters.includeAutomation}
      hint={
        <span className="font-mono uppercase tracking-[0.12em]">
          {total.toLocaleString()} {noun}
        </span>
      }
    >
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-[var(--color-text-tertiary)]" />
          <Input
            value={filters.q}
            onChange={(e) => onFiltersChange({ ...filters, q: e.target.value })}
            placeholder="Filter by name or email…"
            aria-label="Filter contributors by name or email"
            className="pl-8"
          />
        </div>
        {automationCount > 0 && (
          <label className="flex items-center gap-2 text-xs text-[var(--color-text-secondary)]">
            <Switch
              checked={filters.includeAutomation}
              onCheckedChange={(includeAutomation) => onFiltersChange({ ...filters, includeAutomation })}
            />
            Show {automationCount.toLocaleString()} bot and agent{" "}
            {automationCount === 1 ? "identity" : "identities"}
          </label>
        )}
      </div>

      {error ? (
        error
      ) : isLoading && owners.length === 0 ? (
        <div className="flex flex-col gap-px">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-[54px] w-full" />
          ))}
        </div>
      ) : owners.length === 0 ? (
        filters.q ? (
          <EmptyState
            tone="filtered"
            title="No contributors match this search"
            action={{ label: "Clear search", onClick: () => onFiltersChange({ ...filters, q: "" }) }}
          />
        ) : (
          <EmptyState
            icon={<Users />}
            title="No contributors yet"
            description="Contributors land with the first git index."
          />
        )
      ) : (
        <OwnerTable
          owners={owners}
          sort={filters.sort}
          onSortChange={(sort) => onFiltersChange({ ...filters, sort })}
          hrefFor={hrefFor}
          onSelect={hrefFor ? undefined : onSelect}
          LinkComponent={LinkComponent}
        />
      )}

      <ResultsFooter
        shown={owners.length}
        total={total}
        hasMore={hasMore}
        loading={isValidating && !isLoading}
        onLoadMore={onLoadMore}
        noun="contributor"
      />
    </OverviewSection>
  );
}
