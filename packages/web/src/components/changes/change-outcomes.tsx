import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { OverviewSection } from "@repowise-dev/ui/overview";
import type { EvidenceItem } from "@repowise-dev/types/changes";
import { evidenceValueText } from "@/lib/changes";

type Row = Record<string, unknown>;

const LINK = "text-[var(--color-accent-primary)] hover:underline";

/** What later history says about the change, in the later commits' own words. */
export async function ChangeOutcomes({ item, repoId }: { item: EvidenceItem; repoId: string }) {
  const t = await getTranslations("views.changes");
  if (item.status === "unknown") {
    return (
      <OverviewSection title={t("detailOutcomes")}>
        <p className="text-xs text-[var(--color-text-tertiary)]">{evidenceValueText(t, item)}</p>
      </OverviewSection>
    );
  }
  const rows = item.details as Row[];
  const links = rows.filter((r) => r.kind === "revert" || r.kind === "fix_reference");
  const rate = rows.find((r) => r.kind === "file_fix_rate");
  const later = (r: Row) => {
    const sha = String(r.sha ?? "").slice(0, 12);
    const id = typeof r.change_id === "string" ? r.change_id : null;
    if (!id) {
      return (
        <Link href={`/repos/${repoId}/commits?commit=${encodeURIComponent(String(r.sha ?? ""))}`} className={`font-mono ${LINK}`}>
          {sha}
        </Link>
      );
    }
    return (
      <Link href={`/repos/${repoId}/changes/${encodeURIComponent(id)}`} className={LINK}>
        {id} <span className="font-mono">{sha}</span>
      </Link>
    );
  };
  return (
    <OverviewSection title={t("detailOutcomes")} description={t("outcomesNote")}>
      <ul className="space-y-2 text-xs text-[var(--color-text-secondary)]">
        {links.length === 0 && <li>{t("outcomesNone")}</li>}
        {links.map((r) => (
          <li key={`${String(r.kind)}-${String(r.sha)}`} className="space-y-0.5">
            <div className="text-[var(--color-text-primary)]">
              {r.kind === "revert" ? t("outcomesRevertedBy") : t("outcomesCause")} {later(r)}
              {r.kind === "revert" && r.in_force === false && (
                <span className="text-[var(--color-text-tertiary)]"> ({t("outcomesNoLongerInForce")})</span>
              )}
            </div>
            <blockquote className="border-l-2 border-[var(--color-border-default)] pl-2">
              {String(r.evidence ?? "")}
            </blockquote>
          </li>
        ))}
        {rate && (
          <li>
            {t("outcomesFileRate", {
              fixed: Number(rate.files_fixed),
              total: Number(rate.files),
              days: Number(rate.days),
            })}
            {rate.window_complete === false && (
              <span className="text-[var(--color-text-tertiary)]"> ({t("outcomesWindowOpen")})</span>
            )}
          </li>
        )}
      </ul>
    </OverviewSection>
  );
}
