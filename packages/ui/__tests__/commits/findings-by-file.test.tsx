import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { CommitHealthFinding } from "@repowise-dev/types/git";
import { groupFindingsByFile } from "../../src/commits/health-delta";
import { FindingsByFile } from "../../src/commits/findings-by-file";

const f = (path: string, symbol: string, line: number, over: Partial<CommitHealthFinding> = {}): CommitHealthFinding => ({
  change_kind: "introduced",
  dimension: "defect",
  biomarker_type: "complex_method",
  severity: "medium",
  path,
  symbol,
  line_start: line,
  attribution_basis: "added_lines",
  reason: `${symbol} is complex`,
  ...over,
});

describe("groupFindingsByFile", () => {
  it("keeps files in the order of their worst finding", () => {
    const groups = groupFindingsByFile([f("b.py", "x", 1), f("a.py", "y", 2), f("b.py", "z", 3)]);
    expect(groups.map((g) => [g.path, g.findings.length])).toEqual([
      ["b.py", 2],
      ["a.py", 1],
    ]);
  });
});

describe("FindingsByFile", () => {
  const findings = [
    f("src/one/mod.py", "run", 10),
    f("src/two/mod.py", "walk", 20, { attribution_basis: "touched_file" }),
    f("src/c.py", "c", 3),
    f("src/d.py", "d", 4),
    f("src/e.py", "e", 5),
  ];

  it("names each file by its shortest distinct path and each finding by symbol and line", () => {
    render(<FindingsByFile findings={findings} fileAction={(g) => <button>prompt {g.path}</button>} />);
    expect(screen.getByTitle("src/one/mod.py").textContent).toBe("one/mod.py");
    expect(screen.getByText("run · L10")).toBeTruthy();
    expect(screen.getByText(/file touched, not a line it wrote/)).toBeTruthy();
    expect(screen.getByText("prompt src/one/mod.py")).toBeTruthy();
  });

  it("folds files past the first three behind one disclosure", () => {
    render(<FindingsByFile findings={findings} />);
    expect(screen.getByText("Show 2 more files").closest("details")).toBeTruthy();
    expect(screen.getByTitle("src/e.py").closest("details")).toBeTruthy();
    expect(screen.getByTitle("src/c.py").closest("details")).toBeNull();
  });
});
