/**
 * Semantic zoom, decided once per frame: which areas are one solid disc,
 * which are open rings showing what is inside, which hosts paint their file
 * dots, and what the field should load next.
 *
 * Zoomed out, an area is one disc in its own colour. It opens when it is big
 * enough on screen to hold something legible: its sub-areas once it clears
 * {@link OPEN_PX}, its files once each one would get {@link FILE_DENSITY_PX2}
 * of screen. Below {@link MIN_AREA_PX} it is not drawn at all; its parent's
 * colour already says what it would.
 *
 * Pure: a camera, a box and the laid-out field in, a plain view out.
 */

import { ROOT_AREA } from "../../lib/areas";
import type { AreaIndex } from "./areas";
import type { AreaGeometry, Circle, Host } from "./area-layout";
import { displayChildren } from "./area-paths";
import type { Cam, View } from "./paint";

/** An area this small on screen is left to its parent's disc. */
export const MIN_AREA_PX = 3;
/** Screen radius at which an area opens to show its sub-areas. */
export const OPEN_PX = 90;
/** Screen area each file needs before an area's files are drawn. */
export const FILE_DENSITY_PX2 = 140;
/** Largest area whose files are fetched in one request (the server's cap). */
export const MAX_AREA_FILES = 8000;
/** Pan slack, so discs just off screen are ready when they slide in. */
const MARGIN_PX = 48;

export type DiscState = "open" | "closed" | "slot";

export interface DiscView {
  path: string;
  /** Screen centre and radius, in CSS px. */
  x: number;
  y: number;
  r: number;
  state: DiscState;
}

export interface FieldView {
  /** Outer discs first, so a child paints over its parent. */
  discs: DiscView[];
  /** Per host: 1 when its file dots are drawn this frame. */
  drawnHosts: Uint8Array;
  /** Areas on screen and big enough to open whose children are not known yet. */
  wantChildren: string[];
  /** The shallowest areas dense enough on screen to show files not loaded yet. */
  wantFiles: string[];
}

export interface ViewInput {
  index: AreaIndex;
  geo: AreaGeometry;
  hosts: readonly Host[];
  /** Host key -> index into `hosts`. */
  hostIndex: ReadonlyMap<string, number>;
  /** Areas whose complete file list is loaded or on its way (covers descendants). */
  filesCovered: (path: string) => boolean;
  cam: Cam;
  view: View;
}

function toScreen(c: Circle, cam: Cam, view: View): { x: number; y: number; r: number } {
  return {
    x: view.w / 2 + (c.x - cam.cx) * cam.scale,
    y: view.h / 2 + (c.y - cam.cy) * cam.scale,
    r: c.r * cam.scale,
  };
}

const offscreen = (s: { x: number; y: number; r: number }, view: View) =>
  s.x + s.r < -MARGIN_PX ||
  s.y + s.r < -MARGIN_PX ||
  s.x - s.r > view.w + MARGIN_PX ||
  s.y - s.r > view.h + MARGIN_PX;

const dense = (screenR: number, files: number, cap = Infinity) =>
  files > 0 && Math.min(Math.PI * screenR * screenR, cap) / files >= FILE_DENSITY_PX2;

export function computeView(input: ViewInput): FieldView {
  const { index, geo, hosts, cam, view } = input;
  const hostAt = input.hostIndex;
  const out: FieldView = {
    discs: [],
    drawnHosts: new Uint8Array(hosts.length),
    wantChildren: [],
    wantFiles: [],
  };

  /** Draw a host's dots when they are dense enough; true when drawn. */
  const tryHost = (key: string): boolean => {
    const i = hostAt.get(key);
    if (i === undefined) return false;
    const h = hosts[i]!;
    if (!dense(h.circle.r * cam.scale, h.nodes.length)) return false;
    out.drawnHosts[i] = 1;
    return true;
  };

  const visit = (path: string, covered: boolean) => {
    const circle = geo.circles.get(path);
    const area = index.areas.get(path);
    if (!circle || !area) return;
    const s = toScreen(circle, cam, view);
    if (s.r < MIN_AREA_PX || offscreen(s, view)) return;

    const expanded = index.expanded.has(path);
    const big = s.r >= OPEN_PX;
    if (big && area.hasChildren && !expanded) out.wantChildren.push(path);
    const isCovered = covered || input.filesCovered(path);
    // Judged on the part of the disc the canvas shows: a disc far larger than
    // the screen spreads its files over space nobody is looking at.
    const onScreen = view.w * view.h;
    if (!isCovered && big && area.fileCount <= MAX_AREA_FILES && dense(s.r, area.fileCount, onScreen)) {
      out.wantFiles.push(path);
    }
    const passCovered = isCovered || out.wantFiles[out.wantFiles.length - 1] === path;

    const kids = expanded ? displayChildren(index, path) : [];
    const slot = geo.slots.get(path);
    const leafFiles = kids.length === 0 && (tryHost(`d:${path}`) || tryHost(`w:${path}`));
    const open = path === ROOT_AREA || (big && kids.length > 0) || leafFiles;
    out.discs.push({ path, ...s, state: open ? "open" : "closed" });
    if (!open) return;

    for (const k of kids) visit(k, passCovered);
    if (slot && kids.length > 0 && !tryHost(`d:${path}`)) {
      const ss = toScreen(slot, cam, view);
      if (ss.r >= MIN_AREA_PX && !offscreen(ss, view)) out.discs.push({ path, ...ss, state: "slot" });
    }
  };

  visit(ROOT_AREA, false);
  return out;
}

/** The innermost disc under a screen point, or null. */
export function discAt(view: FieldView, x: number, y: number): DiscView | null {
  for (let i = view.discs.length - 1; i >= 0; i--) {
    const d = view.discs[i]!;
    if (Math.hypot(x - d.x, y - d.y) <= d.r) return d;
  }
  return null;
}
