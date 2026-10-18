import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { PageLede } from "@repowise-dev/ui/shared/page-lede";
import { OverviewSection } from "@repowise-dev/ui/overview";
import { CommitHealthTable } from "@repowise-dev/ui/commits/commit-health-table";
import {
  betterCount,
  healthDeltaKind,
  worseCount,
  type HealthDeltaKind,
} from "@repowise-dev/ui/commits/health-delta";
import type { ChangeHealth } from "@/lib/changes";

/** Green only for a real improvement, red only for a regression. */
const VALUE_COLOR: Partial<Record<HealthDeltaKind, string>> = {
  improved: "var(--color-success)",
  worsened: "var(--color-error)",
};

/**
 * The change page's lede: what the change did to code health, the sentence
 * that says how much, and the primary action. A change that was not compared
 * says so, never reads as clean.
 */
export async function ChangeHealthLede({
  health,
  action,
}: {
  health: ChangeHealth | null;
  action: ReactNode;
}) {
  const t = await getTranslations("views.changes");
  if (!health) {
    return (
      <PageLede label={t("verdictLabel")} value={t("healthLabels.notCompared")} action={action}>
        <p>{t("verdictUnknown")}</p>
      </PageLede>
    );
  }
  const kind = healthDeltaKind(health.counts);
  const better = betterCount(health.counts);
  const worse = worseCount(health.counts);
  const sentence =
    kind === "neutral"
      ? t("verdictNeutral")
      : kind === "improved"
        ? t("verdictImproved", { better })
        : t("verdictWorse", { worse, better });
  return (
    <PageLede
      label={t("verdictLabel")}
      value={t(`healthLabels.${kind}`)}
      valueColor={VALUE_COLOR[kind]}
      action={action}
    >
      <p>{sentence}</p>
      {health.counts.status === "partial" && <p>{t("verdictPartial")}</p>}
    </PageLede>
  );
}

/**
 * "Got worse": the findings the change introduced or made more severe. What
 * got better is the lede's count; resolved findings have no location left to
 * list, and per-file improvements arrive with the history rollup.
 */
export async function ChangeGotWorse({ health }: { health: ChangeHealth | null }) {
  if (!health || health.findings.length === 0) return null;
  const t = await getTranslations("views.changes");
  const worse = worseCount(health.counts);
  return (
    <OverviewSection
      title={t("gotWorse")}
      description={
        health.findings.length < worse
          ? `${t("gotWorseDescription")} ${t("gotWorseShown", { shown: health.findings.length, total: worse })}`
          : t("gotWorseDescription")
      }
    >
      <CommitHealthTable findings={health.findings} noun="change" />
    </OverviewSection>
  );
}
