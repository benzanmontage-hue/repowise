"use client";

import * as React from "react";
import type { KnowledgeMatrix, OwnersSummary } from "@repowise-dev/types/owners";
import { AiPromptButton } from "../health/ai-prompt-button";
import { useAiPromptAction } from "../health/ai-prompt-action";
import { formatRelativeTimeOrNull } from "../lib/format";
import { CleanState } from "../shared/clean-state";
import { groupPromptLabel } from "./knowledge-area-list";
import { quietOwnerExposure, type QuietOwnerExposure } from "./knowledge-loss";
import { handoverPromptRequest, OffboardingAreas } from "./offboarding-result";
import { OwnerAvatar } from "./owner-avatar";

export interface KnowledgeLossViewProps {
  matrix: KnowledgeMatrix;
  summary: OwnersSummary;
  /** Person page for an owner key. */
  hrefForPerson?: ((key: string) => string) | undefined;
  /** The off-boarding what-if for one owner key. */
  hrefForScenario?: ((key: string) => string) | undefined;
  base?: string | undefined;
  repoName?: string | undefined;
  LinkComponent?: React.ElementType | undefined;
}

/**
 * Code that still changes while its main author has gone quiet. Each quiet
 * owner reads as an off-boarding that already happened: what lost its
 * majority author, and who is left to carry it.
 */
export function KnowledgeLossView({
  matrix,
  summary,
  hrefForPerson,
  hrefForScenario,
  base,
  repoName,
  LinkComponent,
}: KnowledgeLossViewProps) {
  const rows = React.useMemo(
    () => quietOwnerExposure(matrix, summary.quiet_owners),
    [matrix, summary.quiet_owners],
  );
  const { openPrompt, promptModal } = useAiPromptAction();

  if (summary.quiet_owners_total === 0) {
    return (
      <CleanState
        align="start"
        title={`Everyone who owns changing code has committed in the last ${summary.activity_window_days} days`}
        description={`Across ${summary.people.toLocaleString()} people and ${summary.owned_files.toLocaleString()} owned files, no file that changed lately belongs to someone who has stopped committing.`}
      />
    );
  }

  const shown = rows.length;
  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-[68ch] text-[15px] leading-relaxed text-[var(--color-text-secondary)] [text-wrap:pretty]">
        <strong className="font-semibold text-[var(--color-text-primary)]">
          {summary.quiet_owners_total.toLocaleString()}{" "}
          {summary.quiet_owners_total === 1 ? "person" : "people"}
        </strong>{" "}
        {summary.quiet_owners_total === 1 ? "has" : "have"} not committed in {summary.activity_window_days} days
        but still {summary.quiet_owners_total === 1 ? "owns" : "own"} files that changed in that time. Each
        row shows what would lose its majority author without them, and who is best placed to pick it up.
        {summary.quiet_owners_total > shown
          ? ` Showing the ${shown.toLocaleString()} with the most changing code.`
          : ""}
      </p>
      <ul aria-label="Quiet owners of changing code" className="flex flex-col border-t border-[var(--color-border-default)]">
        {rows.map((row) => (
          <QuietOwnerRow
            key={row.owner.key}
            row={row}
            onPrompt={(areas) => openPrompt(handoverPromptRequest(row.result, areas, repoName))}
            hrefForPerson={hrefForPerson}
            hrefForScenario={hrefForScenario}
            base={base}
            LinkComponent={LinkComponent}
          />
        ))}
      </ul>
      {promptModal}
    </div>
  );
}

function QuietOwnerRow({
  row,
  onPrompt,
  hrefForPerson,
  hrefForScenario,
  base,
  LinkComponent,
}: {
  row: QuietOwnerExposure;
  onPrompt: (areas: QuietOwnerExposure["result"]["areas"]) => void;
  hrefForPerson?: ((key: string) => string) | undefined;
  hrefForScenario?: ((key: string) => string) | undefined;
  base?: string | undefined;
  LinkComponent?: React.ElementType | undefined;
}) {
  const [open, setOpen] = React.useState(false);
  const A = LinkComponent ?? "a";
  const { owner, result } = row;
  const { totals } = result;
  const last = formatRelativeTimeOrNull(owner.last_commit_at);
  const panelId = React.useId();
  const personHref = hrefForPerson?.(owner.key);

  return (
    <li className="border-b border-[var(--color-border-default)] py-3">
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
        <OwnerAvatar name={owner.name} size="md" />
        <div className="min-w-0 flex-1">
          {personHref ? (
            <A href={personHref} className="font-medium text-[var(--color-text-primary)] no-underline hover:text-[var(--color-accent-primary)]">
              {owner.name}
            </A>
          ) : (
            <span className="font-medium text-[var(--color-text-primary)]">{owner.name}</span>
          )}
          <p className="text-xs leading-relaxed text-[var(--color-text-secondary)] [text-wrap:pretty]">
            {last ? `Last commit ${last}. ` : ""}
            {owner.files_owned === 1
              ? "The one file they own changed lately; "
              : `${owner.changing_files_owned.toLocaleString()} of the ${owner.files_owned.toLocaleString()} files they own changed lately; `}
            {totals.atRiskFiles > 0
              ? `${totals.atRiskFiles.toLocaleString()} ${totals.atRiskFiles === 1 ? "has" : "have"} no majority author left${totals.severeFiles > 0 ? `, ${totals.severeFiles.toLocaleString()} of them hotspots or in weak health` : ""}.`
              : `others hold the majority of ${owner.files_owned === 1 ? "it" : "every one of them"}.`}
          </p>
          <div className="mt-1 flex flex-wrap gap-x-4 text-xs">
            {totals.atRiskFiles > 0 && (
              <button
                type="button"
                aria-expanded={open}
                aria-controls={panelId}
                onClick={() => setOpen((o) => !o)}
                className="text-[var(--color-accent-primary)] hover:underline"
              >
                {open ? "Hide" : "Show"} {result.areas.length.toLocaleString()}{" "}
                {result.areas.length === 1 ? "directory" : "directories"}
              </button>
            )}
            {hrefForScenario && (
              <A href={hrefForScenario(owner.key)} className="text-[var(--color-accent-primary)] hover:underline">
                Open in off-boarding
              </A>
            )}
          </div>
        </div>
        {totals.atRiskFiles > 0 && (
          <AiPromptButton onClick={() => onPrompt(result.areas)} label={groupPromptLabel(totals.atRiskFiles)} />
        )}
      </div>
      {open && (
        <div id={panelId} className="mt-3 pl-11">
          <OffboardingAreas
            areas={result.areas}
            onPrompt={(area) => onPrompt([area])}
            base={base}
            LinkComponent={LinkComponent}
            initial={5}
          />
        </div>
      )}
    </li>
  );
}
