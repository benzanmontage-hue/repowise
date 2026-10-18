"use client";

/**
 * The area map and its context rail, as one section of the Code Health page.
 *
 * With the areas API on the adapter, the hierarchy and its files load as the
 * reader zooms, and the rail reads the selection one level at a time: the
 * repository, an area, a file. A host without it hands in a flat feed, the
 * map derives the same hierarchy from it, and the rail falls back to the
 * ranked file list with the file drawer beside it.
 */

import { useCallback, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { Search } from "lucide-react";
import type { HealthMapFeed } from "@repowise-dev/types/health";

import { ApiError } from "../shared/api-error";
import { toFriendlyMessage } from "../lib/errors";
import { Skeleton } from "../ui/skeleton";
import { OverviewSection } from "../overview/section";
import { ROOT_AREA } from "../lib/areas";
import { CodeHealthMap, MapLegend, MapLensSwitcher, type CodeHealthMapFile, type CodeHealthOverlay, type MapScope } from "./code-health-map";
import { deriveAreaIndex } from "./map/areas";
import { resolveLens } from "./map/lens-registry";
import { useAreaSource, type AreaFetchers } from "./map/use-area-source";
import { MapFieldList } from "./map/inspector";
import { AreaRail } from "./area-rail/area-rail";
import { DEFAULT_AREA_RAIL_LABELS, type AreaRailLabels } from "./area-rail/labels";
import type { CodeHealthAdapter } from "./code-health-adapter";

/** Map height. The rail is height-matched so it never outgrows the field beside it. */
const MAP_HEIGHT = 720;
/** The breadcrumb above the map and the legend under it, so the rail ends with them. */
const CHROME_ROWS = 80;

/** Optional flat-feed controls, passed through to the map untouched. */
export type FlatMapExtras = Partial<
  Pick<
    Parameters<typeof CodeHealthMap>[0],
    "lenses" | "overlayLoading" | "scope" | "highlightPaths" | "onDrawMore" | "drawMoreStep" | "onIncludeHeldChange" | "onFindUndrawn" | "pending"
  >
>;

export interface AreaMapSectionProps {
  adapter: CodeHealthAdapter;
  overlay: CodeHealthOverlay;
  onOverlayChange?: ((overlay: CodeHealthOverlay) => void) | undefined;
  lenses?: CodeHealthOverlay[] | undefined;
  /** The flat feed, for a host without the areas API. */
  mapFeed?: HealthMapFeed | undefined;
  mapScope?: MapScope | undefined;
  mapError?: unknown;
  onRetryMap?: (() => void) | undefined;
  mapExtra: FlatMapExtras;
  overlayLoading: boolean;
  selected: string | null;
  setSelected: (path: string | null) => void;
  /** Selected area, owned by the host so it rides in the URL. Local otherwise. */
  area?: string | undefined;
  onAreaChange?: ((area: string) => void) | undefined;
  /** Per-file signals the host joins onto the loaded rows (e.g. churn). */
  fileExtras?: ReadonlyMap<string, Partial<CodeHealthMapFile>> | undefined;
  railLabels?: Partial<AreaRailLabels> | undefined;
  description: string;
}

/** The areas fetchers, stable across renders: most hosts rebuild the adapter every render. */
function useFetchers(adapter: CodeHealthAdapter): AreaFetchers | null {
  const ref = useRef(adapter);
  ref.current = adapter;
  const has = Boolean(adapter.getAreaTree && adapter.getAreaFiles && adapter.getAreaDetail);
  return useMemo(
    () =>
      has
        ? {
            getAreaTree: (root: string, depth: number) => ref.current.getAreaTree!(root, depth),
            getAreaFiles: (area: string) => ref.current.getAreaFiles!(area),
          }
        : null,
    [has],
  );
}

function SearchBox({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="relative">
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-text-tertiary)]"
      />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Find a file in the map…"
        aria-label="Find a file in the map"
        className="w-full rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] py-1.5 pl-7 pr-2 text-xs text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] hover:border-[var(--color-border-hover)] focus-visible:border-[var(--color-accent-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-primary)]"
      />
    </div>
  );
}

export function AreaMapSection(props: AreaMapSectionProps) {
  const { adapter, overlay, selected, setSelected, fileExtras } = props;
  const labels = useMemo(() => ({ ...DEFAULT_AREA_RAIL_LABELS, ...props.railLabels }), [props.railLabels]);
  const fetchers = useFetchers(adapter);
  const rawSource = useAreaSource(fetchers, adapter.cacheKey);
  const joinedFiles = useMemo(
    () =>
      fileExtras
        ? rawSource.files.map((f) => {
            const extra = fileExtras.get(f.file_path);
            return extra ? { ...f, ...extra } : f;
          })
        : rawSource.files,
    [rawSource.files, fileExtras],
  );
  const source = fetchers ? { ...rawSource, files: joinedFiles } : undefined;

  const [localArea, setLocalArea] = useState(ROOT_AREA);
  const area = props.area ?? localArea;
  const onAreaChange = props.onAreaChange;
  // A file belongs to the level it was opened from, so changing area drops it.
  // A host that owns the area drops it in the same URL write: a second write
  // clearing the file separately would race the first and undo it.
  const setArea = useCallback(
    (next: string) => {
      if (onAreaChange) onAreaChange(next);
      else {
        setLocalArea(next);
        setSelected(null);
      }
    },
    [onAreaChange, setSelected],
  );
  const [query, setQuery] = useState("");

  const flatFiles = props.mapFeed?.files as CodeHealthMapFile[] | undefined;
  const derived = useMemo(() => (fetchers || !flatFiles ? null : deriveAreaIndex(flatFiles)), [fetchers, flatFiles]);
  const index = source?.index ?? derived;
  const lens = useMemo(() => (index ? resolveLens(overlay, index) : undefined), [overlay, index]);
  const nameOf = useCallback(
    (p: string) => (area && p.startsWith(`${area}/`) ? p.slice(area.length + 1) : p),
    [area],
  );

  const failed = source ? source.error : !flatFiles && props.mapError;
  const waiting = source ? source.loading : !flatFiles;
  const map = failed ? (
    <div className="flex items-center justify-center" style={{ minHeight: MAP_HEIGHT }}>
      <ApiError
        title="Couldn't load the map"
        message={toFriendlyMessage(failed)}
        {...(source ? { onRetry: source.retry } : props.onRetryMap ? { onRetry: props.onRetryMap } : {})}
      />
    </div>
  ) : waiting ? (
    <Skeleton className="w-full rounded-xl" style={{ height: MAP_HEIGHT }} />
  ) : (
    <CodeHealthMap
      files={flatFiles ?? []}
      {...(source ? { source } : {})}
      area={area}
      onAreaChange={setArea}
      search={query}
      selectedPath={selected}
      onSelectFile={setSelected}
      minHeight={MAP_HEIGHT}
      overlay={overlay}
      {...(lens ? { lens } : {})}
      chrome="none"
      {...props.mapExtra}
    />
  );

  let rail: ReactNode;
  if (source && adapter.getAreaDetail && index) {
    rail = (
      <AreaRail
        cacheKey={adapter.cacheKey}
        getAreaDetail={(p) => adapter.getAreaDetail!(p)}
        area={area}
        index={index}
        nameOf={nameOf}
        labels={labels}
        selectedFile={selected}
        fileDetail={adapter.renderFileDrawer({ filePath: selected, onClose: () => setSelected(null), lens: overlay, inline: true })}
        onClearFile={() => setSelected(null)}
        onSelectArea={setArea}
        onSelectFile={setSelected}
        areaLinks={adapter.areaLinks ? (p) => adapter.areaLinks!(p) : undefined}
        onNavigate={(href) => adapter.navigate(href)}
      />
    );
  } else if (flatFiles) {
    rail = (
      <div className="min-h-0 flex-1 overflow-hidden border-t border-[var(--color-border-default)] pt-3">
        <MapFieldList
          files={flatFiles}
          overlay={overlay}
          selectedPath={selected}
          onSelectFile={setSelected}
          {...(props.mapScope ? { scope: props.mapScope } : {})}
        />
      </div>
    );
  }

  return (
    <OverviewSection
      title="Code health map"
      description={props.description}
      action={
        props.onOverlayChange ? (
          <MapLensSwitcher
            overlay={overlay}
            onOverlayChange={props.onOverlayChange}
            {...(props.lenses ? { lenses: props.lenses } : {})}
          />
        ) : undefined
      }
    >
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-2.5">
          {map}
          <MapLegend overlay={overlay} {...(lens ? { lens } : {})} loading={props.overlayLoading} />
        </div>
        {/* Separated from the canvas by space, not a rule: a vertical hairline
            down the side of the canvas would turn the map into a trench. */}
        <aside
          aria-label="Map selection"
          className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-4 lg:h-[var(--rail-h)] lg:overflow-y-auto lg:pr-1"
          style={{ "--rail-h": `${MAP_HEIGHT + CHROME_ROWS}px` } as CSSProperties}
        >
          <SearchBox value={query} onChange={setQuery} />
          {rail}
        </aside>
      </div>
    </OverviewSection>
  );
}
