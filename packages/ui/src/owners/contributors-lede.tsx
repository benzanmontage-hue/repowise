import * as React from "react";
import type { OwnersSummary } from "@repowise-dev/types/owners";
import { PageLede } from "../shared/page-lede";
import { ReadsColumn, type ReadItem } from "../overview/reads-column";
import { joinNames } from "./knowledge-files";

export interface ContributorsLedeProps {
  summary: OwnersSummary;
  /** Link to a Contributors tab, e.g. `?tab=risks`. */
  hrefForTab: (tab: "risks" | "loss" | "offboarding", leave?: string[]) => string;
  LinkComponent?: React.ElementType | undefined;
}

/**
 * The Contributors page's one figure: the truck factor, read as a sentence,
 * with the two reads that say where to look next. People only; automation
 * owns nothing here.
 */
export function ContributorsLede({ summary, hrefForTab, LinkComponent }: ContributorsLedeProps) {
  const tf = summary.truck_factor;
  if (tf == null || summary.owned_files === 0) return null;

  // The truck factor is the fewest top owners covering half the owned files,
  // so when it is within the concentration list those are the people.
  const named = tf <= summary.concentration.owners.length ? summary.concentration.owners.slice(0, tf) : [];
  const people = tf === 1 ? "one person" : `${tf.toLocaleString()} people`;

  const reads: ReadItem[] = [];
  if (summary.single_owner_hotspots > 0) {
    reads.push({
      key: "hotspots",
      label: "Single-author hotspots",
      value: summary.single_owner_hotspots.toLocaleString(),
      unit: `of ${summary.single_owner_files.toLocaleString()} single-author files`,
      why: "Busy files only one person has written. The cheapest place to get a second reader.",
      href: hrefForTab("risks"),
    });
  }
  if (summary.quiet_owners_total > 0) {
    reads.push({
      key: "quiet",
      label: "Quiet owners of changing code",
      value: summary.quiet_owners_total.toLocaleString(),
      unit: summary.quiet_owners_total === 1 ? "person" : "people",
      why: `No commit in ${summary.activity_window_days} days, yet files they own changed in that time.`,
      href: hrefForTab("loss"),
    });
  }

  return (
    <section className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-10">
      <PageLede
        label="Truck factor"
        labelHint="The fewest people who together are the main owner of more than half the owned files"
        value={tf.toLocaleString()}
        unit={tf === 1 ? "person" : "people"}
      >
        <p>
          If {people} left, more than half of the {summary.owned_files.toLocaleString()} owned files would lose
          their main owner
          {named.length > 0 ? (
            <>
              : <strong className="font-semibold text-[var(--color-text-primary)]">{joinNames(named.map((o) => o.name))}</strong>.
            </>
          ) : (
            "."
          )}{" "}
          {summary.active_contributors.toLocaleString()}
          {summary.activity_complete ? "" : "+"} of {summary.people.toLocaleString()} people committed in the
          last {summary.activity_window_days} days.
          {named.length > 0 && (
            <>
              {" "}
              <LinkOrAnchor
                href={hrefForTab("offboarding", named.map((o) => o.key))}
                LinkComponent={LinkComponent}
              >
                See what depends on {named.length === 1 ? "them" : "them together"}
              </LinkOrAnchor>
            </>
          )}
        </p>
      </PageLede>
      {reads.length > 0 && <ReadsColumn items={reads} LinkComponent={LinkComponent} />}
    </section>
  );
}

function LinkOrAnchor({
  href,
  LinkComponent,
  children,
}: {
  href: string;
  LinkComponent?: React.ElementType | undefined;
  children: React.ReactNode;
}) {
  const A = LinkComponent ?? "a";
  return (
    <A href={href} className="text-[var(--color-accent-primary)] hover:underline">
      {children}
    </A>
  );
}
