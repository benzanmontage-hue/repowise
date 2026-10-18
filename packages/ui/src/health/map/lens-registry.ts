/**
 * The built-in lenses, by id, and the rules for which a switcher offers.
 *
 * Every entry is a {@link MapLens}. A surface with a lens of its own does not
 * add it here: it builds a `MapLens` and passes it to the map's `lens` prop
 * (see `lens.ts`), so this table stays the Code Health page's vocabulary.
 */

import { healthBandMapFill, NODE_RAMP_STOP } from "../tokens";
import { formatScore } from "@repowise-dev/types/health";
import { EMPTY_AREA_INDEX, type AreaIndex } from "./areas";
import { KNOWLEDGE_LENS, ownerLens, shareFill } from "./area-lenses";
import {
  BAND_LEGEND,
  BURDEN_FILL,
  HEALTH_UNSUPPORTED_LABEL,
  NEUTRAL_FILL,
  QUIET_FILL,
  burdenBand,
  churnFill,
  coverageFill,
  performanceBurden,
  performanceFill,
  scoreFill,
  type MapLens,
} from "./lens";
import type { CodeHealthMapFile, CodeHealthOverlay } from "./types";

/** NLOC-weighted mean of a per-file score, over the files that carry one. */
function weightedMean(
  files: readonly CodeHealthMapFile[],
  pick: (f: CodeHealthMapFile) => number | null | undefined,
): number | null {
  let w = 0;
  let sum = 0;
  for (const f of files) {
    const v = pick(f);
    if (v == null || f.nloc <= 0) continue;
    w += f.nloc;
    sum += v * f.nloc;
  }
  return w > 0 ? sum / w : null;
}

const anyFile = (pred: (f: CodeHealthMapFile) => boolean) => (files: readonly CodeHealthMapFile[]) =>
  files.some(pred) ? NODE_RAMP_STOP.alert : NEUTRAL_FILL;

const pct = (v: number) => `${Math.round(v)}%`;

/** Hotspot share at which an area reads as churning. */
const HOTSPOT_STEPS = [0.1, 0.25, 0.5] as const;

/** A lens that reads the file rows, so its `fill` is always there. */
type FileLens = MapLens & { fill: NonNullable<MapLens["fill"]> };
type AreaLensId = "owner" | "knowledge";

export const OVERLAY_SPECS: Record<Exclude<CodeHealthOverlay, AreaLensId>, FileLens> &
  Record<AreaLensId, MapLens> = {
  health: {
    id: "health",
    label: "Code health",
    caption: "disc = folder · size = lines of code · grey = not analysed",
    fill: (f) => scoreFill(f.score),
    areaFill: (a) => (a.band ? healthBandMapFill(a.band) : NEUTRAL_FILL),
    areaText: (a) => (a.health == null ? null : formatScore(a.health)),
    legend: [...BAND_LEGEND, { fill: NEUTRAL_FILL, label: HEALTH_UNSUPPORTED_LABEL }],
  },
  maintainability: {
    id: "maintainability",
    label: "Maintainability",
    caption: "color = maintainability score · folders show their loaded files · grey = not measured",
    fill: (f) => scoreFill(f.maintainability_score),
    areaFromFiles: (files) => scoreFill(weightedMean(files, (f) => f.maintainability_score)),
    legend: [...BAND_LEGEND, { fill: NEUTRAL_FILL, label: "not measured" }],
  },
  performance: {
    id: "performance",
    label: "Performance",
    caption: "colour = open causes, never a runtime measurement · no green: nothing here is proven fast",
    fill: performanceFill,
    areaFromFiles: (files) => {
      const band = burdenBand(files.filter((f) => performanceBurden(f).count > 0).length);
      return band === 0 ? NEUTRAL_FILL : BURDEN_FILL[band];
    },
    legend: [
      { group: "Open causes", fill: BURDEN_FILL[3], label: "5 or more" },
      { group: "Open causes", fill: BURDEN_FILL[2], label: "2 to 4" },
      { group: "Open causes", fill: BURDEN_FILL[1], label: "1" },
      { group: "No open cause", fill: NEUTRAL_FILL, label: "Nothing surfaced" },
    ],
  },
  coverage: {
    id: "coverage",
    label: "Coverage",
    caption: "color = line coverage · grey = no coverage data",
    fill: (f) => coverageFill(f.line_coverage_pct),
    areaFill: (a) => (a.coveragePct === undefined ? null : coverageFill(a.coveragePct)),
    areaFromFiles: (files) => coverageFill(weightedMean(files, (f) => f.line_coverage_pct)),
    areaText: (a) => (a.coveragePct == null ? null : pct(a.coveragePct)),
    legend: [
      { fill: NODE_RAMP_STOP.alert, label: "<20%" },
      { fill: NODE_RAMP_STOP.serious, label: "20-50%" },
      { fill: NODE_RAMP_STOP.warning, label: "50-80%" },
      { fill: QUIET_FILL, label: "≥80%" },
      { fill: NEUTRAL_FILL, label: "no data" },
    ],
  },
  churn: {
    id: "churn",
    label: "Churn",
    caption: "file = 90-day churn percentile · folder = share of its files that are hotspots",
    fill: (f) => churnFill(f.churn_percentile),
    areaFill: (a) =>
      a.hotspotCount === undefined || a.fileCount <= 0
        ? null
        : shareFill(a.hotspotCount / a.fileCount, HOTSPOT_STEPS),
    areaFromFiles: (files) => churnFill(weightedMean(files, (f) => f.churn_percentile)),
    areaText: (a) =>
      a.hotspotCount === undefined || a.fileCount <= 0 ? null : pct((a.hotspotCount / a.fileCount) * 100),
    legend: [
      { fill: NODE_RAMP_STOP.alert, label: "Top 10%" },
      { fill: NODE_RAMP_STOP.serious, label: "Top 30%" },
      { fill: NODE_RAMP_STOP.warning, label: "Top 60%" },
      { fill: QUIET_FILL, label: "Quiet" },
      { fill: NEUTRAL_FILL, label: "no data" },
    ],
  },
  "dead-code": {
    id: "dead-code",
    label: "Dead code",
    caption: "red = reclaimable lines · grey = clean",
    fill: (f) => ((f.dead_code_lines ?? 0) > 0 ? NODE_RAMP_STOP.alert : NEUTRAL_FILL),
    areaFromFiles: anyFile((f) => (f.dead_code_lines ?? 0) > 0),
    legend: [
      { fill: NODE_RAMP_STOP.alert, label: "Has dead code" },
      { fill: NEUTRAL_FILL, label: "Clean" },
    ],
    available: ({ files }) => files.some((f) => f.dead_code_lines != null),
  },
  security: {
    id: "security",
    label: "Security",
    caption: "red = open findings · grey = clean",
    fill: (f) => ((f.security_findings ?? 0) > 0 ? NODE_RAMP_STOP.alert : NEUTRAL_FILL),
    areaFromFiles: anyFile((f) => (f.security_findings ?? 0) > 0),
    legend: [
      { fill: NODE_RAMP_STOP.alert, label: "Has findings" },
      { fill: NEUTRAL_FILL, label: "Clean" },
    ],
    available: ({ files }) => files.some((f) => f.security_findings != null),
  },
  owner: ownerLens(EMPTY_AREA_INDEX),
  knowledge: KNOWLEDGE_LENS,
};

/**
 * Default lenses offered in the switcher: the three co-equal health signals,
 * all backed by a per-file signal that rides on the map payload itself.
 *
 * Churn is deliberately not in the default. It colors by `churn_percentile`,
 * which arrives on a separate request the host has to join in, so offering it
 * where nobody joined it paints an all-neutral field that reads as "no churn"
 * rather than "no data". Hosts that do the join pass their own `lenses`.
 */
export const OVERLAY_ORDER: CodeHealthOverlay[] = ["health", "maintainability", "performance"];

/** A built-in lens, built over the areas on hand when its key depends on them. */
export function resolveLens(id: CodeHealthOverlay, areas: AreaIndex): MapLens {
  if (id === "owner") return ownerLens(areas);
  return OVERLAY_SPECS[id] ?? OVERLAY_SPECS.health;
}

/**
 * Whether the data on hand backs a lens. A lens with no data draws every node
 * grey, which reads as "clean" rather than as "not here", so it is not offered.
 */
export function lensAvailable(
  lens: CodeHealthOverlay,
  files: readonly CodeHealthMapFile[],
  areas: AreaIndex = EMPTY_AREA_INDEX,
): boolean {
  const available = OVERLAY_SPECS[lens]?.available;
  return available ? available({ files, areas }) : true;
}
