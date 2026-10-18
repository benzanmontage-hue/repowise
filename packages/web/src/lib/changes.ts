/**
 * Pure Change Record helpers, safe to call from server and client components
 * alike. Kept out of the client table module: a server component cannot call
 * a function exported from a "use client" file.
 */
import type { ChangeListItem, ChangeRecord, EvidenceItem } from "@repowise-dev/types/changes";
import type { CommitHealthFinding } from "@repowise-dev/types/git";
import type { HealthDeltaCounts } from "@repowise-dev/ui/commits/health-delta";
import type { ChangePromptInput } from "@repowise-dev/ui/health/ai-prompt-builder";

/** The change's short name: the forge ref when it has one, else a trimmed id. */
export function changeLabel(c: Pick<ChangeListItem, "forge_ref" | "id">): string {
  return c.forge_ref ?? (c.id.length > 19 ? c.id.slice(0, 19) : c.id);
}

export type CommitsView = "changes" | "commits" | "events" | "review";

/**
 * The Commits page in one view: `?view=changes` groups by merged change,
 * `?view=events` lists what moved between index runs, `?view=review` weighs
 * a change's blast radius before it lands.
 */
export function commitsViewHref(repoId: string, view: CommitsView): string {
  const base = `/repos/${repoId}/commits`;
  return view === "commits" ? base : `${base}?view=${view}`;
}

/** The view a `?view=` value asks for; anything else is the commit view. */
export function parseCommitsView(raw: string | string[] | undefined): CommitsView {
  return raw === "changes" || raw === "events" || raw === "review" ? raw : "commits";
}

/** Filters and paging of the by-change view, as its query parameters keep them. */
export interface ByChangeQuery {
  category?: string | undefined;
  attention?: boolean;
  offset?: number;
}

/** The by-change view with these filters; empty filters stay out of the URL. */
export function byChangeHref(repoId: string, next: ByChangeQuery = {}): string {
  const q = new URLSearchParams({ view: "changes" });
  if (next.category) q.set("category", next.category);
  if (next.attention) q.set("attention", "1");
  if (next.offset) q.set("offset", String(next.offset));
  return `${commitsViewHref(repoId, "commits")}?${q.toString()}`;
}

/** The commit categories a change can carry, in chip order. */
export const CHANGE_CATEGORIES = ["feature", "fix", "refactor", "docs", "test", "deps", "chore", "other"];

/** A category's name under `views.changes`; one this list does not know shows as stored. */
export function categoryLabel(t: (key: string) => string, category: string): string {
  return CHANGE_CATEGORIES.includes(category) ? t(`categories.${category}`) : category;
}

/** A `views.changes` translator that can also say whether it holds a key. */
export type ChangesTranslator = ((key: string, values?: Record<string, string | number>) => string) & {
  has: (key: string) => boolean;
};

/** An evidence item's value in one line, worded from the server's `line`; an unknown one says why. */
export function evidenceValueText(t: ChangesTranslator, item: EvidenceItem): string {
  const line = item.line;
  if (!line) return "";
  const params = line.params as Record<string, string | number>;
  if (line.key === "unknown" && !params.reason) return t("evidenceLine.unknownBare");
  const key = `evidenceLine.${line.key}`;
  // A key this build does not know (a newer server) shows nothing rather than a raw id.
  return t.has(key) ? t(key, params) : "";
}

/** An evidence label or basis from the catalog, falling back to the server's text. */
export function evidenceWord(t: ChangesTranslator, key: string, fallback: string): string {
  return t.has(key) ? t(key) : fallback;
}

/**
 * A checklist in the order the change page reads it. Health leads the page and
 * outcomes have their own section; provenance sits in the metadata line, so a
 * repository without attribution does not carry an "unknown" on every change.
 * What is left splits into exceptions (attention first, then unknown) and the
 * checks that passed.
 */
export interface EvidenceView {
  health: EvidenceItem | undefined;
  outcomes: EvidenceItem | undefined;
  exceptions: EvidenceItem[];
  passed: EvidenceItem[];
}

const LED_ELSEWHERE = new Set(["health_delta", "outcomes", "provenance"]);

export function splitEvidence(items: EvidenceItem[]): EvidenceView {
  const rest = items.filter((i) => !LED_ELSEWHERE.has(i.kind));
  return {
    health: items.find((i) => i.kind === "health_delta"),
    outcomes: items.find((i) => i.kind === "outcomes"),
    exceptions: [
      ...rest.filter((i) => i.status === "attention"),
      ...rest.filter((i) => i.status === "unknown"),
    ],
    passed: rest.filter((i) => i.status === "ok"),
  };
}

/** What a change did to code health, as its checklist measured it. */
export interface ChangeHealth {
  counts: HealthDeltaCounts;
  /** Introduced or worsened findings, worst first, in the commit view's shape. */
  findings: CommitHealthFinding[];
}

type Row = Record<string, unknown>;

const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** One checklist finding row as the commit view's finding; a checklist kept
 *  before rows carried a basis reads it as unknown, never as direct. */
function findingFromRow(r: Row): CommitHealthFinding {
  return {
    change_kind: String(r.change),
    dimension: String(r.dimension ?? ""),
    biomarker_type: String(r.biomarker_type ?? ""),
    severity: String(r.severity ?? "low"),
    severity_before: str(r.severity_before),
    path: String(r.path ?? ""),
    symbol: str(r.symbol),
    line_start: num(r.line_start),
    line_end: num(r.line_end),
    attribution_basis: str(r.attribution_basis) ?? "unknown",
    reason: String(r.reason ?? ""),
  };
}

/** The health item's counts and findings, or null when it was not compared. */
export function changeHealthFromEvidence(item: EvidenceItem | undefined): ChangeHealth | null {
  if (!item || item.status === "unknown") return null;
  const v = (item.value ?? {}) as Row;
  return {
    counts: {
      introduced: num(v.introduced) ?? 0,
      worsened: num(v.worsened) ?? 0,
      resolved: num(v.resolved) ?? 0,
      status: v.complete === false ? "partial" : "available",
    },
    findings: (item.details as Row[]).filter((r) => typeof r.change === "string").map(findingFromRow),
  };
}

/** What the agent prompt needs from a change: its findings when it made
 *  health worse, else the checklist rows that need a look, worded. */
export function changePromptInput(
  t: ChangesTranslator,
  change: ChangeRecord,
  health: ChangeHealth | null,
  exceptions: EvidenceItem[],
): ChangePromptInput {
  return {
    label: changeLabel(change),
    title: change.title,
    head_sha: change.head_sha,
    commits: change.commits,
    files: change.files.map((f) => f.path),
    findings: health?.findings ?? [],
    resolved: health?.counts.resolved ?? 0,
    complete: health?.counts.status !== "partial",
    attention: exceptions.map(
      (i) => `${evidenceWord(t, `evidenceKinds.${i.kind}`, i.label)}: ${evidenceValueText(t, i) || t(`status${i.status === "attention" ? "Attention" : "Unknown"}`)}`,
    ),
  };
}
