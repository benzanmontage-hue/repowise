/**
 * Every area's and every file's colour under one lens, as pure functions.
 *
 * An area takes its rollup's reading when the lens has one, else the fold of
 * whatever of its files are loaded, else the neutral. A file takes the lens's
 * own reading, or, for an area-only lens, the colour of the disc it sits in.
 */

import { ROOT_AREA, dirOf } from "../../lib/areas";
import type { AreaIndex } from "./areas";
import type { FieldScene } from "./paint";
import { NEUTRAL_FILL, type MapLens } from "./lens";
import type { CodeHealthMapFile } from "./types";

/** Loaded files grouped under every area that contains them. */
function filesByArea(
  index: AreaIndex,
  files: readonly CodeHealthMapFile[],
): Map<string, CodeHealthMapFile[]> {
  const out = new Map<string, CodeHealthMapFile[]>();
  for (const f of files) {
    let dir: string | null = dirOf(f.file_path);
    for (;;) {
      if (index.areas.has(dir)) {
        const list = out.get(dir);
        if (list) list.push(f);
        else out.set(dir, [f]);
      }
      if (dir === ROOT_AREA) break;
      dir = dirOf(dir);
    }
  }
  return out;
}

export function areaFills(
  index: AreaIndex,
  lens: MapLens,
  files: readonly CodeHealthMapFile[],
): Map<string, string> {
  const out = new Map<string, string>();
  const needsFiles =
    lens.areaFromFiles !== undefined &&
    [...index.areas.values()].some((a) => (lens.areaFill?.(a) ?? null) === null);
  const byArea = needsFiles ? filesByArea(index, files) : null;
  for (const a of index.areas.values()) {
    const fromRollup = lens.areaFill?.(a) ?? null;
    if (fromRollup !== null) {
      out.set(a.path, fromRollup);
      continue;
    }
    const loaded = byArea?.get(a.path);
    out.set(a.path, loaded && lens.areaFromFiles ? lens.areaFromFiles(loaded) : NEUTRAL_FILL);
  }
  return out;
}

export function fileFills(
  scene: FieldScene,
  lens: MapLens,
  areaFill: ReadonlyMap<string, string>,
): string[] {
  return scene.nodes.map((n, i) => {
    if (lens.fill) return lens.fill(n.file);
    const host = scene.hosts[scene.hostOfNode[i]!];
    return (host && areaFill.get(host.area)) ?? NEUTRAL_FILL;
  });
}
