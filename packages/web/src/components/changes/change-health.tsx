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
import type { ChangeHealthResponse } from "@repowise-dev/types/history";

type Health = ChangeHealthResponse | null | undefined;

/** Green only for a real improvement, red only for a regression. */
const VALUE_COLOR: Partial<Record<HealthDeltaKind, string>> = {
  improved: "var(--color-success)",
  worsened: "var(--color-error)",
};

/**
 * The change page's lede: what the change's commits did to code health, the
 * sentence that says how much, and the primary action when there is work to
 * hand over. A change none of whose commits was scanned says so, never reads
 * as clean.
 */
export async function ChangeHealthLede({ health, action }: { health: Health; action?: ReactNode }) {
  const t = await getTranslations("views.changes");
  if (!health) {
    return (
      <PageLede label={t("verdictLabel")} value={t("healthLabels.notCompared")} action={action}>
        <p>{t("verdictUnknown")}</p>
      </PageLede>
    );
  }
  const kind = healthDeltaKind(health);
  const better = betterCount(health);
  const worse = worseCount(health);
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
      {health.status === "partial" && (
        <p>{t("verdictPartial", { unscanned: health.unscanned_commits })}</p>
      )}
    </PageLede>
  );
}

/**
 * "Got worse": the findings the change's commits introduced or made more
 * severe. What got better is the lede's count; a resolved finding has no
 * location left to list.
 */
export async function ChangeGotWorse({ health }: { health: Health }) {
  const findings = health?.findings ?? [];
  if (!health || findings.length === 0) return null;
  const t = await getTranslations("views.changes");
  const worse = worseCount(health);
  return (
    <OverviewSection
      title={t("gotWorse")}
      description={
        findings.length < worse
          ? `${t("gotWorseDescription")} ${t("gotWorseShown", { shown: findings.length, total: worse })}`
          : t("gotWorseDescription")
      }
    >
      <CommitHealthTable findings={findings} noun="change" />
    </OverviewSection>
  );
}
