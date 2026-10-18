"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import useSWRInfinite from "swr/infinite";
import {
  OwnerDirectory,
  type OwnerDirectoryFilters,
} from "@repowise-dev/ui/owners/owner-directory";
import { ApiError } from "@repowise-dev/ui/shared/api-error";
import { useDebounce } from "@/lib/hooks/use-debounce";
import { listOwnersPage } from "@/lib/api/owners";
import type { OwnerListEntry, Paginated } from "@/lib/api/types";
import { directoryFiltersFromParams, writeDirectoryFilters } from "./use-contributors-url";

const LIMIT = 30;

/** The collapsed "All contributors" table: people only unless the reader asks for automation. */
export function AllContributors({ repoId, automationCount }: { repoId: string; automationCount: number }) {
  const t = useTranslations("views.contributors");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const searchParams = useSearchParams();
  const [filters, setFilters] = useState<OwnerDirectoryFilters>(() =>
    directoryFiltersFromParams(searchParams),
  );
  const debouncedQ = useDebounce(filters.q, 250);
  // The table's search, sort and toggle live in the URL, so a filtered view is a link.
  useEffect(() => {
    const next = writeDirectoryFilters(searchParams, { ...filters, q: debouncedQ });
    if (next !== searchParams.toString()) router.replace(next ? `?${next}` : "?", { scroll: false });
    // Only the debounced filters drive a write; reading searchParams must not loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQ, filters.sort, filters.includeAutomation]);
  const key = useMemo(
    () => JSON.stringify({ q: debouncedQ, sort: filters.sort, all: filters.includeAutomation }),
    [debouncedQ, filters.sort, filters.includeAutomation],
  );

  const { data, error, mutate, size, setSize, isLoading, isValidating } = useSWRInfinite<
    Paginated<OwnerListEntry>
  >(
    (pageIndex, previous) => {
      if (previous && !previous.has_more) return null;
      return `owners:${repoId}:${key}:${pageIndex}`;
    },
    (k) => {
      const pageIndex = parseInt(k.split(":").pop()!, 10);
      return listOwnersPage({
        repoId,
        q: debouncedQ || undefined,
        sort: filters.sort,
        ...(filters.includeAutomation ? {} : { kind: "human" as const }),
        limit: LIMIT,
        offset: pageIndex * LIMIT,
      });
    },
    { revalidateOnFocus: false, revalidateFirstPage: false },
  );

  const items = useMemo(() => (data ? data.flatMap((p) => p.items) : []), [data]);
  const hrefFor = (o: OwnerListEntry) => `/repos/${repoId}/owners/${encodeURIComponent(o.key)}`;

  return (
    <OwnerDirectory
      owners={items}
      isLoading={isLoading}
      isValidating={isValidating}
      total={data?.[0]?.total ?? 0}
      hasMore={data ? data[data.length - 1]!.has_more : false}
      filters={filters}
      onFiltersChange={setFilters}
      onLoadMore={() => setSize(size + 1)}
      automationCount={automationCount}
      hrefFor={hrefFor}
      LinkComponent={Link}
      error={
        error ? (
          <ApiError
            title={t("loadFailedTitle")}
            message={t("loadFailed")}
            retryLabel={tCommon("retry")}
            onRetry={() => void mutate()}
          />
        ) : undefined
      }
      onSelect={(o) => router.push(hrefFor(o))}
    />
  );
}
