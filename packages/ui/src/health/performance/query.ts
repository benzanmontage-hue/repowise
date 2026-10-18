import { PERFORMANCE_EXECUTION_ROLES } from "@repowise-dev/types/health";
import type {
  PerformanceActionabilityState,
  PerformanceContextFilter,
  PerformanceCostProof,
  PerformanceExecutionRole,
  PerformanceOpportunityConfidence,
  PerformanceOpportunityQuery,
} from "@repowise-dev/types/health";

/**
 * The tab's view state, its server query, and its round trip to the URL.
 *
 * Two kinds of field. The server fields (context, the narrowing filters,
 * sort, page) decide which causes exist, so changing one is a refetch. The
 * view fields (`state`, `area`) narrow the loaded result on the client, which
 * is honest because the tab loads the whole result in one page whenever it
 * fits, and says so when it does not.
 */

export type PerformanceSort = NonNullable<PerformanceOpportunityQuery["sort"]>;

export interface PerformanceFilterState {
  context: PerformanceContextFilter;
  boundary: string | null;
  confidence: PerformanceOpportunityConfidence | null;
  /** A server-side state filter, set by the "left out" review links. */
  actionability: PerformanceActionabilityState | null;
  proof: PerformanceCostProof | null;
  role: PerformanceExecutionRole | "all" | null;
  sort: PerformanceSort;
  /** 1-based page of `PAGE_SIZE` causes. */
  page: number;
  /** The actionability segment shown, over the loaded result. */
  state: PerformanceActionabilityState | null;
  /** One area opened on its own, every cause in it listed. */
  area: string | null;
}

/** The server's page ceiling: a default queue fits in one page almost always. */
export const PAGE_SIZE = 100;

/**
 * Production is the default view. Most of what the analysis finds sits in
 * tests, benchmarks and CI scripts, and "this benchmark repeats work" is a
 * fact about a benchmark rather than work to schedule.
 */
export const INITIAL_FILTERS: PerformanceFilterState = {
  context: "production",
  boundary: null,
  confidence: null,
  actionability: null,
  proof: null,
  role: null,
  sort: "rank",
  page: 1,
  state: null,
  area: null,
};

/** The server filters behind "More filters", apart from context. */
export const NARROWING_KEYS = ["boundary", "confidence", "actionability", "proof", "role"] as const;
export type NarrowingKey = (typeof NARROWING_KEYS)[number];

const SORTS: readonly PerformanceSort[] = ["rank", "leverage", "observations"];
const CONFIDENCES: readonly PerformanceOpportunityConfidence[] = ["high", "medium", "low"];
const ACTIONABILITIES: readonly PerformanceActionabilityState[] = [
  "plan_ready",
  "advisory",
  "investigate",
  "expected",
];
const PROOFS: readonly PerformanceCostProof[] = ["proven", "unproven", "background_unproven"];
const ROLES: readonly (PerformanceExecutionRole | "all")[] = ["all", ...PERFORMANCE_EXECUTION_ROLES];
const CONTEXTS: readonly PerformanceContextFilter[] = [
  "all",
  "production",
  "tooling",
  "test",
  "unknown",
];

/**
 * Build the server query. Rows use the `summary` view: it carries what a row
 * is acted on by (fix, gain, effort) and leaves plan steps and validation to
 * the drawer's detail fetch. `collapseContexts` is set only when the server
 * predates the canonical vocabulary, and is the one place the retired
 * `production_tooling` spelling may be emitted.
 */
export function toQuery(
  state: PerformanceFilterState,
  options: { limit: number; collapseContexts?: boolean },
): PerformanceOpportunityQuery {
  const context =
    options.collapseContexts && (state.context === "production" || state.context === "tooling")
      ? ("production_tooling" as const)
      : state.context;
  const query: PerformanceOpportunityQuery = {
    context,
    view: "summary",
    sort: state.sort,
    limit: options.limit,
    offset: (state.page - 1) * options.limit,
  };
  if (state.boundary) query.boundary = state.boundary;
  if (state.confidence) query.confidence = state.confidence;
  if (state.actionability) query.actionability = state.actionability;
  if (state.proof) query.proof = state.proof;
  if (state.role) query.role = state.role;
  return query;
}

/**
 * The URL parameters this tab owns, flat beside the page's own. `ctx` is
 * always written: a link that omits it would be read under whatever the
 * default is when it is opened. Every other default is omitted.
 */
const PARAM = {
  context: "ctx",
  boundary: "boundary",
  confidence: "confidence",
  actionability: "actionability",
  proof: "proof",
  role: "role",
  sort: "sort",
  page: "page",
  state: "state",
  area: "area",
} as const satisfies Record<keyof PerformanceFilterState, string>;

/** The retired single-parameter blob, still read so old links open. */
export const LEGACY_PARAM = "perf";

/** A stable string for the server half of the state: the queue's cache key. */
export function serverKey(state: PerformanceFilterState): string {
  return [
    state.context,
    ...NARROWING_KEYS.map((key) => state[key] ?? ""),
    state.sort,
    state.page,
  ].join("|");
}

/** Write the state onto `params` in place, removing defaults and the legacy blob. */
export function writeFilters(state: PerformanceFilterState, params: URLSearchParams): void {
  params.delete(LEGACY_PARAM);
  params.set(PARAM.context, state.context);
  for (const key of [...NARROWING_KEYS, "state", "area"] as const) {
    const value = state[key];
    if (value) params.set(PARAM[key], value);
    else params.delete(PARAM[key]);
  }
  if (state.sort !== INITIAL_FILTERS.sort) params.set(PARAM.sort, state.sort);
  else params.delete(PARAM.sort);
  if (state.page > 1) params.set(PARAM.page, String(state.page));
  else params.delete(PARAM.page);
}

function oneOf<T extends string>(value: string | null, allowed: readonly T[]): T | null {
  return value && (allowed as readonly string[]).includes(value) ? (value as T) : null;
}

function positive(value: string | null): number | null {
  const n = Number.parseInt(value ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** The server half of the state, from any parameter spelling. */
function serverFields(params: URLSearchParams, contextParam: string) {
  return {
    context: oneOf(params.get(contextParam), CONTEXTS) ?? INITIAL_FILTERS.context,
    boundary: params.get("boundary") || null,
    confidence: oneOf(params.get("confidence"), CONFIDENCES),
    actionability: oneOf(params.get("actionability"), ACTIONABILITIES),
    proof: oneOf(params.get("proof"), PROOFS),
    role: oneOf(params.get("role"), ROLES),
    sort: oneOf(params.get("sort"), SORTS) ?? INITIAL_FILTERS.sort,
  };
}

/**
 * Read the state back from the page's parameters. An unrecognized value falls
 * back to the default rather than reaching the server, so a hand-edited link
 * cannot make the queue look empty. A link minted before the flat schema
 * carries everything in `perf`, and is read from there.
 */
export function readFilters(params: URLSearchParams): PerformanceFilterState {
  const legacy = params.get(LEGACY_PARAM);
  if (legacy !== null && !params.has(PARAM.context)) return parseLegacyFilters(legacy);
  return {
    ...serverFields(params, PARAM.context),
    page: positive(params.get(PARAM.page)) ?? 1,
    state: oneOf(params.get(PARAM.state), ACTIONABILITIES),
    area: params.get(PARAM.area) ?? null,
  };
}

/** The pre-flat `perf=context%3D...%26offset%3D40` blob. */
export function parseLegacyFilters(blob: string): PerformanceFilterState {
  const params = new URLSearchParams(blob);
  const offset = positive(params.get("offset")) ?? 0;
  return {
    ...INITIAL_FILTERS,
    ...serverFields(params, "context"),
    page: Math.floor(offset / PAGE_SIZE) + 1,
  };
}

/**
 * Change one field. A server filter returns to the first page and drops the
 * view filters, whose values may not exist in the new result.
 */
export function withFilter<K extends keyof PerformanceFilterState>(
  state: PerformanceFilterState,
  key: K,
  value: PerformanceFilterState[K],
): PerformanceFilterState {
  if (key === "page" || key === "state" || key === "area") return { ...state, [key]: value };
  return withFilters(state, { [key]: value });
}

/** Apply several server filters as one change. */
export function withFilters(
  state: PerformanceFilterState,
  patch: Partial<PerformanceFilterState>,
): PerformanceFilterState {
  return { ...state, ...patch, page: 1, state: null, area: null };
}

export function clearNarrowing(state: PerformanceFilterState): PerformanceFilterState {
  return withFilters(state, {
    boundary: null,
    confidence: null,
    actionability: null,
    proof: null,
    role: null,
  });
}

export function narrowingCount(state: PerformanceFilterState): number {
  return NARROWING_KEYS.filter((key) => state[key] !== null).length;
}
