"use client";

/**
 * Contributors — `/repos/[id]/owners`.
 *
 * Knowledge and handover, as four tabs behind `?tab=`: the overview (truck
 * factor lede, two reads, the full table collapsed), knowledge risks,
 * knowledge loss, and the off-boarding what-if (`?leave=a,b&threshold=50`).
 * The overview needs only `/owners/summary`; the knowledge matrix loads the
 * first time a tab that reads it opens, and the three matrix views are split
 * out so landing here downloads none of them.
 */

import { useCallback, useMemo, type ReactNode } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import useSWR from "swr";
import { Users } from "lucide-react";
import type { KnowledgeMatrix } from "@repowise-dev/types/owners";
import { PageShell } from "@repowise-dev/ui/shared/page-shell";
import { ApiError } from "@repowise-dev/ui/shared/api-error";
import { ViewTabs } from "@repowise-dev/ui/shared/view-tabs";
import { Skeleton } from "@repowise-dev/ui/ui/skeleton";
import { ContributorsLede } from "@repowise-dev/ui/owners/contributors-lede";
import {
  formatLeaveParam,
  formatThresholdParam,
  parseLeaveParam,
  parseThresholdParam,
} from "@repowise-dev/ui/owners/offboarding";
import type { OffboardingScenario } from "@repowise-dev/ui/owners/offboarding-view";
import { AllContributors } from "@/components/owners/all-contributors";
import { getKnowledgeMatrix, getOwnersSummary } from "@/lib/api/owners";

const TabFallback = () => <Skeleton className="h-[50vh] w-full rounded-lg" />;
const KnowledgeRisksView = dynamic(
  () => import("@repowise-dev/ui/owners/knowledge-risks-view").then((m) => m.KnowledgeRisksView),
  { ssr: false, loading: TabFallback },
);
const KnowledgeLossView = dynamic(
  () => import("@repowise-dev/ui/owners/knowledge-loss-view").then((m) => m.KnowledgeLossView),
  { ssr: false, loading: TabFallback },
);
const OffboardingView = dynamic(
  () => import("@repowise-dev/ui/owners/offboarding-view").then((m) => m.OffboardingView),
  { ssr: false, loading: TabFallback },
);

const TABS = ["overview", "risks", "loss", "offboarding"] as const;
type TabId = (typeof TABS)[number];
const TAB_LABEL_KEYS: Record<TabId, string> = {
  overview: "tabs.overview",
  risks: "tabs.risks",
  loss: "tabs.loss",
  offboarding: "tabs.offboarding",
};
/** Params that belong to the off-boarding tab and must not ride along elsewhere. */
const SCENARIO_PARAMS = ["leave", "threshold"];
const DEFAULT_THRESHOLD_PARAM = formatThresholdParam(parseThresholdParam(null));

export default function ContributorsPage() {
  const t = useTranslations("views.contributors");
  const tCommon = useTranslations("common");
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const base = `/repos/${id}`;

  const rawTab = searchParams.get("tab");
  const tab: TabId = (TABS as readonly string[]).includes(rawTab ?? "") ? (rawTab as TabId) : "overview";
  // Parsed off the raw strings so the array keeps its identity between
  // renders and the simulation memo below it holds.
  const rawLeave = searchParams.get("leave");
  const rawThreshold = searchParams.get("threshold");
  const scenario = useMemo<OffboardingScenario>(
    () => ({ leaving: parseLeaveParam(rawLeave), threshold: parseThresholdParam(rawThreshold) }),
    [rawLeave, rawThreshold],
  );

  const summary = useSWR(`owners-summary:${id}`, () => getOwnersSummary(id), {
    revalidateOnFocus: false,
  });
  const matrix = useSWR(
    tab === "overview" ? null : `knowledge-matrix:${id}`,
    () => getKnowledgeMatrix(id),
    { revalidateOnFocus: false },
  );

  const hrefFor = useCallback(
    (next: TabId, leave?: string[]) => {
      const sp = new URLSearchParams();
      if (next !== "overview") sp.set("tab", next);
      if (leave?.length) sp.set("leave", formatLeaveParam(leave));
      const qs = sp.toString();
      return qs ? `${base}/owners?${qs}` : `${base}/owners`;
    },
    [base],
  );

  const replaceParams = useCallback(
    (edit: (sp: URLSearchParams) => void) => {
      const sp = new URLSearchParams(searchParams.toString());
      edit(sp);
      const qs = sp.toString();
      router.replace(qs ? `?${qs}` : "?", { scroll: false });
    },
    [router, searchParams],
  );

  const setTab = useCallback(
    (next: string) =>
      replaceParams((sp) => {
        if (next === "overview") sp.delete("tab");
        else sp.set("tab", next);
        if (next !== "offboarding") for (const p of SCENARIO_PARAMS) sp.delete(p);
      }),
    [replaceParams],
  );

  const setScenario = useCallback(
    (next: OffboardingScenario) =>
      replaceParams((sp) => {
        if (next.leaving.length) sp.set("leave", formatLeaveParam(next.leaving));
        else sp.delete("leave");
        const threshold = formatThresholdParam(next.threshold);
        if (threshold === DEFAULT_THRESHOLD_PARAM) sp.delete("threshold");
        else sp.set("threshold", threshold);
      }),
    [replaceParams],
  );

  const s = summary.data;
  // The people behind the truck factor, as the one-click starting scenario.
  const suggestions = useMemo(() => {
    if (!s?.truck_factor || s.truck_factor > s.concentration.owners.length) return [];
    const owners = s.concentration.owners.slice(0, s.truck_factor);
    return [
      {
        label: t("offboardingSuggestion", { names: owners.map((o) => o.name).join(", ") }),
        keys: owners.map((o) => o.key),
      },
    ];
  }, [s, t]);

  const loadError = (onRetry: () => void, message = t("loadFailed")) => (
    <ApiError
      title={t("loadFailedTitle")}
      message={message}
      retryLabel={tCommon("retry")}
      onRetry={onRetry}
    />
  );
  const withMatrix = (render: (m: KnowledgeMatrix) => ReactNode) =>
    matrix.error
      ? loadError(() => void matrix.mutate(), t("matrixLoadFailed"))
      : matrix.data
        ? render(matrix.data)
        : <TabFallback />;

  return (
    <PageShell icon={<Users />} title={t("title")} description={t("description")}>
      <ViewTabs
        aria-label={t("tabsLabel")}
        tabs={TABS.map((tabId) => ({
          id: tabId,
          label: t(TAB_LABEL_KEYS[tabId]),
          ...(tabId === "loss" && s ? { badge: s.quiet_owners_total } : {}),
        }))}
        value={tab}
        onValueChange={setTab}
      >
        <div className="flex flex-col gap-6 pt-4 sm:gap-8">
          {tab === "overview" && (
            <>
              {summary.error ? (
                loadError(() => void summary.mutate())
              ) : s ? (
                <ContributorsLede summary={s} hrefForTab={hrefFor} LinkComponent={Link} />
              ) : (
                <Skeleton className="h-40 w-full rounded-lg" />
              )}
              <AllContributors repoId={id} automationCount={s?.automation_identities ?? 0} />
            </>
          )}
          {tab === "risks" &&
            withMatrix((m) => <KnowledgeRisksView matrix={m} base={base} LinkComponent={Link} />)}
          {tab === "loss" &&
            (summary.error
              ? loadError(() => void summary.mutate())
              : withMatrix((m) =>
                  s ? (
                    <KnowledgeLossView
                      matrix={m}
                      summary={s}
                      base={base}
                      hrefForPerson={(key) => `${base}/owners/${encodeURIComponent(key)}`}
                      hrefForScenario={(key) => hrefFor("offboarding", [key])}
                      LinkComponent={Link}
                    />
                  ) : (
                    <TabFallback />
                  ),
                ))}
          {tab === "offboarding" &&
            withMatrix((m) => (
              <OffboardingView
                matrix={m}
                scenario={scenario}
                onScenarioChange={setScenario}
                suggestions={suggestions}
                base={base}
                LinkComponent={Link}
              />
            ))}
        </div>
      </ViewTabs>
    </PageShell>
  );
}
