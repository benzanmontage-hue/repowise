"use client";

import { ResponsiveTable, type ResponsiveColumn } from "../shared/responsive-table";
import { SeverityMark } from "../health/severity-mark";
import type { Severity } from "../health/tokens";
import type { CommitHealthFinding } from "@repowise-dev/types/git";
import { DIRECT_ATTRIBUTION } from "./health-delta";

export interface CommitHealthTableProps {
  findings: CommitHealthFinding[];
  /** What the findings belong to, as the copy names it: a commit, or a
   *  merged change made of several. */
  noun?: string;
  className?: string;
}


const INDIRECT_NOTE: Record<string, string> = {
  changed_call_edge: "reached through a call this commit edited",
  unknown: "not explained by this commit's diff",
};

/** How the commit relates to the finding, when it did not write the line itself. */
function basisNote(f: CommitHealthFinding): string | null {
  if (f.attribution_basis === "moved" || f.moved_from) {
    const src = f.moved_from;
    if (!src) return "moved here from another file";
    return src.symbol ? `moved here from ${src.symbol} in ${src.path}` : `moved here from ${src.path}`;
  }
  if (DIRECT.has(f.attribution_basis)) return null;
  return INDIRECT_NOTE[f.attribution_basis] ?? "in a file this commit touched, not on a line it wrote";
}

function where(f: CommitHealthFinding): string {
  const at = f.line_start ? `:${f.line_start}` : "";
  return f.symbol ? `${f.symbol} — ${f.path}${at}` : `${f.path}${at}`;
}

function columns(noun: string): ResponsiveColumn<CommitHealthFinding>[] {
  return [
    {
      key: "severity",
      header: "Severity",
      headerClassName: "w-24",
      render: (f) => (
        <span className="inline-flex flex-col gap-0.5">
          <SeverityMark severity={f.severity as Severity} />
          {f.change_kind === "worsened" && f.severity_before && (
            <span className="text-[10px] text-[var(--color-text-tertiary)]">
              was {f.severity_before}
            </span>
          )}
        </span>
      ),
    },
    {
      key: "reason",
      header: "What changed",
      cellClassName: "[overflow-wrap:anywhere]",
      render: (f) => (
        <span>
          {f.reason}
          {!DIRECT_ATTRIBUTION.has(f.attribution_basis) && (
            <span className="text-[var(--color-text-tertiary)]">
              {" "}
              (in a file this {noun} touched, not on a line it wrote)
            </span>
          )}
        </span>
      ),
    },
    {
      key: "where",
      header: "Where",
      cellClassName: "font-mono text-[11px] [overflow-wrap:anywhere]",
      headerClassName: "w-64",
      render: where,
    },
  ];
}

/**
 * What a commit (or a merged change) introduced or worsened, worst first.
 *
 * Only these two kinds are listed. A resolved finding is real good news but has
 * no location worth pointing at any more, so it is counted in the section
 * heading instead of given a row here.
 */
export function CommitHealthTable({ findings, noun = "commit", className }: CommitHealthTableProps) {
  if (findings.length === 0) return null;

  return (
    <ResponsiveTable
      className={className}
      columns={columns(noun)}
      rows={findings}
      rowKey={(f) => `${f.path}:${f.line_start ?? 0}:${f.biomarker_type}:${f.symbol ?? ""}`}
      caption={`Code-health findings this ${noun} introduced or made worse`}
      stacked="sm"
      bare
    />
  );
}
