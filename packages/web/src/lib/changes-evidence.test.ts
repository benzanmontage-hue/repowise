import { describe, expect, it } from "vitest";
import { createTranslator } from "next-intl";
import type { ChangeRecord, EvidenceItem } from "@repowise-dev/types/changes";
import {
  type ChangesTranslator,
  changeHealthFromEvidence,
  changePromptInput,
  splitEvidence,
} from "./changes";
import en from "../../messages/en.json";
import zhCN from "../../messages/zh-CN.json";

function ev(kind: string, status: EvidenceItem["status"], over: Partial<EvidenceItem> = {}): EvidenceItem {
  return { kind, label: kind, status, basis: "inferred", value: null, details: [], source: "s", ...over };
}

const worseRow = {
  change: "introduced",
  dimension: "defect",
  biomarker_type: "complex_method",
  severity: "medium",
  severity_before: null,
  path: "src/a.py",
  symbol: "run",
  line_start: 10,
  line_end: 40,
  attribution_basis: "added_lines",
  reason: "run has cyclomatic complexity 9",
};

const health = (value: Record<string, unknown>, details: Record<string, unknown>[] = []) =>
  ev("health_delta", "attention", { basis: "measured", value, details });

describe("splitEvidence", () => {
  it("leaves health, outcomes and provenance to their own places and lists exceptions first", () => {
    const view = splitEvidence([
      ev("owners", "ok"),
      ev("components_touched", "unknown"),
      ev("decisions_crossed", "attention"),
      health({ introduced: 1, worsened: 0, resolved: 0, complete: true }),
      ev("provenance", "unknown"),
      ev("outcomes", "ok"),
    ]);
    expect(view.health?.kind).toBe("health_delta");
    expect(view.outcomes?.kind).toBe("outcomes");
    expect(view.exceptions.map((i) => i.kind)).toEqual(["decisions_crossed", "components_touched"]);
    expect(view.passed.map((i) => i.kind)).toEqual(["owners"]);
  });
});

describe("changeHealthFromEvidence", () => {
  it("is null when health was not compared, never clean", () => {
    expect(changeHealthFromEvidence(undefined)).toBeNull();
    expect(changeHealthFromEvidence(ev("health_delta", "unknown"))).toBeNull();
  });

  it("reads counts, partial status and findings in the commit view's shape", () => {
    const h = changeHealthFromEvidence(
      health({ introduced: 1, worsened: 0, resolved: 3, complete: false }, [worseRow, { note: "skipped x" }]),
    )!;
    expect(h.counts).toEqual({ introduced: 1, worsened: 0, resolved: 3, status: "partial" });
    expect(h.findings).toHaveLength(1);
    expect(h.findings[0]).toMatchObject({ change_kind: "introduced", line_start: 10, attribution_basis: "added_lines" });
  });

  it("reads a row kept before rows carried a basis as unknown, never as direct", () => {
    const { attribution_basis: _, line_start: __, ...old } = worseRow;
    const h = changeHealthFromEvidence(health({ introduced: 1, worsened: 0, resolved: 0, complete: true }, [old]))!;
    expect(h.findings[0]).toMatchObject({ attribution_basis: "unknown", line_start: null });
  });
});

describe.each([
  ["en", en],
  ["zh-CN", zhCN],
])("changePromptInput in %s", (locale, messages) => {
  const t = createTranslator({ locale, messages, namespace: "views.changes" }) as unknown as ChangesTranslator;
  const change = {
    id: "pr-7",
    forge_ref: "#7",
    title: "feat: x",
    head_sha: "a".repeat(40),
    commits: ["a".repeat(40)],
    files: [{ path: "src/a.py", added: 3, deleted: 1 }],
  } as ChangeRecord;

  it("carries the findings and words the flagged rows", () => {
    const h = changeHealthFromEvidence(health({ introduced: 1, worsened: 0, resolved: 2, complete: true }, [worseRow]));
    const input = changePromptInput(t, change, h, [
      ev("decisions_crossed", "attention", { line: { key: "decisions_crossed", params: { accepted: 2, candidate: 0 } } }),
    ]);
    expect(input).toMatchObject({ label: "#7", files: ["src/a.py"], resolved: 2, complete: true });
    expect(input.findings).toHaveLength(1);
    expect(input.attention[0]).not.toMatch(/[{}]|evidenceKinds/);
  });
});
