import * as React from "react";
import type { OwnerCoAuthor } from "@repowise-dev/types/owners";
import { OverviewSection } from "../overview/section";
import { EmptyState } from "../shared/empty-state";
import { OwnerAvatar } from "./owner-avatar";

/**
 * Who else works in the same files.
 *
 * Overlap on a real repo is one partner and then a cliff — 15.8%, then 1.6%,
 * 1.2%, 1.0% — so a list of ten presents people who once touched the same
 * file at the weight of the person who actually shares the work. The lead
 * partner answers the question the section exists for (who reviews this, who
 * picks it up), and the tail is reported as a count.
 */
export function OwnerRelationships({
  coAuthors,
  total,
  hrefForCoAuthor,
  LinkComponent,
}: {
  coAuthors: OwnerCoAuthor[];
  total: number;
  hrefForCoAuthor?: ((coAuthor: OwnerCoAuthor) => string) | undefined;
  LinkComponent?: React.ElementType | undefined;
}) {
  const A = LinkComponent ?? "a";
  const [lead, second] = [...coAuthors].sort(
    (a, b) => b.co_change_strength - a.co_change_strength,
  );

  return (
    <OverviewSection
      title="Who else works here"
      description="Contributors editing the same files. Overlap is the share of this person's files the other has also committed to, so it reads as how much of their work is genuinely shared."
    >
      {!lead ? (
        <EmptyState
          className="p-6"
          title="Nobody else has touched these files"
          description="Co-authorship appears once a second contributor commits to a file this person owns."
        />
      ) : (
        <div className="flex flex-col gap-3">
          <LeadPartner coAuthor={lead} href={hrefForCoAuthor?.(lead)} LinkComponent={A} />
          <p className="max-w-[62ch] text-xs leading-relaxed text-[var(--color-text-tertiary)] [text-wrap:pretty]">
            {total <= 1 ? (
              <>No other contributor shares a file with this person.</>
            ) : second ? (
              <>
                The next closest of {(total - 1).toLocaleString()} other contributors overlaps on{" "}
                {(second.co_change_strength * 100).toFixed(1)}%, so there is one natural reviewer here
                rather than a shortlist.
              </>
            ) : (
              <>{(total - 1).toLocaleString()} other contributors share at least one file.</>
            )}
          </p>
        </div>
      )}
    </OverviewSection>
  );
}

function LeadPartner({
  coAuthor,
  href,
  LinkComponent,
}: {
  coAuthor: OwnerCoAuthor;
  href: string | undefined;
  LinkComponent: React.ElementType;
}) {
  const A = LinkComponent;
  const body = (
    <>
      <OwnerAvatar name={coAuthor.name} email={coAuthor.email} size="md" />
      <span className="min-w-0">
        <span className="block font-medium text-[var(--color-text-primary)] transition-colors group-hover:text-[var(--color-accent-primary)] [text-wrap:pretty]">
          {coAuthor.name || coAuthor.email || "unknown"}
        </span>
        <span className="block text-xs tabular-nums text-[var(--color-text-tertiary)]">
          {coAuthor.shared_files.toLocaleString()} shared {coAuthor.shared_files === 1 ? "file" : "files"} ·{" "}
          {(coAuthor.co_change_strength * 100).toFixed(1)}% of this person&apos;s work overlaps theirs
        </span>
      </span>
    </>
  );

  return href ? (
    <A href={href} className="group flex w-fit items-center gap-3 no-underline">
      {body}
    </A>
  ) : (
    <span className="flex items-center gap-3">{body}</span>
  );
}
