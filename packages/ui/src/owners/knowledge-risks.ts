/**
 * Knowledge risks: files one person holds (bus factor 1) that also matter
 * right now, because they are hotspots or in a weak health band, grouped by
 * directory. Each file names its holder and the next author, the natural
 * person to spread the knowledge to.
 *
 * Pure and O(files). Holder is the file's strongest commit author, the same
 * measure the bus factor counts, not the blame owner.
 */

import type { KnowledgeMatrix, KnowledgeMatrixFile } from "@repowise-dev/types/owners";
import {
  compareAreas,
  compareFileFacts,
  fileFacts,
  groupByDir,
  isSingleOwner,
  mostNamed,
  personAt,
  type KnowledgeFileFacts,
  type KnowledgePerson,
} from "./knowledge-files";

export interface KnowledgeRiskFile extends KnowledgeFileFacts {
  holder: KnowledgePerson & { share: number };
  /** The next author, if anyone else has committed. */
  second: (KnowledgePerson & { share: number }) | null;
  /** Hotspot and weak health together. */
  both: boolean;
}

export interface KnowledgeRiskArea {
  dir: string;
  files: KnowledgeRiskFile[];
  fileCount: number;
  /** Files that are both a hotspot and weak health. */
  severe: number;
  nloc: number;
  /** Who holds most of these files. */
  holder: { person: KnowledgePerson; files: number } | null;
  /** How many different people hold them. */
  holders: number;
}

export interface KnowledgeRisks {
  areas: KnowledgeRiskArea[];
  files: number;
  hotspots: number;
  lowHealth: number;
  /** Code files the matrix covers, for the clean state's scope. */
  trackedFiles: number;
}

/** The file as a knowledge risk, or null when it has a second author or does not matter now. */
function riskFile(matrix: KnowledgeMatrix, row: KnowledgeMatrixFile): KnowledgeRiskFile | null {
  const [top, next] = row[7];
  if (!isSingleOwner(row[5]) || !top) return null;
  const facts = fileFacts(matrix, row);
  if (!facts.isHotspot && !facts.lowHealth) return null;
  return {
    ...facts,
    holder: { ...personAt(matrix, top[0]), share: top[1] },
    second: next ? { ...personAt(matrix, next[0]), share: next[1] } : null,
    both: facts.isHotspot && facts.lowHealth,
  };
}

function riskArea(dir: string, files: KnowledgeRiskFile[]): KnowledgeRiskArea {
  files.sort(compareFileFacts);
  return {
    dir,
    files,
    fileCount: files.length,
    severe: files.filter((f) => f.both).length,
    nloc: files.reduce((s, f) => s + f.nloc, 0),
    holder: mostNamed(files.map((f) => ({ person: f.holder, nloc: f.nloc }))),
    holders: new Set(files.map((f) => f.holder.key)).size,
  };
}

export function knowledgeRisks(matrix: KnowledgeMatrix): KnowledgeRisks {
  const files = matrix.files.flatMap((row) => riskFile(matrix, row) ?? []);
  const areas = Array.from(groupByDir(files), ([dir, group]) => riskArea(dir, group)).sort(compareAreas);
  return {
    areas,
    files: files.length,
    hotspots: files.filter((f) => f.isHotspot).length,
    lowHealth: files.filter((f) => f.lowHealth).length,
    trackedFiles: matrix.files.length,
  };
}
