import { SOLAR_CAPACITY_KW, TOTAL_SEATS } from '../data/campus'
import { COMMON_DAY_KW } from './physics'
import type { HeatmapMode, Room, SolarString, Weather } from '../types'
import { smoothstep, sunPosition } from './sun'
import { DEFAULT_TIME } from '../data/tour'

export const WEATHER_FACTOR: Record<Weather, number> = { clear: 1, cloudy: 0.46, rain: 0.24, storm: 0.1 }

const REF_SIN = Math.sin((sunPosition(DEFAULT_TIME).elevation * Math.PI) / 180)

/** [SIMULATED] irradiance scale relative to the 11:30 clear-sky reference. */
export function solarScale(minutes: number, weather: Weather) {
  const el = sunPosition(minutes).elevation
  const s = Math.max(0, Math.sin((el * Math.PI) / 180)) / REF_SIN
  return Math.min(1.12, s) * WEATHER_FACTOR[weather] * smoothstep(-1, 6, el)
}

export function buildingSummary(rooms: Room[], solar: SolarString[], commonKw = COMMON_DAY_KW) {
  const inSession = rooms.filter((r) => r.occupancy > 0)
  const students = inSession.reduce((s, r) => s + r.occupancy, 0)
  const avg = (k: 'co2' | 'temp' | 'humidity') => rooms.reduce((s, r) => s + r[k], 0) / rooms.length
  const solarKw = solar.reduce((s, x) => s + x.outputKw, 0)
  const loadKw = rooms.reduce((s, r) => s + r.energyKw, 0) + commonKw
  return {
    inSession: inSession.length,
    total: rooms.length,
    students,
    utilisation: (students / TOTAL_SEATS) * 100,
    co2: avg('co2'),
    temp: avg('temp'),
    humidity: avg('humidity'),
    solarKw,
    solarEff: (solarKw / SOLAR_CAPACITY_KW) * 100,
    hvacKw: rooms.reduce((s, r) => s + r.hvacKw, 0),
    loadKw,
    netKw: solarKw - loadKw,
  }
}

export const co2Label = (ppm: number) => (ppm < 700 ? 'Optimal' : ppm < 1000 ? 'Moderate' : 'High')

/** Normalised 0–1 metric for heatmaps. */
export function heatValue(room: Room, mode: HeatmapMode) {
  const area = room.rect.w * room.rect.d
  switch (mode) {
    case 'temperature':
      return (room.temp - 20) / 6
    case 'co2':
      return (room.co2 - 420) / 680
    case 'energy':
      return ((room.energyKw * 1000) / area - 4) / 34
    default:
      return 0
  }
}

export const HEATMAP_META: Record<Exclude<HeatmapMode, 'off'>, { label: string; min: string; max: string; unit: string }> = {
  temperature: { label: 'Temperature', min: '20 °C', max: '26 °C', unit: '°C' },
  co2: { label: 'CO₂', min: '420 ppm', max: '1,100 ppm', unit: 'ppm' },
  energy: { label: 'Energy Density', min: '4 W/m²', max: '38 W/m²', unit: 'W/m²' },
}

/** Turbo-like ramp, returns [r,g,b] 0–1. */
export function ramp(t: number): [number, number, number] {
  const x = Math.min(1, Math.max(0, t))
  const stops: [number, [number, number, number]][] = [
    [0, [0.15, 0.35, 0.95]],
    [0.25, [0.02, 0.71, 0.83]],
    [0.5, [0.06, 0.73, 0.51]],
    [0.75, [0.96, 0.62, 0.04]],
    [1, [0.96, 0.25, 0.37]],
  ]
  for (let i = 1; i < stops.length; i++) {
    if (x <= stops[i][0]) {
      const [t0, c0] = stops[i - 1]
      const [t1, c1] = stops[i]
      const k = (x - t0) / (t1 - t0)
      return [c0[0] + (c1[0] - c0[0]) * k, c0[1] + (c1[1] - c0[1]) * k, c0[2] + (c1[2] - c0[2]) * k]
    }
  }
  return stops[stops.length - 1][1]
}

export const rampCss = (t: number) => {
  const [r, g, b] = ramp(t)
  return `rgb(${Math.round(r * 255)} ${Math.round(g * 255)} ${Math.round(b * 255)})`
}
