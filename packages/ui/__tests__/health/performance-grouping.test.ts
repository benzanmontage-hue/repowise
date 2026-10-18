import { describe, expect, it } from "vitest";

import {
  actionabilityCounts,
  areaGroups,
  excludedReviews,
  visibleItems,
} from "../../src/health/performance/grouping";
import { verdictOf } from "../../src/health/performance/verdict";
import { opportunity } from "./fixtures/performance";

const at = (id: string, file_path: string, state: "plan_ready" | "advisory" | "investigate", rank: number) =>
  opportunity({ opportunity_id: id, file_path, actionability_state: state, rank_position: rank });

const items = [
  at("a", "pkg/core/a.py", "advisory", 0),
  at("b", "pkg/server/b.py", "plan_ready", 1),
  at("c", "pkg/core/c.py", "advisory", 2),
  at("d", "pkg/web/d.py", "investigate", 3),
];

describe("performance grouping", () => {
  it("counts the loaded result by actionability", () => {
    expect(actionabilityCounts(items)).toEqual({ plan_ready: 1, advisory: 2, investigate: 1, expected: 0 });
  });

  it("ranks areas by plan-ready, then advisory, keeping the server order inside", () => {
    const groups = areaGroups(items);
    expect(groups.map((g) => g.area)).toEqual(["pkg/server", "pkg/core", "pkg/web"]);
    expect(groups[1]!.items.map((i) => i.opportunity_id)).toEqual(["a", "c"]);
  });

  it("narrows by state and by an area at any depth", () => {
    expect(visibleItems(items, "advisory").map((i) => i.opportunity_id)).toEqual(["a", "c"]);
    expect(visibleItems(items, null, "pkg/core").map((i) => i.opportunity_id)).toEqual(["a", "c"]);
    expect(visibleItems(items, "plan_ready", "pkg/core")).toEqual([]);
  });

  it("turns left-out counts into review links, largest first, zeros dropped", () => {
    const reviews = excludedReviews({ test: 5, unmeasured_cost: 9, cold_path: 0, no_strategy: 2 });
    expect(reviews.map((r) => [r.reason, r.count])).toEqual([
      ["unmeasured_cost", 9],
      ["test", 5],
      ["no_strategy", 2],
    ]);
    expect(reviews[0]!.patch).toEqual({ proof: "unproven" });
    expect(reviews[1]!.patch).toEqual({ context: "test" });
    expect(excludedReviews(undefined)).toEqual([]);
  });

  it("leads with the changes worth making and where they concentrate", () => {
    const verdict = verdictOf(items, areaGroups(items));
    expect(verdict.value).toBe(3);
    expect(verdict.unit).toBe("changes worth making now");
    expect(verdict.sentence).toBe("Concentrated in 2 areas, led by pkg/server.");
    const one = [items[0]!];
    expect(verdictOf(one, areaGroups(one)).sentence).toBe("All in pkg/core.");
    const review = [items[3]!];
    expect(verdictOf(review, areaGroups(review)).unit).toBe("cause to review");
  });
});
