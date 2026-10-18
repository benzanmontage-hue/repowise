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
export function OwnerIdentity({ owner }: { owner: OwnerProfile }) {
  const activity = ownerActivity(owner);
  const otherNames = owner.aliases.names.filter((n) => n !== owner.name);
  const otherEmails = owner.aliases.emails.filter((e) => e !== owner.email);
  const aliases = [...otherNames, ...otherEmails];
  const commits = owner.commit_count_90d ?? owner.commit_count_90d_at_least ?? null;

  if (!activity && aliases.length === 0 && !owner.email) return null;
  return (
    <dl className="flex flex-col gap-1.5 text-xs text-[var(--color-text-secondary)]">
      {activity && (
        <div className="flex flex-wrap gap-x-2">
          <dt className="sr-only">Activity</dt>
          <dd>
            {activity === "active"
              ? `Active: ${commits != null && owner.commit_count_90d == null ? "at least " : ""}${(commits ?? 0).toLocaleString()} ${commits === 1 ? "commit" : "commits"} in the last 90 days`
              : "Quiet: no commit in the last 90 days"}
          </dd>
        </div>
      )}
      {owner.email && owner.email !== owner.name && (
        <div className="flex flex-wrap gap-x-2">
          <dt className="text-[var(--color-text-tertiary)]">Email</dt>
          <dd className="font-mono [overflow-wrap:anywhere]">{owner.email}</dd>
        </div>
      )}
      {aliases.length > 0 && (
        <div className="flex flex-wrap gap-x-2">
          <dt className="text-[var(--color-text-tertiary)]">Also commits as</dt>
          <dd className="font-mono [overflow-wrap:anywhere]">{aliases.join(", ")}</dd>
        </div>
      )}
    </dl>
  );
}
