"use client";

/**
 * The keyboard model: one tab stop reaches the whole field. Arrows move over
 * what is inside the selected area (its sub-areas, then its own files once
 * they are loaded), Enter opens the area or the file under the cursor,
 * Backspace climbs one level and Escape returns to the repository. The
 * alternative is a tab stop per node, which is thousands.
 *
 * Escape and Backspace are consumed only while the focus is inside the field
 * and there is somewhere to climb to: the map listens on the window in the
 * capture phase and stops the key there, so one press never both climbs and
 * closes something behind the map. A key the map has no use for passes on.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, RefObject } from "react";

import { ROOT_AREA } from "../../lib/areas";
import type { AreaIndex } from "./areas";
import { displayChildren, displayParent } from "./area-paths";
import type { FieldScene } from "./paint";
import { ZOOM_STEP, type MapCamera } from "./use-map-camera";

export type CursorItem = { kind: "area"; path: string } | { kind: "file"; path: string };

/** Step `i` forward or back around a ring of `n`. */
const cycle = (i: number, n: number, forward: boolean) =>
  n === 0 ? 0 : (i + (forward ? 1 : n - 1)) % n;

/** What the cursor walks inside `area`: sub-areas biggest first, then own files. */
export function cursorItems(index: AreaIndex, scene: FieldScene, area: string): CursorItem[] {
  const items: CursorItem[] = displayChildren(index, area).map((path) => ({ kind: "area", path }));
  const host = scene.hosts.find((h) => h.area === area && h.direct);
  if (host) for (const i of host.nodes) items.push({ kind: "file", path: scene.nodes[i]!.file.file_path });
  return items;
}

/** Where the keyboard cursor is, and whether it is in use. */
export function useKeyboardCursor(index: AreaIndex, scene: FieldScene, area: string) {
  const items = useMemo(() => cursorItems(index, scene, area), [index, scene, area]);
  const [pos, setPos] = useState(0);
  // Drawn only while the field has keyboard focus, so a reader using a
  // pointer never sees a ring that answers to keys they are not using.
  const [focused, setFocused] = useState(false);
  useEffect(() => setPos(0), [area]);
  const item = items[Math.min(pos, items.length - 1)] ?? null;
  return { items, item, setPos, focused, setFocused };
}

export type KeyboardCursor = ReturnType<typeof useKeyboardCursor>;

export function useMapKeyboard(opts: {
  container: RefObject<HTMLElement | null>;
  kb: KeyboardCursor;
  index: AreaIndex;
  area: string;
  camera: MapCamera;
  onSelectArea: (path: string) => void;
  onSelectFile: (path: string) => void;
}) {
  const { container, kb, index, area, camera, onSelectArea, onSelectFile } = opts;

  const onKeyDown = useCallback(
    (e: ReactKeyboardEvent) => {
      const forward = e.key === "ArrowRight" || e.key === "ArrowDown";
      const back = e.key === "ArrowLeft" || e.key === "ArrowUp";
      if (e.key === "+" || e.key === "=") camera.zoomBy(ZOOM_STEP);
      else if (e.key === "-" || e.key === "_") camera.zoomBy(1 / ZOOM_STEP);
      else if (e.key === "0") onSelectArea(ROOT_AREA);
      else if (forward || back) kb.setPos((i) => cycle(i, kb.items.length, forward));
      else if (e.key === "Enter" && kb.item) {
        if (kb.item.kind === "area") onSelectArea(kb.item.path);
        else onSelectFile(kb.item.path);
      } else return;
      e.preventDefault();
    },
    [camera, kb, onSelectArea, onSelectFile],
  );

  const climb = useRef({ area, parent: displayParent(index, area) });
  climb.current = { area, parent: displayParent(index, area) };
  const selectRef = useRef(onSelectArea);
  selectRef.current = onSelectArea;
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" && e.key !== "Backspace") return;
      const node = container.current;
      if (!node || !(e.target instanceof Node) || !node.contains(e.target)) return;
      // A text field inside the map keeps its own Backspace.
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const { area: here, parent } = climb.current;
      if (here === ROOT_AREA) return;
      e.stopPropagation();
      e.preventDefault();
      selectRef.current(e.key === "Escape" ? ROOT_AREA : (parent ?? ROOT_AREA));
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [container]);

  return onKeyDown;
}
