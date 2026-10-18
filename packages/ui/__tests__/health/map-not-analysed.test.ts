/**
 * A file a lens has no signal for is not analysed, under every lens: grey,
 * left out of every folder's fold, never read as the worst value. And a
 * folder folds by share, so size alone never paints it red.
 */
import { describe, it, expect } from "vitest";
import { deriveAreaIndex, type AreaIndex } from "../../src/health/map/areas.js";
import { layoutAreas, layoutFiles } from "../../src/health/map/area-layout.js";
import { areaFills, fileFills } from "../../src/health/map/fills.js";
import { buildScene } from "../../src/health/map/paint.js";
import { KNOWLEDGE_LENS, ownerLens } from "../../src/health/map/area-lenses.js";
import { OVERLAY_SPECS } from "../../src/health/map/lens-registry.js";
import { CLEAR_NEUTRAL_FILL, NEUTRAL_FILL, QUIET_FILL, type MapLens } from "../../src/health/map/lens.js";
import { NODE_RAMP_STOP } from "../../src/health/tokens.js";
import type { CodeHealthMapFile } from "../../src/health/map/types.js";
import { mapFile as f } from "./map-test-utils.js";

/** A file with every lens's signal absent. */
const bare = (path: string): CodeHealthMapFile => ({
  file_path: path,
  nloc: 40,
  score: null,
  module: null,
  line_coverage_pct: null,
  has_test_file: false,
});

function paint(lens: MapLens, files: CodeHealthMapFile[]) {
  const index = deriveAreaIndex(files);
  const scene = buildScene(layoutFiles(files, index, layoutAreas(index)));
  const { fill, analysed } = areaFills(index, lens, files);
  return { index, fill, analysed, files: fileFills(scene, lens, fill) };
}

const FILE_LENSES = ["health", "maintainability", "performance", "coverage", "churn", "dead-code", "security"] as const;

describe("not analysed is grey, under every lens", () => {
  for (const id of FILE_LENSES) {
    it(`${id}: a file without the signal, and a folder of only such files`, () => {
      const { fill, files, analysed } = paint(OVERLAY_SPECS[id], [bare("pkg/a.py"), bare("pkg/b.py")]);
      expect(files.every((x) => x === NEUTRAL_FILL)).toBe(true);
      if (!OVERLAY_SPECS[id].areaFill) expect(fill.get("pkg")).toBe(NEUTRAL_FILL);
      expect(analysed.get("pkg")).toEqual({ analysed: 0, loaded: 2 });
    });
  }

  it("main author and knowledge risk: an area with no ownership signal is not coloured", () => {
    const index: AreaIndex = deriveAreaIndex([bare("pkg/a.py")]);
    const pkg = index.areas.get("pkg")!;
    expect(ownerLens(index).areaFill!(pkg)).toBeNull();
    expect(KNOWLEDGE_LENS.areaFill!(pkg)).toBe(NEUTRAL_FILL);
    expect(areaFills(index, KNOWLEDGE_LENS, []).fill.get("pkg")).toBe(NEUTRAL_FILL);
  });
});

describe("performance folds by share over analysed files", () => {
  const analysed = (path: string, causes: number) =>
    f(path, 40, null, { performance_analyzed: true, performance_opportunities: causes });

  it("a big folder with a few causes is not painted worst", () => {
    // packages/core: 78 of 1,527 analysed files carry a cause (5%).
    const files = [
      ...Array.from({ length: 95 }, (_, i) => analysed(`core/f${i}.py`, 0)),
      ...Array.from({ length: 5 }, (_, i) => analysed(`core/c${i}.py`, 3)),
    ];
    const { fill } = paint(OVERLAY_SPECS.performance, files);
    expect(fill.get("core")).toBe(NODE_RAMP_STOP.warning);
  });

  it("leaves unanalysed files out of the share and grey", () => {
    const files = [analysed("core/c.py", 2), ...Array.from({ length: 30 }, (_, i) => bare(`core/u${i}.py`))];
    const { fill, analysed: counts } = paint(OVERLAY_SPECS.performance, files);
    // One analysed file, and it has a cause: the share is of what was analysed.
    expect(fill.get("core")).toBe(NODE_RAMP_STOP.alert);
    expect(counts.get("core")).toEqual({ analysed: 1, loaded: 31, flagged: 1 });
  });

  it("tells a checked, clear folder from an unchecked one, without claiming fast", () => {
    const { fill, analysed: counts } = paint(OVERLAY_SPECS.performance, [analysed("core/a.py", 0)]);
    expect(fill.get("core")).toBe(CLEAR_NEUTRAL_FILL);
    expect(fill.get("core")).not.toBe(NEUTRAL_FILL);
    expect(counts.get("core")).toEqual({ analysed: 1, loaded: 1, flagged: 0 });
  });

  it("dead code and security call a checked, clean folder clean", () => {
    for (const [id, row] of [
      ["dead-code", { dead_code_lines: 0 }],
      ["security", { security_findings: 0 }],
    ] as const) {
      const { fill } = paint(OVERLAY_SPECS[id], [f("lib/a.py", 40, null, row)]);
      expect(fill.get("lib")).toBe(QUIET_FILL);
    }
  });
});
