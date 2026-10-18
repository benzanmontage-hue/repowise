"use client";

import { useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  formatLeaveParam,
  formatThresholdParam,
  parseLeaveParam,
  parseThresholdParam,
} from "@repowise-dev/ui/owners/offboarding";
import type { OffboardingScenario } from "@repowise-dev/ui/owners/offboarding-view";

export const CONTRIBUTOR_TABS = ["overview", "risks", "loss", "offboarding"] as const;
export type ContributorTab = (typeof CONTRIBUTOR_TABS)[number];

/** Params that belong to the off-boarding tab and must not ride along elsewhere. */
const SCENARIO_PARAMS = ["leave", "threshold"];
const DEFAULT_THRESHOLD_PARAM = formatThresholdParam(parseThresholdParam(null));

function parseTab(raw: string | null): ContributorTab {
  return (CONTRIBUTOR_TABS as readonly string[]).includes(raw ?? "") ? (raw as ContributorTab) : "overview";
}

/** A Contributors URL: a tab and, for off-boarding, who is leaving. */
export function contributorsHref(base: string, tab: ContributorTab, leave?: string[]): string {
  const sp = new URLSearchParams();
  if (tab !== "overview") sp.set("tab", tab);
  if (leave?.length) sp.set("leave", formatLeaveParam(leave));
  const qs = sp.toString();
  return qs ? `${base}/owners?${qs}` : `${base}/owners`;
}

/**
 * The Contributors page's URL state: `?tab=` and the off-boarding scenario
 * (`?leave=a,b&threshold=50`). The scenario is parsed off the raw strings so
 * its array keeps one identity between renders and the simulation memo holds.
 */
export function useContributorsUrl() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = parseTab(searchParams.get("tab"));
  const rawLeave = searchParams.get("leave");
  const rawThreshold = searchParams.get("threshold");
  const scenario = useMemo<OffboardingScenario>(
    () => ({ leaving: parseLeaveParam(rawLeave), threshold: parseThresholdParam(rawThreshold) }),
    [rawLeave, rawThreshold],
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

  return { tab, scenario, setTab, setScenario };
}
