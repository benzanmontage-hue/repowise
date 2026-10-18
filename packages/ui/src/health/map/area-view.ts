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

type Screen = { x: number; y: number; r: number };

/** One frame's walk: the input, and the view it fills in. */
interface Walk {
  input: ViewInput;
  out: FieldView;
}

/** Draw a host's dots when they are dense enough; true when drawn. */
function tryHost(w: Walk, key: string): boolean {
  const i = w.input.hostIndex.get(key);
  if (i === undefined) return false;
  const h = w.input.hosts[i]!;
  if (!dense(h.circle.r * w.input.cam.scale, h.nodes.length)) return false;
  w.out.drawnHosts[i] = 1;
  return true;
}

/**
 * Record what this area needs loaded. Returns whether its files are covered
 * for the areas below it, so only the shallowest dense area is fetched.
 */
function noteWants(w: Walk, path: string, s: Screen, covered: boolean): boolean {
  const { index, view } = w.input;
  const area = index.areas.get(path)!;
  const big = s.r >= OPEN_PX;
  if (big && area.hasChildren && !index.expanded.has(path)) w.out.wantChildren.push(path);
  if (covered || w.input.filesCovered(path)) return true;
  // Judged on the part of the disc the canvas shows: a disc far larger than
  // the screen spreads its files over space nobody is looking at.
  if (big && area.fileCount <= MAX_AREA_FILES && dense(s.r, area.fileCount, view.w * view.h)) {
    w.out.wantFiles.push(path);
    return true;
  }
  return false;
}

/** An area's own-files slot beside its sub-areas: dots when dense, else a quiet disc. */
function visitSlot(w: Walk, path: string): void {
  const slot = w.input.geo.slots.get(path);
  if (!slot || tryHost(w, `d:${path}`)) return;
  const ss = toScreen(slot, w.input.cam, w.input.view);
  if (ss.r >= MIN_AREA_PX && !offscreen(ss, w.input.view)) w.out.discs.push({ path, ...ss, state: "slot" });
}

function visit(w: Walk, path: string, covered: boolean): void {
  const { index, geo, cam, view } = w.input;
  const circle = geo.circles.get(path);
  if (!circle || !index.areas.has(path)) return;
  const s = toScreen(circle, cam, view);
  if (s.r < MIN_AREA_PX || offscreen(s, view)) return;

  const below = noteWants(w, path, s, covered);
  const kids = index.expanded.has(path) ? displayChildren(index, path) : [];
  const leafFiles = kids.length === 0 && (tryHost(w, `d:${path}`) || tryHost(w, `w:${path}`));
  const open = path === ROOT_AREA || (s.r >= OPEN_PX && kids.length > 0) || leafFiles;
  w.out.discs.push({ path, ...s, state: open ? "open" : "closed" });
  if (!open || kids.length === 0) return;
  for (const k of kids) visit(w, k, below);
  visitSlot(w, path);
}

export function computeView(input: ViewInput): FieldView {
  const out: FieldView = {
    discs: [],
    drawnHosts: new Uint8Array(input.hosts.length),
    wantChildren: [],
    wantFiles: [],
  };
  visit({ input, out }, ROOT_AREA, false);
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
