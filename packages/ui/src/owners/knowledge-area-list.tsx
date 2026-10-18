"use client";

import * as React from "react";
import { formatScore } from "@repowise-dev/types/health";
import { AiPromptButton } from "../health/ai-prompt-button";
import { AGENT_PROMPT_LABEL, bulkAgentPromptLabel } from "../health/ai-prompt-action";
import { scoreTextColor } from "../health/tokens";
import { fileEntityPath } from "../shared/entity";
import { PathText } from "../shared/path-text";

/**
 * Directories of files that carry knowledge risk, area first and files on
 * demand: the shape the Knowledge risks, Knowledge loss and Off-boarding views
 * and the person page all share. Each area leads with its one filled action,
 * a prompt for the whole group; file rows carry no button of their own.
 */

export interface KnowledgeAreaFile {
  path: string;
  nloc: number;
  healthScore: number | null;
  isHotspot: boolean;
  lowHealth: boolean;
  /** Right-aligned detail, e.g. "ana 92%" or "loses 60%". */
  note?: string;
}

export interface KnowledgeAreaRowProps {
  dir: string;
  files: KnowledgeAreaFile[];
  /** One line under the path: who holds it, who could take over. */
  summary?: React.ReactNode;
  onPrompt: () => void;
  /** `/repos/{id}`: file rows link to the file page under it. */
  base?: string | undefined;
  LinkComponent?: React.ElementType | undefined;
  defaultOpen?: boolean;
}

/** A group's prompt label: the bulk form, or the plain one for a group of one. */
export function groupPromptLabel(count: number): string {
  return count === 1 ? AGENT_PROMPT_LABEL : bulkAgentPromptLabel(count);
}

/** Files listed before "Show all N". */
const FILE_LIMIT = 12;

function FileMarks({ file }: { file: KnowledgeAreaFile }) {
  return (
    <span className="flex shrink-0 items-baseline gap-2 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--color-text-tertiary)]">
      {file.isHotspot && <span>Hotspot</span>}
      {file.lowHealth && file.healthScore != null && (
        <span className={`normal-case tracking-normal ${scoreTextColor(file.healthScore)}`}>
          {formatScore(file.healthScore)}
        </span>
      )}
    </span>
  );
}

export function KnowledgeAreaRow({
  dir,
  files,
  summary,
  onPrompt,
  base,
  LinkComponent,
  defaultOpen = false,
}: KnowledgeAreaRowProps) {
  const [open, setOpen] = React.useState(defaultOpen);
  const [all, setAll] = React.useState(false);
  const A = LinkComponent ?? "a";
  const panelId = React.useId();
  const shown = all ? files : files.slice(0, FILE_LIMIT);

  return (
    <li className="border-b border-[var(--color-border-default)] py-3">
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((o) => !o)}
          className="group flex min-w-0 flex-1 items-start gap-2 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-primary)]"
        >
          <span
            aria-hidden
            className={`mt-0.5 text-[var(--color-text-tertiary)] transition-transform ${open ? "rotate-90" : ""}`}
          >
            ▸
          </span>
          <span className="min-w-0">
            <span className="flex flex-wrap items-baseline gap-x-2">
              <PathText path={dir ? `${dir}/` : "(repository root)"} className="text-[13px]" />
              <span className="font-mono text-xs tabular-nums text-[var(--color-text-tertiary)]">
                {files.length.toLocaleString()} {files.length === 1 ? "file" : "files"}
              </span>
            </span>
            {summary && (
              <span className="mt-0.5 block text-xs leading-relaxed text-[var(--color-text-secondary)] [text-wrap:pretty]">
                {summary}
              </span>
            )}
          </span>
        </button>
        <AiPromptButton onClick={onPrompt} label={groupPromptLabel(files.length)} />
      </div>

      {open && (
        <ul id={panelId} className="mt-2 flex flex-col pl-5">
          {shown.map((f) => {
            const name = dir ? f.path.slice(dir.length + 1) : f.path;
            return (
              <li
                key={f.path}
                className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-1"
              >
                <span className="flex min-w-0 items-baseline gap-2">
                  {base ? (
                    <A href={fileEntityPath(base, f.path)} className="group min-w-0 no-underline" title={f.path}>
                      <PathText path={name} />
                    </A>
                  ) : (
                    <PathText path={name} />
                  )}
                  <FileMarks file={f} />
                </span>
                {f.note && (
                  <span className="font-mono text-xs tabular-nums text-[var(--color-text-tertiary)]">
                    {f.note}
                  </span>
                )}
              </li>
            );
          })}
          {files.length > shown.length && (
            <li>
              <button
                type="button"
                onClick={() => setAll(true)}
                className="mt-1 text-xs text-[var(--color-accent-primary)] hover:underline"
              >
                Show all {files.length.toLocaleString()} files
              </button>
            </li>
          )}
        </ul>
      )}
    </li>
  );
}

/** Areas in order, the first `initial` shown, the rest behind one button. */
export function KnowledgeAreaList<T>({
  areas,
  keyOf,
  renderArea,
  initial = 8,
  label,
}: {
  areas: readonly T[];
  keyOf: (area: T) => string;
  renderArea: (area: T, index: number) => React.ReactNode;
  initial?: number;
  /** Accessible name of the list, e.g. "Areas at risk". */
  label: string;
}) {
  const [limit, setLimit] = React.useState(initial);
  const shown = areas.slice(0, limit);
  return (
    <div className="flex flex-col gap-2">
      <ul aria-label={label} className="flex flex-col border-t border-[var(--color-border-default)]">
        {shown.map((a, i) => (
          <React.Fragment key={keyOf(a)}>{renderArea(a, i)}</React.Fragment>
        ))}
      </ul>
      {areas.length > shown.length && (
        <button
          type="button"
          onClick={() => setLimit(areas.length)}
          className="self-start text-xs text-[var(--color-accent-primary)] hover:underline"
        >
          Show all {areas.length.toLocaleString()} directories
        </button>
      )}
    </div>
  );
}
