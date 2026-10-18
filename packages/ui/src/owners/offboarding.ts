/**
 * Off-boarding what-if: if these people left, which files would lose most of
 * the knowledge behind them, and who is left to take each area over.
 *
 * Rule (D4): a file is at risk when the authors who stay hold less than
 * `threshold` of its commits. The matrix lists each file's top five people;
 * anyone outside them holds less than the fifth share, so a leaver outside the
 * top five is read as holding none, and everything not lost counts as staying.
 * A file is severe when it is also a hotspot or in a weak health band.
 *
 * Pure and O(files) per call; the result type is the contract the Contributors
 * page, the person page and the area map's off-boarding lens all render.
 */

import type { KnowledgeMatrix } from "@repowise-dev/types/owners";
import {
  compareAreas,
  compareFileFacts,
  fileFacts,
  mostNamed,
  personAt,
  type KnowledgeFileFacts,
  type KnowledgePerson,
} from "./knowledge-files";

/** D4's default: at risk when the people who stay hold under half the commits. */
export const DEFAULT_OFFBOARDING_THRESHOLD = 0.5;

/** `at_risk`: the rule above. `severe`: at risk and a hotspot or weak health. */
export type OffboardingSeverity = "at_risk" | "severe";

export interface OffboardingFile extends KnowledgeFileFacts {
  /** Share of the file's commits the leavers made (0-1). */
  lostShare: number;
  /** 1 - lostShare. */
  remainingShare: number;
  severity: OffboardingSeverity;
  /** The strongest author who stays, with their share; null when nobody listed stays. */
  inheritor: (KnowledgePerson & { share: number }) | null;
}

export interface OffboardingArea {
  /** Directory; "" is the repository root. */
  dir: string;
  /** At-risk files, severe first, then by size. */
  files: OffboardingFile[];
  fileCount: number;
  severe: number;
  hotspots: number;
  nloc: number;
  /** Who most often stays as the strongest author here, and on how many of these files. */
  inheritor: { person: KnowledgePerson; files: number } | null;
}

export interface OffboardingTotals {
  /** Files with a share held by a leaver. */
  touchedFiles: number;
  atRiskFiles: number;
  severeFiles: number;
  hotspots: number;
  atRiskNloc: number;
  /** NLOC across every file in the matrix. */
  totalNloc: number;
  /** atRiskNloc / totalNloc, 0 when the matrix has no code. */
  nlocShare: number;
  /** Files in the matrix. */
  trackedFiles: number;
}

export interface OffboardingResult {
  /** The leavers found in the matrix, in the order asked. */
  leaving: KnowledgePerson[];
  threshold: number;
  totals: OffboardingTotals;
  /** Directories with at-risk files; together they hold every at-risk file once. */
  areas: OffboardingArea[];
}

export function simulateOffboarding(
  matrix: KnowledgeMatrix,
  leavingKeys: readonly string[],
  threshold: number = DEFAULT_OFFBOARDING_THRESHOLD,
): OffboardingResult {
  const keyIndex = new Map(matrix.authors.map((a, i) => [a.key, i]));
  const leavingIdx = new Set<number>();
  for (const key of leavingKeys) {
    const i = keyIndex.get(key);
    if (i !== undefined) leavingIdx.add(i);
  }

  const files: OffboardingFile[] = [];
  let touchedFiles = 0;
  let totalNloc = 0;
  for (const row of matrix.files) {
    totalNloc += row[2];
    if (leavingIdx.size === 0) continue;
    let lost = 0;
    let heir: [number, number] | null = null;
    for (const [author, share] of row[7]) {
      if (leavingIdx.has(author)) lost += share;
      else if (!heir || share > heir[1]) heir = [author, share];
    }
    if (lost <= 0) continue;
    touchedFiles += 1;
    // Rounded shares can sum a hair past 1; clamp so "remaining" never reads negative.
    const remaining = Math.max(0, 1 - lost);
    if (remaining >= threshold) continue;
    const facts = fileFacts(matrix, row);
    files.push({
      ...facts,
      lostShare: Math.min(1, lost),
      remainingShare: remaining,
      severity: facts.isHotspot || facts.lowHealth ? "severe" : "at_risk",
      inheritor: heir ? { ...personAt(matrix, heir[0]), share: heir[1] } : null,
    });
  }
  files.sort(compareFileFacts);

  const byDir = new Map<string, OffboardingFile[]>();
  for (const f of files) {
    const bucket = byDir.get(f.dir);
    if (bucket) bucket.push(f);
    else byDir.set(f.dir, [f]);
  }
  const areas: OffboardingArea[] = Array.from(byDir, ([dir, group]) => ({
    dir,
    files: group,
    fileCount: group.length,
    severe: group.filter((f) => f.severity === "severe").length,
    hotspots: group.filter((f) => f.isHotspot).length,
    nloc: group.reduce((s, f) => s + f.nloc, 0),
    inheritor: mostNamed(
      group.flatMap((f) => (f.inheritor ? [{ person: f.inheritor, nloc: f.nloc }] : [])),
    ),
  })).sort(compareAreas);

  const atRiskNloc = files.reduce((s, f) => s + f.nloc, 0);
  return {
    leaving: Array.from(leavingIdx, (i) => personAt(matrix, i)),
    threshold,
    totals: {
      touchedFiles,
      atRiskFiles: files.length,
      severeFiles: files.filter((f) => f.severity === "severe").length,
      hotspots: files.filter((f) => f.isHotspot).length,
      atRiskNloc,
      totalNloc,
      nlocShare: totalNloc > 0 ? atRiskNloc / totalNloc : 0,
      trackedFiles: matrix.files.length,
    },
    areas,
  };
}

// ---------------------------------------------------------------------------
// URL state: `?leave=a,b&threshold=50`
// ---------------------------------------------------------------------------

/** Owner keys can hold a comma (`name:Doe, Jane`), so each one escapes it. */
export function formatLeaveParam(keys: readonly string[]): string {
  return keys.map((k) => k.replaceAll("%", "%25").replaceAll(",", "%2C")).join(",");
}

export function parseLeaveParam(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const keys = raw
    .split(",")
    .map((k) => k.replaceAll("%2C", ",").replaceAll("%25", "%"))
    .filter(Boolean);
  return Array.from(new Set(keys));
}

/** Whole percent in the URL, 1 to 100; anything else falls back to the default. */
export function parseThresholdParam(raw: string | null | undefined): number {
  const n = raw == null || raw === "" ? NaN : Number(raw);
  return Number.isInteger(n) && n >= 1 && n <= 100 ? n / 100 : DEFAULT_OFFBOARDING_THRESHOLD;
}

export function formatThresholdParam(threshold: number): string {
  return String(Math.round(threshold * 100));
}
