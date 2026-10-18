import { cn } from "../lib/cn";
import {
  betterCount,
  healthDeltaKind,
  worseCount,
  type HealthDeltaCounts,
  type HealthDeltaKind,
} from "./health-delta";

export type HealthDeltaLabels = Record<HealthDeltaKind | "notCompared" | "partial", string>;

const DEFAULT_LABELS: HealthDeltaLabels = {
  improved: "Better",
  worsened: "Worse",
  mixed: "Mixed",
  neutral: "No change",
  notCompared: "Not compared",
  partial: "Part of this change was not compared",
};

/** Green only for a real improvement, red only for a regression; a mixed or
 *  neutral result stays plain so colour keeps meaning one thing. */
const DOT: Record<HealthDeltaKind, string> = {
  improved: "bg-[var(--color-success)]",
  worsened: "bg-[var(--color-error)]",
  mixed: "bg-[var(--color-border-hover)]",
  neutral: "",
};

const TEXT: Record<HealthDeltaKind, string> = {
  improved: "text-[var(--color-success)]",
  worsened: "text-[var(--color-error)]",
  mixed: "text-[var(--color-text-primary)]",
  neutral: "text-[var(--color-text-tertiary)]",
};

export interface HealthDeltaMarkProps {
  /** Null when the commit or change was never compared, which is not the
   *  same claim as "changed nothing". */
  delta: HealthDeltaCounts | null | undefined;
  /** Words for each state; packages/ui has no i18n, so hosts pass their own. */
  labels?: Partial<HealthDeltaLabels>;
  className?: string;
}

/**
 * What a change did to code health, as a dot, a word and the signed finding
 * counts behind it ("Better +3", "Worse -2", "Mixed +3 -1"). A neutral result
 * renders quietly: it is the default state, not something to mark.
 */
export function HealthDeltaMark({ delta, labels, className }: HealthDeltaMarkProps) {
  const l = { ...DEFAULT_LABELS, ...labels };
  if (!delta) {
    return (
      <span className={cn("text-xs text-[var(--color-text-tertiary)]", className)}>
        {l.notCompared}
      </span>
    );
  }
  const kind = healthDeltaKind(delta);
  const better = betterCount(delta);
  const worse = worseCount(delta);
  const partial = delta.status === "partial";
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 whitespace-nowrap text-xs", TEXT[kind], className)}
      title={partial ? l.partial : undefined}
    >
      {kind !== "neutral" && (
        <span aria-hidden className={cn("h-1.5 w-1.5 shrink-0 rounded-full", DOT[kind])} />
      )}
      <span className={kind === "neutral" ? undefined : "font-medium"}>
        {l[kind]}
        {partial && <span aria-hidden>*</span>}
      </span>
      {kind !== "neutral" && (
        <span className="font-mono tabular-nums">
          {better > 0 && `+${better}`}
          {better > 0 && worse > 0 && " "}
          {worse > 0 && `−${worse}`}
        </span>
      )}
      {partial && <span className="sr-only">{l.partial}</span>}
    </span>
  );
}
