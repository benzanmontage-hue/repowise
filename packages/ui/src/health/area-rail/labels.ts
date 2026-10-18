/** Every string the area rail renders, so a host can translate it. */
export interface AreaRailLabels {
  repository: string;
  /** Eyebrow over the repository summary and over an area card. */
  repoEyebrow: string;
  areaEyebrow: string;
  files: (count: number) => string;
  /** "+0.42 in 30 days", the window the delta covers. */
  deltaWindow: (delta: string, days: number) => string;
  /** The calm good-news line under an improved score. */
  improved: (delta: string, days: number) => string;
  noDelta: string;
  needsAttention: string;
  subAreas: string;
  improvedMost: string;
  worstFiles: string;
  hotspots: (count: number) => string;
  owners: string;
  ownerShare: (name: string, pct: number) => string;
  busFactorOne: (count: number) => string;
  coverage: string;
  noCoverage: string;
  coverageLine: (pct: number, files: number) => string;
  topFindings: string;
  noFindings: string;
  allClean: (files: number) => string;
  promptTitle: string;
  promptDescription: string;
  findingsLink: string;
  fixFirstLink: string;
  contributorsLink: string;
  backToArea: (name: string) => string;
  loading: string;
  loadError: string;
}

const s = (n: number, one: string, many: string) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

export const DEFAULT_AREA_RAIL_LABELS: AreaRailLabels = {
  repository: "Repository",
  repoEyebrow: "Repository",
  areaEyebrow: "Area",
  files: (n) => s(n, "file", "files"),
  deltaWindow: (delta, days) => `${delta} in ${days} days`,
  improved: (delta, days) => `Up ${delta} over the last ${days} days. The work here is paying off.`,
  noDelta: "No earlier snapshot to compare with yet.",
  needsAttention: "Needs attention",
  subAreas: "Inside, lowest first",
  improvedMost: "Improved most",
  worstFiles: "Lowest-scoring files",
  hotspots: (n) => `Hotspots · ${n.toLocaleString()}`,
  owners: "Who knows it",
  ownerShare: (name, pct) => `${name} leads ${pct}% of the files`,
  busFactorOne: (n) => `${s(n, "file", "files")} only one person has changed`,
  coverage: "Tests",
  noCoverage: "No coverage report covers this area.",
  coverageLine: (pct, files) => `${pct}% line coverage over ${s(files, "measured file", "measured files")}`,
  topFindings: "Top findings",
  noFindings: "No open findings here.",
  allClean: (files) => `No open findings across ${s(files, "file", "files")}.`,
  promptTitle: "Agent prompt for this area",
  promptDescription: "The area's highest-priority findings, ready to paste into your agent.",
  findingsLink: "Findings here",
  fixFirstLink: "Fix first here",
  contributorsLink: "Contributors here",
  backToArea: (name) => `Back to ${name}`,
  loading: "Loading area",
  loadError: "Couldn't load this area.",
};
