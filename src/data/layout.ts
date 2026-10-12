import type { PlanRect } from '../types'

/**
 * SCAS block plan, in metres. +x is east, -z is north.
 * [SOURCE-DERIVED] traced from the satellite view (≈0.14 m per pixel) and site photographs:
 * a long north bar running west, a north-east block around an elongated light-well, the east
 * entrance wing facing the road, and a south block around the square checkerboard courtyard.
 * The north-east and south blocks are separated by an open service strip, joined by the east wing.
 */
export const FLOOR_HEIGHT = 4
export const SLAB = 0.35
export const FLOOR_NAMES = ['F1', 'F2', 'F3'] as const
export const GROUND_Y = -1.2

/** Footprint outline (clockwise, [x, z]). */
export const FOOTPRINT: [number, number][] = [
  [-61.6, -44.8],
  [5, -44.8],
  [5, -49],
  [62.4, -49],
  [62.4, 46.2],
  [5, 46.2],
  [5, -11.2],
  [48.4, -11.2],
  [48.4, -16.8],
  [5, -16.8],
  [5, -22.4],
  [-61.6, -22.4],
]

/** Open-air wells: [0] elongated north light-well, [1] square central courtyard. */
export const COURTYARDS: PlanRect[] = [
  { x: 19, z: -37, w: 26, d: 9 },
  { x: 19, z: 11.9, w: 21, d: 21 },
]

export const ENVELOPE = { minX: -61.6, maxX: 62.4, minZ: -49, maxZ: 46.2 }

/** Stair / lift cores in the east wing. */
export const CORES: PlanRect[] = [
  { x: 52, z: -46, w: 6, d: 6 },
  { x: 52, z: 0, w: 6, d: 6 },
  { x: 52, z: 38, w: 6, d: 6 },
]

/** 16 teaching spaces per floor (index 0 → x03, index 5 → x45 on F2 = Cyber Security Lab). */
export function floorRoomRects(): PlanRect[] {
  const r = (x0: number, z0: number, x1: number, z1: number): PlanRect => ({ x: x0, z: z0, w: x1 - x0, d: z1 - z0 })
  return [
    // north bar, north row
    r(-61.6, -44.8, -39.4, -35.1),
    r(-39.4, -44.8, -17.2, -35.1),
    r(-17.2, -44.8, 5, -35.1),
    // north bar, south row
    r(-61.6, -32.1, -28.3, -22.4),
    r(-28.3, -32.1, 5, -22.4),
    // south block, north rooms (Room 345 sits here on the satellite map)
    r(5, -11.2, 26.7, 5.9),
    r(26.7, -11.2, 48.4, 5.9),
    // north-east block around the light-well
    r(5, -49, 26.7, -40),
    r(26.7, -49, 48.4, -40),
    r(5, -37, 16, -28),
    r(5, -25, 26.7, -16.8),
    r(26.7, -25, 48.4, -16.8),
    // south block, west strip and south rooms
    r(5, 8.9, 16, 27.5),
    r(5, 27.5, 16, 46.2),
    r(16, 35.9, 32.2, 46.2),
    r(32.2, 35.9, 48.4, 46.2),
  ]
}

export const CORRIDORS: PlanRect[] = [
  { x: -61.6, z: -35.1, w: 66.6, d: 3 },
  { x: 5, z: -40, w: 43.4, d: 3 },
  { x: 16, z: -28, w: 32.4, d: 3 },
  { x: 16, z: -37, w: 3, d: 9 },
  { x: 45, z: -37, w: 3.4, d: 9 },
  { x: 5, z: 5.9, w: 43.4, d: 6 },
  { x: 16, z: 11.9, w: 3, d: 24 },
  { x: 40, z: 11.9, w: 8.4, d: 24 },
  { x: 16, z: 32.9, w: 32.4, d: 3 },
  { x: 48.4, z: -49, w: 3, d: 95.2 },
]

export const rectCenter = (r: PlanRect): [number, number] => [r.x + r.w / 2, r.z + r.d / 2]

/** Entrance portico on the east facade, facing the approach road. */
export const PORTICO = {
  x0: 62.4,
  x1: 70,
  z0: -27.5,
  z1: -8.5,
  pillarsZ: [-27, -18, -9],
  pillarX: 69.2,
  height: 4.8,
}

export const ASSEMBLY_POINT: [number, number, number] = [71, GROUND_Y + 0.05, 30]

/* ------------------------------------------------------------------ geometry helpers */

export function inRect(x: number, z: number, r: PlanRect) {
  return x > r.x && x < r.x + r.w && z > r.z && z < r.z + r.d
}

function inPoly(x: number, z: number, poly: [number, number][]) {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i]
    const [xj, zj] = poly[j]
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside
  }
  return inside
}

/** True when a plan point lies inside the built floor plate (footprint minus open wells). */
export function inSolid(x: number, z: number) {
  return inPoly(x, z, FOOTPRINT) && !COURTYARDS.some((c) => inRect(x, z, c))
}

export interface EdgeSeg {
  axis: 'x' | 'z'
  fixed: number
  a0: number
  a1: number
  /** Outward direction along the normal axis (+1 / -1). */
  out: number
  well: boolean
}

/** Axis-aligned perimeter segments of the floor plate, each with its outward normal. */
export function perimeterSegments(): EdgeSeg[] {
  const segs: EdgeSeg[] = []
  const push = (ax: number, az: number, bx: number, bz: number, well: boolean) => {
    const axis: 'x' | 'z' = az === bz ? 'x' : 'z'
    const fixed = axis === 'x' ? az : ax
    const a0 = Math.min(axis === 'x' ? ax : az, axis === 'x' ? bx : bz)
    const a1 = Math.max(axis === 'x' ? ax : az, axis === 'x' ? bx : bz)
    const mid = (a0 + a1) / 2
    const probe = (s: number) => (axis === 'x' ? inSolid(mid, fixed + s * 0.3) : inSolid(fixed + s * 0.3, mid))
    segs.push({ axis, fixed, a0, a1, out: probe(1) ? -1 : 1, well })
  }
  FOOTPRINT.forEach(([x, z], i) => {
    const [nx, nz] = FOOTPRINT[(i + 1) % FOOTPRINT.length]
    push(x, z, nx, nz, false)
  })
  for (const c of COURTYARDS) {
    push(c.x, c.z, c.x + c.w, c.z, true)
    push(c.x + c.w, c.z, c.x + c.w, c.z + c.d, true)
    push(c.x + c.w, c.z + c.d, c.x, c.z + c.d, true)
    push(c.x, c.z + c.d, c.x, c.z, true)
  }
  return segs
}
