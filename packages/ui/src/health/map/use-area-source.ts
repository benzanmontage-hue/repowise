"use client";

/**
 * The area hierarchy and its files, loaded as the reader zooms.
 *
 * The root and two levels below it arrive first. After that the map asks for
 * what its view needs ({@link AreaSource.request}): the children of an area
 * big enough to open, and the complete file list of the shallowest area dense
 * enough to show files. A deep link reveals its area by unfolding the path
 * to it. Every request is made once; a loaded area's files cover everything
 * under it.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AreaTree } from "@repowise-dev/types/areas";
import type { HealthMapFeed } from "@repowise-dev/types/health";

import { ROOT_AREA } from "../../lib/areas";
import { EMPTY_AREA_INDEX, mergeAreaTree, type AreaIndex } from "./areas";
import { isWithin } from "./area-paths";
import type { CodeHealthMapFile } from "./types";
import type { Wants } from "./use-field-canvas";

export interface AreaFetchers {
  getAreaTree: (root: string, depth: number) => Promise<AreaTree>;
  getAreaFiles: (area: string) => Promise<HealthMapFeed>;
}

export interface AreaSource {
  index: AreaIndex;
  files: readonly CodeHealthMapFile[];
  /** Whether an area's files are loaded or on their way, its own or an ancestor's. */
  filesCovered: (path: string) => boolean;
  request: (wants: Wants) => void;
  /** Unfold the hierarchy down to `path`, for a deep link or a selection. */
  reveal: (path: string) => void;
  /** The first level has not arrived yet. */
  loading: boolean;
  error: unknown;
  retry: () => void;
}

/** Levels fetched per unfold: the children and one level below, so the next opening is ready. */
const UNFOLD_DEPTH = 2;
/** Levels fetched per step of a reveal, the most the server serves. */
const REVEAL_DEPTH = 4;

const coveredBy = (set: ReadonlySet<string>, path: string) => {
  for (const a of set) if (isWithin(path, a)) return true;
  return false;
};

/** The deepest area the index knows on the way to `path`. */
function deepestKnown(index: AreaIndex, path: string): string {
  let known = ROOT_AREA;
  const parts = path.split("/").filter(Boolean);
  for (let i = 1; i <= parts.length; i++) {
    const p = parts.slice(0, i).join("/");
    if (index.areas.has(p)) known = p;
    else break;
  }
  return known;
}

export function useAreaSource(fetchers: AreaFetchers | null, cacheKey: string): AreaSource {
  const [index, setIndex] = useState<AreaIndex>(EMPTY_AREA_INDEX);
  const [fileMap, setFileMap] = useState<ReadonlyMap<string, CodeHealthMapFile>>(new Map());
  const [error, setError] = useState<unknown>(null);
  const [target, setTarget] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const unfolded = useRef(new Set<string>());
  const fileAreas = useRef(new Set<string>());
  const [covered, setCovered] = useState<ReadonlySet<string>>(new Set());
  const fetchRef = useRef(fetchers);
  fetchRef.current = fetchers;
  // Bumped on reset, so a response for the previous repository is dropped.
  const generation = useRef(0);

  const unfold = useCallback((root: string, depth: number) => {
    const f = fetchRef.current;
    const key = `${root}\u0000${depth}`;
    if (!f || unfolded.current.has(key)) return;
    unfolded.current.add(key);
    const gen = generation.current;
    f.getAreaTree(root, depth).then(
      (tree) => {
        if (gen === generation.current) setIndex((prev) => mergeAreaTree(prev, tree));
      },
      (err) => {
        if (gen !== generation.current) return;
        unfolded.current.delete(key);
        if (root === ROOT_AREA) setError(err);
      },
    );
  }, []);

  const loadFiles = useCallback((area: string) => {
    const f = fetchRef.current;
    if (!f || coveredBy(fileAreas.current, area)) return;
    fileAreas.current.add(area);
    setCovered(new Set(fileAreas.current));
    const gen = generation.current;
    f.getAreaFiles(area).then(
      (feed) =>
        gen === generation.current &&
        setFileMap((prev) => {
          const next = new Map(prev);
          for (const row of feed.files as CodeHealthMapFile[]) next.set(row.file_path, row);
          return next;
        }),
      () => {
        if (gen !== generation.current) return;
        fileAreas.current.delete(area);
        setCovered(new Set(fileAreas.current));
      },
    );
  }, []);

  // A new repository or reading starts from nothing.
  useEffect(() => {
    generation.current += 1;
    unfolded.current = new Set();
    fileAreas.current = new Set();
    setIndex(EMPTY_AREA_INDEX);
    setFileMap(new Map());
    setCovered(new Set());
    setError(null);
    unfold(ROOT_AREA, UNFOLD_DEPTH);
  }, [cacheKey, attempt, unfold]);

  // Walk a reveal down, one response at a time, until the area is known and
  // unfolded or the index says it does not exist.
  useEffect(() => {
    if (target === null || !index.areas.has(ROOT_AREA)) return;
    const known = deepestKnown(index, target);
    if (known === target) {
      if (!index.expanded.has(target)) unfold(target, UNFOLD_DEPTH);
      setTarget(null);
    } else if (index.expanded.has(known) && unfolded.current.has(`${known}\u0000${REVEAL_DEPTH}`)) {
      setTarget(null);
    } else {
      unfold(known, REVEAL_DEPTH);
    }
  }, [target, index, unfold]);

  const request = useCallback(
    (wants: Wants) => {
      for (const path of wants.children) unfold(path, UNFOLD_DEPTH);
      for (const path of wants.files) loadFiles(path);
    },
    [unfold, loadFiles],
  );

  const files = useMemo(() => [...fileMap.values()], [fileMap]);
  const filesCovered = useCallback((path: string) => coveredBy(covered, path), [covered]);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  return {
    index,
    files,
    filesCovered,
    request,
    reveal: setTarget,
    loading: !index.areas.has(ROOT_AREA) && error == null,
    error,
    retry,
  };
}
