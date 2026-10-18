import { describe, expect, it } from "vitest";

import {
  clearNarrowing,
  INITIAL_FILTERS,
  narrowingCount,
  parseLegacyFilters,
  readFilters,
  serverKey,
  toQuery,
  withFilter,
  withFilters,
  writeFilters,
  type PerformanceFilterState,
} from "../../src/health/performance/query";

const write = (state: PerformanceFilterState, base = "") => {
  const params = new URLSearchParams(base);
  writeFilters(state, params);
  return params;
};

describe("performance view state and its URL", () => {
  it("writes flat parameters, defaults omitted, the context always", () => {
    expect(write(INITIAL_FILTERS).toString()).toBe("ctx=production");
    const state = withFilter(withFilter(INITIAL_FILTERS, "context", "all"), "boundary", "db");
    expect(write(state).toString()).toBe("ctx=all&boundary=db");
  });

  it("round trips every field and leaves the page's own parameters alone", () => {
    const state: PerformanceFilterState = {
      context: "test",
      boundary: "filesystem",
      confidence: "high",
      actionability: "plan_ready",
      proof: "unproven",
      role: "cli",
      sort: "leverage",
      page: 3,
      state: "advisory",
      area: "packages/core",
    };
    const params = write(state, "tab=performance&opportunity=perf1");
    expect(params.get("tab")).toBe("performance");
    expect(params.get("opportunity")).toBe("perf1");
    expect(readFilters(params)).toEqual(state);
  });

  it("keeps the root area, the empty string, through the URL", () => {
    const params = write({ ...INITIAL_FILTERS, area: "" });
    expect(params.has("area")).toBe(true);
    expect(readFilters(params).area).toBe("");
  });

  it("removes a cleared field and the legacy blob on write", () => {
    const params = write(INITIAL_FILTERS, "perf=context%3Dtest&boundary=db&page=4");
    expect(params.has("perf")).toBe(false);
    expect(params.has("boundary")).toBe(false);
    expect(params.has("page")).toBe(false);
  });

  it("reads a link minted with the legacy perf blob", () => {
    const params = new URLSearchParams({ perf: "context=test&boundary=db&offset=40" });
    const state = readFilters(params);
    expect(state.context).toBe("test");
    expect(state.boundary).toBe("db");
    expect(state.page).toBe(1);
    expect(parseLegacyFilters("context=all&offset=240").page).toBe(3);
  });

  it("drops a value the vocabulary does not contain instead of forwarding it", () => {
    const parsed = readFilters(
      new URLSearchParams("ctx=production_tooling&actionability=nonsense&page=-3&state=x"),
    );
    expect(parsed.context).toBe("production");
    expect(parsed.actionability).toBeNull();
    expect(parsed.page).toBe(1);
    expect(parsed.state).toBeNull();
  });

  it("returns to the first page and drops view filters when a server filter moves", () => {
    const viewed = { ...INITIAL_FILTERS, page: 2, state: "advisory" as const, area: "src" };
    const moved = withFilter(viewed, "boundary", "db");
    expect(moved).toMatchObject({ page: 1, state: null, area: null, boundary: "db" });
    // A view filter never refetches, so it keeps the page.
    expect(withFilter(viewed, "state", null).page).toBe(2);
    expect(withFilters(viewed, { proof: "unproven" }).proof).toBe("unproven");
  });

  it("keys the server query on server fields only", () => {
    const viewed = { ...INITIAL_FILTERS, state: "advisory" as const, area: "src" };
    expect(serverKey(viewed)).toBe(serverKey(INITIAL_FILTERS));
    expect(serverKey(withFilter(INITIAL_FILTERS, "proof", "unproven"))).not.toBe(
      serverKey(INITIAL_FILTERS),
    );
  });

  it("asks for summary rows, and for unproven causes or a cold role only when chosen", () => {
    const query = toQuery(INITIAL_FILTERS, { limit: 100 });
    expect(query).toEqual({ context: "production", view: "summary", sort: "rank", limit: 100, offset: 0 });
    expect(toQuery(withFilter(INITIAL_FILTERS, "proof", "unproven"), { limit: 100 }).proof).toBe(
      "unproven",
    );
    expect(toQuery(withFilter(INITIAL_FILTERS, "role", "cli"), { limit: 100 }).role).toBe("cli");
    expect(toQuery({ ...INITIAL_FILTERS, page: 3 }, { limit: 100 }).offset).toBe(200);
  });

  it("sends canonical contexts, and the retired pairing only when told to collapse", () => {
    const production = withFilter(INITIAL_FILTERS, "context", "production");
    expect(toQuery(production, { limit: 20 }).context).toBe("production");
    expect(toQuery(production, { limit: 20, collapseContexts: true }).context).toBe(
      "production_tooling",
    );
    const test = withFilter(INITIAL_FILTERS, "context", "test");
    expect(toQuery(test, { limit: 20, collapseContexts: true }).context).toBe("test");
  });

  it("counts and clears the narrowing filters without touching context", () => {
    let state = withFilter(INITIAL_FILTERS, "context", "test");
    state = withFilter(state, "boundary", "db");
    state = withFilter(state, "actionability", "advisory");
    expect(narrowingCount(state)).toBe(2);
    const cleared = clearNarrowing(state);
    expect(narrowingCount(cleared)).toBe(0);
    expect(cleared.context).toBe("test");
  });
});
