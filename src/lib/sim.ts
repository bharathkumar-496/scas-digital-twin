import { INITIAL_ROOMS, POWER_SCALE, STREETLIGHTS } from '../data/campus'
import { store } from '../state/store'
import type { Room } from '../types'
import { buildingSummary, solarScale } from './metrics'
import { calibrate, COMMON_DAY_KW, COMMON_NIGHT_KW, type Context, outdoorTemp, schedule, stepRoom } from './physics'
import { nightFactor, sunPosition } from './sun'

/**
 * [SIMULATED] One live model drives every number in the app. Each second:
 * timetable + fire drill → occupancy → heat, CO₂ and humidity → VRF response → room and building power.
 * Room controls (setpoint, mode, fan, device switches), the time slider, weather and the AI pass all feed in.
 */

const TICK_MS = 1000
const HISTORY = 60
const cal = new Map(INITIAL_ROOMS.map((r) => [r.id, calibrate(r)]))

const roomHistory = new Map<string, { temp: number[]; humidity: number[]; co2: number[]; energy: number[] }>()
const buildingHistory = { students: [] as number[], solar: [] as number[], load: [] as number[], co2: [] as number[] }

const push = (arr: number[], v: number) => {
  arr.push(v)
  if (arr.length > HISTORY) arr.shift()
}

export const getRoomHistory = (id: string) => roomHistory.get(id)
export const getBuildingHistory = () => buildingHistory

/** Occupancy at the moment the alarm sounded, so each room drains in step with the evacuation counter. */
let drillSnapshot: Map<string, number> | null = null

function targetOccupancy(r: Room, minutes: number) {
  const base = cal.get(r.id)!.baseOcc
  const fire = store.get().fire
  if (fire.phase !== 'idle') {
    if (fire.phase === 'complete') return 0
    const start = drillSnapshot?.get(r.id) ?? r.occupancy
    return Math.round(start * (1 - (fire.total ? fire.evacuated / fire.total : 0)))
  }
  return Math.round(base * schedule(minutes))
}

function nextOccupancy(r: Room, minutes: number) {
  const target = targetOccupancy(r, minutes)
  const fire = store.get().fire.phase !== 'idle'
  if (fire) return Math.min(r.occupancy, target)
  let occ = r.occupancy
  // people arrive or leave a few at a time
  if (occ < target) occ = Math.min(target, occ + 1 + Math.floor(Math.random() * 3))
  else if (occ > target) occ = Math.max(target, occ - 1 - Math.floor(Math.random() * 3))
  else if (target > 0 && Math.random() < 0.2) occ = Math.min(r.capacity, Math.max(0, occ + (Math.random() < 0.5 ? -1 : 1)))
  return occ
}

function context(): Context {
  const s = store.get()
  return {
    tOut: outdoorTemp(s.time, s.weather),
    solar: solarScale(s.time, s.weather),
    aiApplied: s.ai === 'applied',
    fireMode: s.fire.phase === 'alarm' || s.fire.phase === 'evacuating',
  }
}

function commonLoad(minutes: number) {
  const night = nightFactor(sunPosition(minutes).elevation)
  const lights = STREETLIGHTS.reduce((s, l) => s + l.powerW, 0) / 1000
  const occupied = schedule(minutes)
  return COMMON_NIGHT_KW + (COMMON_DAY_KW - COMMON_NIGHT_KW) * Math.max(occupied, 0.15) + lights * night
}

function solarOutputs() {
  const s = store.get()
  const scale = solarScale(s.time, s.weather)
  return s.solar.map((x) => {
    const out = x.referenceKw * scale * (1 + (Math.random() - 0.5) * 0.01)
    return { ...x, outputKw: out, current: (out * 1000) / x.voltage }
  })
}

function tick(dt: number) {
  const s = store.get()
  const ctx = context()
  const rooms = s.rooms.map((r) => {
    const next = stepRoom({ ...r, occupancy: nextOccupancy(r, s.time) }, cal.get(r.id)!, ctx, dt, POWER_SCALE)
    let h = roomHistory.get(r.id)
    if (!h) roomHistory.set(r.id, (h = { temp: [], humidity: [], co2: [], energy: [] }))
    push(h.temp, next.temp)
    push(h.humidity, next.humidity)
    push(h.co2, next.co2)
    push(h.energy, next.energyKw)
    return next
  })
  const solar = solarOutputs()
  const commonKw = commonLoad(s.time)
  const m = buildingSummary(rooms, solar, commonKw)
  push(buildingHistory.students, m.students)
  push(buildingHistory.solar, m.solarKw)
  push(buildingHistory.load, m.loadKw)
  push(buildingHistory.co2, m.co2)
  store.set({ rooms, solar, commonKw, outdoorTemp: ctx.tOut })
}

export function startSimulation() {
  let prev = store.get()
  let busy = false
  const unsub = store.subscribe(() => {
    if (busy) return
    const s = store.get()
    const p = prev
    busy = true
    try {
      const patch: Parameters<typeof store.set>[0] = {}
      // Sliders respond immediately rather than waiting for the next step.
      if (s.time !== p.time || s.weather !== p.weather) {
        Object.assign(patch, { solar: solarOutputs(), commonKw: commonLoad(s.time), outdoorTemp: outdoorTemp(s.time, s.weather) })
      }
      if (s.ai === 'analysing' && p.ai !== 'analysing') patch.aiBaselineKw = buildingSummary(s.rooms, s.solar, s.commonKw).loadKw
      if (s.fire.phase !== 'idle' && p.fire.phase === 'idle') drillSnapshot = new Map(p.rooms.map((r) => [r.id, r.occupancy]))
      if (s.fire.phase === 'idle') drillSnapshot = null
      // The evacuation counter moves every 120 ms; rooms drain in step with it.
      if (s.fire.phase !== 'idle' && (s.fire.evacuated !== p.fire.evacuated || s.fire.phase !== p.fire.phase)) {
        patch.rooms = s.rooms.map((r) => ({ ...r, occupancy: nextOccupancy(r, s.time) }))
      }
      if (Object.keys(patch).length) store.set(patch)
    } finally {
      busy = false
      prev = store.get()
    }
  })
  tick(1)
  const id = window.setInterval(() => tick(TICK_MS / 1000), TICK_MS)
  return () => {
    window.clearInterval(id)
    unsub()
  }
}
