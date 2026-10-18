"use client";

/**
 * What sits over the field besides the marks: the scope sentence in the
 * corner, the notice for a field nothing scored, and the hover card for the
 * file or area under the pointer.
 */

import { useMemo } from "react";
import type { AreaIndex } from "./areas";
import { displayLabel, areaTrail } from "./area-paths";
import type { AreaGeometry } from "./area-layout";
import { HEALTH_UNSUPPORTED_NOTICE, noFileScored, type MapLens } from "./lens";
import type { AreaLabel } from "./labels";
import { AreaHoverCard, HoverCard } from "./overlay";
import { LoadedNote, MapScopeNote } from "./scope-note";
import type { CodeHealthMapFile, CodeHealthOverlay, MapScope } from "./types";
import type { Hover } from "./use-map-pointer";
import type { AreaAnalysed } from "./fills";
import { ROOT_AREA } from "../../lib/areas";

/** The area names the canvas places and the breadcrumb above it. */
export function useAreaChrome(
  index: AreaIndex,
  geo: AreaGeometry,
  areaText: ReadonlyMap<string, string | null>,
  selected: string,
  rootLabel: string,
  onSelectArea: (path: string) => void,
) {
  const labels = useMemo<AreaLabel[]>(
    () =>
      [...geo.circles.keys()]
        .filter((p) => p !== ROOT_AREA)
        .map((path) => ({
          path,
          name: displayLabel(index, path, rootLabel),
          text: areaText.get(path) ?? null,
        })),
    [geo, index, areaText, rootLabel],
  );
  const trail = useMemo(
    () =>
      areaTrail(index, selected).map((path, i, all) => ({
        label: displayLabel(index, path, rootLabel),
        ...(i < all.length - 1 ? { onSelect: () => onSelectArea(path) } : {}),
      })),
    [index, selected, rootLabel, onSelectArea],
  );
  return { labels, trail };
}

export interface FlatFieldNotes {
  files: CodeHealthMapFile[];
  scope: MapScope | undefined;
  drawMoreStep: number;
  pending: boolean;
  onDrawMore?: (() => void) | undefined;
  onIncludeHeldChange?: ((include: boolean) => void) | undefined;
  onFindUndrawn?: ((query: string) => void) | undefined;
}

/** The scope sentence for a flat feed or a lazily loaded one, and the unscored notice. */
export function FieldNotes({
  flat,
  loaded,
  matches,
  query,
}: {
  flat: FlatFieldNotes | null;
  loaded: { loaded: number; total: number } | null;
  matches: number;
  query: string;
}) {
  return (
    <>
      {flat?.scope ? (
        <MapScopeNote
          scope={flat.scope}
          matches={matches}
          query={query}
          drawMoreStep={flat.drawMoreStep}
          pending={flat.pending}
          onDrawMore={flat.onDrawMore}
          onIncludeHeldChange={flat.onIncludeHeldChange}
          onFindUndrawn={flat.onFindUndrawn}
        />
      ) : loaded ? (
        <LoadedNote loaded={loaded.loaded} total={loaded.total} matches={query ? matches : null} />
      ) : null}
      {flat && noFileScored(flat.files) ? (
        <div
          role="status"
          data-testid="map-unanalysed"
          className="pointer-events-none absolute bottom-3 left-3 max-w-[64%] rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-glass)] px-2.5 py-1.5 text-xs text-[var(--color-text-secondary)] shadow-sm backdrop-blur-sm sm:max-w-[44%]"
        >
          {HEALTH_UNSUPPORTED_NOTICE}
        </div>
      ) : null}
    </>
  );
}

/** The card for whatever the pointer is over, in the active lens's terms. */
export function FieldHover({
  hover,
  analysed,
  areaText,
  index,
  lens,
  overlay,
  rootLabel,
  width,
  height,
}: {
  hover: Hover | null;
  /** How many of each area's loaded files the active lens analysed. */
  analysed: ReadonlyMap<string, AreaAnalysed>;
  areaText: ReadonlyMap<string, string | null>;
  index: AreaIndex;
  lens: MapLens;
  overlay: CodeHealthOverlay;
  rootLabel: string;
  width: number;
  height: number;
}) {
  if (hover?.kind === "file") {
    return <HoverCard file={hover.file} overlay={overlay} x={hover.x} y={hover.y} width={width} height={height} />;
  }
  const area = hover?.kind === "area" ? index.areas.get(hover.path) : undefined;
  if (!hover || hover.kind !== "area" || !area) return null;
  return (
    <AreaHoverCard
      area={area}
      name={displayLabel(index, hover.path, rootLabel)}
      slot={hover.slot}
      figure={areaText.get(hover.path) ?? null}
      lensLabel={lens.label}
      analysed={analysed.get(hover.path) ?? null}
      lensCoversFiles={Boolean(lens.analysed) && (lens.areaFill?.(area) ?? null) === null}
      x={hover.x}
      y={hover.y}
      width={width}
      height={height}
    />
  );
}
