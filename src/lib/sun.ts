import { FACILITY } from '../data/campus'

const RAD = Math.PI / 180
const IST_MERIDIAN = 82.5

export interface SunPosition {
  /** Elevation above horizon, degrees. */
  elevation: number
  /** Azimuth clockwise from true north, degrees. */
  azimuth: number
  /** Unit vector toward the sun in scene space (+x east, +y up, -z north). */
  dir: [number, number, number]
}

function dayOfYear(d: Date) {
  const start = Date.UTC(d.getFullYear(), 0, 0)
  return Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - start) / 86400000)
}

/**
 * [REAL] NOAA-style low-precision solar position for the SCAS site.
 * `minutes` is local IST clock time (0–1440) on the given date.
 */
export function sunPosition(minutes: number, date = new Date()): SunPosition {
  const n = dayOfYear(date)
  const g = ((2 * Math.PI) / 365) * (n - 1 + (minutes / 60 - 12) / 24)
  const eot =
    229.18 *
    (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g))
  const decl =
    0.006918 -
    0.399912 * Math.cos(g) +
    0.070257 * Math.sin(g) -
    0.006758 * Math.cos(2 * g) +
    0.000907 * Math.sin(2 * g) -
    0.002697 * Math.cos(3 * g) +
    0.00148 * Math.sin(3 * g)

  const solarMinutes = minutes + eot + 4 * (FACILITY.lon - IST_MERIDIAN)
  const ha = (solarMinutes / 4 - 180) * RAD
  const lat = FACILITY.lat * RAD

  const cosZen = Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(ha)
  const zen = Math.acos(Math.min(1, Math.max(-1, cosZen)))
  const elevation = 90 - zen / RAD

  let az = Math.acos(
    Math.min(1, Math.max(-1, (Math.sin(decl) - Math.sin(lat) * cosZen) / (Math.cos(lat) * Math.sin(zen) || 1e-6))),
  )
  if (ha > 0) az = 2 * Math.PI - az
  const azimuth = az / RAD

  const el = elevation * RAD
  return {
    elevation,
    azimuth,
    dir: [Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)],
  }
}

export const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/** 0 = full day, 1 = full night, from sun elevation. */
export const nightFactor = (elevation: number) => 1 - smoothstep(-5, 7, elevation)

export function formatMinutes(m: number) {
  const h = Math.floor(m / 60) % 24
  const mm = Math.floor(m % 60)
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}

export function formatClock12(d: Date) {
  return d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true }).toUpperCase()
}
