"use client";

import { useCallback, useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { useQueryState, useQueryStates } from "nuqs";
import { ApiError } from "@repowise-dev/ui/shared/api-error";
import { Skeleton } from "@repowise-dev/ui/ui/skeleton";
import {
  ALL_FILE_PAIRS,
  CouplingAreaView,
  CouplingExplorer,
  toCouplingFilters,
  type AreaPairRef,
  type CouplingAreaFilters,
} from "@repowise-dev/ui/coupling";
import { getCoupling, getCouplingAreas } from "@/lib/api/coupling";
import { getWorkspace } from "@/lib/api/workspace";
import { useRepo } from "@/lib/hooks/use-repo";
import { toFriendlyMessage } from "@repowise-dev/ui/lib/errors";
import { useTranslations } from "next-intl";
import { useAreaCouplingCopy } from "./use-area-coupling-copy";
import {
  couplingUrlParsers,
  filtersFromUrl,
  filtersToUrl,
  selectionFromUrl,
  selectionToUrl,
} from "./coupling-url";

/** The route's own ceiling. Asking beyond it is rejected, not clamped. */
const MAX_LIMIT = 1000;
const INITIAL_LIMIT = 200;

function LoadingRows() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-12" />
      ))}
    </div>
  );
}

/**
 * Self-fetching host for the change-coupling Architecture tab. It opens on
 * area pairs (`/coupling/areas`); choosing one fetches its file pairs
 * (`/coupling?area=&partner=`) into the existing explorer. Filters and the
 * open pair live in the URL; the shared package owns every pixel, so hosted
 * gets the same view from a package bump.
 */
export function CouplingTab({ repoId }: { repoId: string }) {
  const t = useTranslations("coupling");
  const copy = useAreaCouplingCopy();
  const [url, setUrl] = useQueryStates(couplingUrlParsers);
  const [focus, setFocus] = useQueryState("focus");
  const [limit, setLimit] = useState(INITIAL_LIMIT);
  const filters = filtersFromUrl(url);
  const selection = selectionFromUrl(url.pair);
  const wire = toCouplingFilters(filters);

  const areas = useSWR(
    ["coupling-areas", repoId, wire],
    () => getCouplingAreas(repoId, wire),
    { revalidateOnFocus: false, keepPreviousData: true },
  );
  // File pairs are placed at the depth the area list was grouped at, so the
  // pair a reader clicked holds exactly the files its row counted.
  const depth = areas.data?.depth;
  const pairQuery =
    selection && depth
      ? {
          ...wire,
          depth,
          limit,
          ...(selection === ALL_FILE_PAIRS
            ? {}
            : { area: selection.source, partner: selection.target }),
        }
      : null;
  const graph = useSWR(
    pairQuery ? ["coupling", repoId, pairQuery] : null,
    () => getCoupling(repoId, pairQuery!),
    // No previous data: a new pair must not render under the last pair's header.
    { revalidateOnFocus: false },
  );
  const { repo } = useRepo(repoId);
  const { data: workspace } = useSWR("workspace:info", () => getWorkspace(), {
    revalidateOnFocus: false,
  });

  const onFiltersChange = useCallback(
    (next: CouplingAreaFilters) => void setUrl(filtersToUrl(next)),
    [setUrl],
  );
  const onSelectionChange = useCallback(
    (next: AreaPairRef | typeof ALL_FILE_PAIRS | null) => {
      setLimit(INITIAL_LIMIT);
      void setFocus(null);
      void setUrl({ pair: selectionToUrl(next) });
    },
    [setUrl, setFocus],
  );

  if (areas.error) {
    return (
      <ApiError
        title={t("loadFailed")}
        message={toFriendlyMessage(areas.error)}
        onRetry={() => void areas.mutate()}
      />
    );
  }
  if (!areas.data) return <LoadingRows />;

  return (
    <CouplingAreaView
      data={areas.data}
      filters={filters}
      onFiltersChange={onFiltersChange}
      selection={selection}
      onSelectionChange={onSelectionChange}
      {...(repo?.name ? { repoName: repo.name } : {})}
      {...(workspace?.is_workspace ? { workspaceHref: "/workspace/co-changes" } : {})}
      LinkComponent={Link}
      copy={copy}
    >
      {graph.error ? (
        <ApiError
          title={t("loadFailed")}
          message={toFriendlyMessage(graph.error)}
          onRetry={() => void graph.mutate()}
        />
      ) : !graph.data ? (
        <LoadingRows />
      ) : (
        <CouplingExplorer
          key={url.pair ?? ""}
          data={graph.data}
          repoLinkPrefix={`/repos/${repoId}`}
          {...(repo?.name ? { repoName: repo.name } : {})}
          LinkComponent={Link}
          // Absent / bare `?focus=` → let the explorer open on the most-coupled hub.
          initialFocus={focus || undefined}
          onFocusChange={(value) => void setFocus(value)}
          {...(limit < MAX_LIMIT ? { onShowMore: () => setLimit(MAX_LIMIT) } : {})}
          loadingMore={graph.isValidating}
        />
      )}
    </CouplingAreaView>
  );
}
