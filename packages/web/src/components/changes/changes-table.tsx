"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { ResponsiveTable, type ResponsiveColumn } from "@repowise-dev/ui/shared/responsive-table";
import { HealthDeltaMark } from "@repowise-dev/ui/commits/health-delta-mark";
import type { HealthDeltaCounts } from "@repowise-dev/ui/commits/health-delta";
import { formatLOC, formatRelativeTime } from "@repowise-dev/ui/lib/format";
import type { ChangeEvidenceSummary, ChangeListItem } from "@/lib/api/changes";
import { changeLabel } from "@/lib/changes";

/**
 * A list row, plus the per-change health rollup the server adds when it has
 * one. Read structurally until the generated row type carries the field: the
 * Code health column renders only when some row on the page has it.
 */
export type ChangeRow = ChangeListItem & { health?: HealthDeltaCounts | null };

/**
 * The kept checklist, marked only when it flags something: a dot and a word
 * for attention, nothing at rest. Unknowns are left to the change page, where
 * they are named. A checklist with no items reads as unknown, never as clean.
 */
function ChecklistCell({ summary }: { summary: ChangeEvidenceSummary | null | undefined }) {
  const t = useTranslations("views.changes");
  if (!summary) return null;
  if (summary.ok + summary.attention + summary.unknown === 0) {
    return <span className="text-xs text-[var(--color-text-tertiary)]">{t("unknown")}</span>;
  }
  if (summary.attention === 0) return null;
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs text-[var(--color-text-primary)]">
      <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-warning)]" />
      {t("evidenceAttention", { count: summary.attention })}
    </span>
  );
}

/**
 * Merged changes, one row each, in the commit queue's shape: the title is the
 * link and wraps, the id is a quiet mono prefix, and only exceptions carry
 * colour.
 */
export function ChangesTable({ repoId, rows }: { repoId: string; rows: ChangeRow[] }) {
  const t = useTranslations("views.changes");
  const hasHealth = rows.some((c) => c.health !== undefined);
  const healthLabels = {
    improved: t("healthLabels.improved"),
    worsened: t("healthLabels.worsened"),
    mixed: t("healthLabels.mixed"),
    neutral: t("healthLabels.neutral"),
    notCompared: t("healthLabels.notCompared"),
    partial: t("healthLabels.partial"),
  };

  const columns: ResponsiveColumn<ChangeRow>[] = [
    {
      key: "title",
      header: t("change"),
      cellClassName: "min-w-[240px] max-w-[560px]",
      render: (c) => (
        <div className="flex items-baseline gap-2">
          <span className="shrink-0 font-mono text-xs text-[var(--color-text-tertiary)]" title={c.id}>
            {changeLabel(c)}
          </span>
          <Link
            href={`/repos/${repoId}/changes/${encodeURIComponent(c.id)}`}
            className="min-w-0 rounded-sm text-xs text-[var(--color-text-primary)] [text-wrap:pretty] hover:text-[var(--color-accent-primary)] hover:underline focus-visible:text-[var(--color-accent-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-primary)]"
          >
            {c.title}
          </Link>
        </div>
      ),
    },
    ...(hasHealth
      ? [
          {
            key: "health",
            header: t("healthCol"),
            headerClassName: "w-32",
            render: (c: ChangeRow) => <HealthDeltaMark delta={c.health} labels={healthLabels} />,
          },
        ]
      : []),
    {
      key: "checklist",
      header: t("checklistCol"),
      headerClassName: "w-36",
      render: (c) => <ChecklistCell summary={c.evidence_summary} />,
    },
    {
      key: "merged_at",
      header: t("merged"),
      headerClassName: "w-24",
      priority: 2,
      render: (c) => (
        <span className="text-xs tabular-nums text-[var(--color-text-tertiary)]" title={c.merged_at ?? undefined}>
          {c.merged_at ? formatRelativeTime(c.merged_at) : ""}
        </span>
      ),
    },
    {
      key: "files",
      header: t("files"),
      align: "right",
      headerClassName: "w-16",
      priority: 3,
      render: (c) => <span className="text-xs tabular-nums text-[var(--color-text-secondary)]">{c.files_changed}</span>,
    },
    {
      key: "lines",
      header: t("lines"),
      align: "right",
      headerClassName: "w-28",
      priority: 3,
      render: (c) => (
        <span className="whitespace-nowrap text-xs tabular-nums">
          <span className="text-[var(--color-success)]">+{formatLOC(c.lines_added)}</span>{" "}
          <span className="text-[var(--color-error)]">-{formatLOC(c.lines_deleted)}</span>
        </span>
      ),
    },
  ];
  return (
    <div className="overflow-hidden rounded-lg border border-[var(--color-border-default)]">
      <ResponsiveTable columns={columns} rows={rows} rowKey={(c) => c.id} stacked="sm" bare />
    </div>
  );
}
