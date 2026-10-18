"use client";

import * as React from "react";
import type { KnowledgeMatrix } from "@repowise-dev/types/owners";
import { useAiPromptAction } from "../health/ai-prompt-action";
import { CleanState } from "../shared/clean-state";
import { buildHandoverPrompt, riskPromptAreas } from "./handover-prompt";
import { KnowledgeAreaList, KnowledgeAreaRow } from "./knowledge-area-list";
import { knowledgeRisks, type KnowledgeRiskArea } from "./knowledge-risks";

export interface KnowledgeRisksViewProps {
  matrix: KnowledgeMatrix;
  base?: string | undefined;
  repoName?: string | undefined;
  LinkComponent?: React.ElementType | undefined;
}

const pct = (share: number) => `${Math.round(share * 100)}%`;

function areaSummary(area: KnowledgeRiskArea): string {
  const who =
    area.holders === 1 && area.holder
      ? `${area.holder.person.name} wrote nearly all of it`
      : `${area.holders.toLocaleString()} people each hold their own files${area.holder ? `, ${area.holder.person.name} the most (${area.holder.files.toLocaleString()})` : ""}`;
  const severe =
    area.severe > 0
      ? `. ${area.severe.toLocaleString()} ${area.severe === 1 ? "is" : "are"} both a hotspot and in weak health`
      : "";
  return `${who}${severe}.`;
}

/**
 * Where one person holds code that matters now: single-author files that are
 * hotspots or in weak health, by directory. The action is a plan to spread
 * that knowledge, handed to the reader's agent.
 */
export function KnowledgeRisksView({ matrix, base, repoName, LinkComponent }: KnowledgeRisksViewProps) {
  const risks = React.useMemo(() => knowledgeRisks(matrix), [matrix]);
  const { openPrompt, promptModal } = useAiPromptAction();

  const promptFor = React.useCallback(
    (area: KnowledgeRiskArea) => {
      const people = Array.from(new Set(area.files.map((f) => f.holder.name)));
      const promptAreas = riskPromptAreas([area]);
      openPrompt({
        title: "Spread the knowledge",
        description: `A plan for a second person to learn ${area.fileCount.toLocaleString()} ${area.fileCount === 1 ? "file" : "files"} one person holds.`,
        filePath: area.dir || "(repository root)",
        getPrompt: (flavor) =>
          buildHandoverPrompt({
            purpose: "spread",
            people,
            areas: promptAreas,
            flavor,
            ...(repoName ? { repoName } : {}),
          }),
      });
    },
    [openPrompt, repoName],
  );

  if (risks.files === 0) {
    return (
      <CleanState
        align="start"
        title={`Every hotspot and weak file has a second author, across ${risks.trackedFiles.toLocaleString()} files`}
        description="Knowledge here is shared: no busy or weak file depends on a single person's history."
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-[68ch] text-[15px] leading-relaxed text-[var(--color-text-secondary)] [text-wrap:pretty]">
        <strong className="font-semibold text-[var(--color-text-primary)]">
          {risks.files.toLocaleString()} files
        </strong>{" "}
        have one author and matter right now: {risks.hotspots.toLocaleString()} are hotspots and{" "}
        {risks.lowHealth.toLocaleString()} are in weak health, across {risks.areas.length.toLocaleString()}{" "}
        {risks.areas.length === 1 ? "directory" : "directories"}. Hand a directory to your agent for a plan
        to get a second person reading it.
      </p>
      <KnowledgeAreaList
        label="Directories with knowledge held by one person"
        areas={risks.areas}
        keyOf={(a) => a.dir}
        renderArea={(area) => (
          <KnowledgeAreaRow
            dir={area.dir}
            summary={areaSummary(area)}
            files={area.files.map((f) => ({ ...f, note: `${f.holder.name} ${pct(f.holder.share)}` }))}
            onPrompt={() => promptFor(area)}
            base={base}
            LinkComponent={LinkComponent}
          />
        )}
      />
      {promptModal}
    </div>
  );
}
