import * as React from "react";
import type { OwnerModuleRollup } from "@repowise-dev/types/owners";
import { OverviewSection } from "../overview/section";
import { EmptyState } from "../shared/empty-state";
import { ProportionBar } from "../shared/proportion-bar";

/**
 * Where a person works, as one stacked bar rather than a row of bars.
 *
 * The endpoint only attributes top-level directories, so this list is two to
 * four entries on a real repo. Four rows each carrying a label, a count, a
 * track and a percentage is more chrome than four numbers can pay for, and it
 * invites comparing bars that measure different denominators. One bar shows
 * the split, and the key carries the share. Position is the encoding.
 */
export function OwnerFootprint({
  modules,
  hrefForModule,
  LinkComponent,
}: {
  modules: OwnerModuleRollup[];
  hrefForModule?: ((modulePath: string) => string) | undefined;
  LinkComponent?: React.ElementType | undefined;
}) {
  const ordered = [...modules].sort((a, b) => b.file_count - a.file_count);
  const total = ordered.reduce((sum, m) => sum + m.file_count, 0);

  return (
    <OverviewSection
      title="Where they work"
      description="Files they are the main owner of, by top-level directory. Share is the fraction of each directory's files where this person wrote most of the surviving lines."
    >
      {total === 0 ? (
        <EmptyState
          className="p-6"
          title="No directory attribution yet"
          description="Ownership by directory appears after the next git sync."
        />
      ) : (
        <ProportionBar
          className="max-w-[560px]"
          label="Owned files by directory"
          // Every directory keeps its own link; past the fifth they share the tail step.
          maxSegments={Infinity}
          segments={ordered.map((m) => ({
            key: m.module_path,
            label: m.module_path,
            value: m.file_count,
            detail: `${m.file_count.toLocaleString()} ${m.file_count === 1 ? "file" : "files"} · ${Math.round(m.dominant_pct * 100)}% theirs`,
            ...(hrefForModule ? { href: hrefForModule(m.module_path) } : {}),
          }))}
          LinkComponent={LinkComponent}
        />
      )}
    </OverviewSection>
  );
}
