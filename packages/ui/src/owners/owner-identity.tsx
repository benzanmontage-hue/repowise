import * as React from "react";
import type { OwnerProfile } from "@repowise-dev/types/owners";

/** Active, quiet, or unknown when the indexed commits do not reach back far enough. */
export function ownerActivity(owner: Pick<OwnerProfile, "commit_count_90d" | "commit_count_90d_at_least">):
  | "active"
  | "quiet"
  | null {
  if (owner.commit_count_90d != null) return owner.commit_count_90d > 0 ? "active" : "quiet";
  return owner.commit_count_90d_at_least ? "active" : null;
}

/**
 * Who this is: whether they still commit, and every name and address the
 * index folded into them, so a reader looking for "jdoe@old-corp" finds the
 * person they know. Plain words, no badges: activity is a fact, not a grade.
 */
function activityLine(owner: OwnerProfile): string | null {
  const activity = ownerActivity(owner);
  if (activity !== "active") return activity && "Quiet: no commit in the last 90 days";
  const exact = owner.commit_count_90d;
  const commits = exact ?? owner.commit_count_90d_at_least ?? 0;
  const floor = exact == null ? "at least " : "";
  return `Active: ${floor}${commits.toLocaleString()} ${commits === 1 ? "commit" : "commits"} in the last 90 days`;
}

/** Every folded-in name and address other than the ones the page already shows. */
function otherIdentities(owner: OwnerProfile): string[] {
  return [
    ...owner.aliases.names.filter((n) => n !== owner.name),
    ...owner.aliases.emails.filter((e) => e !== owner.email),
  ];
}

export function OwnerIdentity({ owner }: { owner: OwnerProfile }) {
  const aliases = otherIdentities(owner);
  const rows = [
    { label: "Activity", hidden: true, value: activityLine(owner), mono: false },
    { label: "Email", hidden: false, value: owner.email !== owner.name ? owner.email : null, mono: true },
    { label: "Also commits as", hidden: false, value: aliases.join(", ") || null, mono: true },
  ].filter((r) => r.value);

  if (rows.length === 0) return null;
  return (
    <dl className="flex flex-col gap-1.5 text-xs text-[var(--color-text-secondary)]">
      {rows.map((r) => (
        <div key={r.label} className="flex flex-wrap gap-x-2">
          <dt className={r.hidden ? "sr-only" : "text-[var(--color-text-tertiary)]"}>{r.label}</dt>
          <dd className={r.mono ? "font-mono [overflow-wrap:anywhere]" : undefined}>{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}
