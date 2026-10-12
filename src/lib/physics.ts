import type { Room, Weather } from '../types'

/**
 * [SIMULATED] Lumped thermal / IAQ / power model shared by every view.
 * One real second advances the model by one step; time constants are compressed so a setpoint
 * change visibly moves the room temperature within a minute.
 */

const COP = 3.6
const HEAT_CAPACITY = 0.4 // kJ/K per m², compressed
const UA_PER_M2 = 0.0022 // envelope conductance, kW/K per m²
const COOL_PER_M2 = 0.14 // VRF cooling capacity, kW per m²
const CONTROL_GAIN = 0.03 // proportional VRF control, kW per K per m²
const PERSON_KW = 0.075 // sensible gain per occupant
const PLUG_PER_PERSON = 0.025
const LAB_BASE_PER_M2 = 0.004
const LIGHT_PER_M2 = 0.007
const CO2_PER_PERSON = 0.17 // ppm/s per occupant
const DEVICE_KW: Record<string, number> = { projector: 0.32, display: 0.14, wifi: 0.02, sensor: 0.005, camera: 0.012, vrf: 0 }
const FAN_FACTOR = [0, 0.55, 0.8, 1] as const

export const OUTDOOR_CO2 = 420
export const SETBACK_C = 26
export const COMMON_DAY_KW = 18
export const COMMON_NIGHT_KW = 7.5

export const area = (r: Room) => r.rect.w * r.rect.d

/** Chennai dry-bulb, peaking mid-afternoon; rain and storms cool the air. */
export function outdoorTemp(minutes: number, weather: Weather) {
  const h = minutes / 60
  const base = 28.6 + 3.6 * Math.sin((2 * Math.PI * (h - 9)) / 24)
  return base - ({ clear: 0, cloudy: 1, rain: 2.6, storm: 3.6 } as const)[weather]
}

/** Teaching timetable: 0 → 1 between 08:00–09:00, lunch dip, empty after 17:30. */
export function schedule(minutes: number) {
  const h = minutes / 60
  if (h < 8 || h >= 17.5) return 0
  if (h < 9) return h - 8
  if (h >= 16.5) return 17.5 - h
  if (h >= 12.75 && h < 13.75) return 0.55
  return 1
}

export interface Context {
  tOut: number
  solar: number
  aiApplied: boolean
  /** Fire alarm: VRF and fresh-air units are shut down to stop smoke spreading. */
  fireMode: boolean
}

const deviceOn = (r: Room, id: string, fallback: boolean) => r.deviceOn[id] ?? fallback

export function lightingKw(r: Room, c: Context) {
  if (r.occupancy > 0) return area(r) * LIGHT_PER_M2
  return c.aiApplied ? 0 : area(r) * LIGHT_PER_M2 * 0.35
}

export function plugKw(r: Room, c: Context) {
  let kw = r.occupancy * PLUG_PER_PERSON
  if (r.type === 'lab') kw += area(r) * LAB_BASE_PER_M2 * (c.aiApplied && r.occupancy === 0 ? 0.3 : 1)
  for (const d of r.devices) if (deviceOn(r, d.id, d.status !== 'standby')) kw += DEVICE_KW[d.kind] ?? 0
  return kw
}

/** Effective setpoint after AI setback of vacant rooms. */
export const effectiveSetpoint = (r: Room, c: Context) => (c.aiApplied && r.occupancy === 0 ? Math.max(r.setpoint, SETBACK_C) : r.setpoint)

export function thermalGain(r: Room, c: Context) {
  const a = area(r)
  return r.occupancy * PERSON_KW + (plugKw(r, c) + lightingKw(r, c)) * 0.9 + a * UA_PER_M2 * (c.tOut - r.temp) + a * 0.0015 * c.solar
}

/** Cooling delivered (kW thermal) and VRF electrical draw (kW). */
export function hvac(r: Room, c: Context, gain = thermalGain(r, c)) {
  if (!r.acOn || c.fireMode || !deviceOn(r, `VRF-${r.number}`, true)) return { q: 0, kw: 0 }
  const a = area(r)
  const sp = effectiveSetpoint(r, c)
  const err = r.temp - sp
  const fan = r.acMode === 'auto' ? (err > 1.5 ? 3 : err > 0.4 ? 2 : 1) : r.fan
  const fanKw = 0.05 * fan
  if (r.acMode === 'fan') return { q: 0, kw: fanKw }
  const qMax = a * COOL_PER_M2 * FAN_FACTOR[fan] * (r.acMode === 'dry' ? 0.5 : 1)
  const q = Math.min(qMax, Math.max(0, gain + a * CONTROL_GAIN * err))
  return { q, kw: q / COP + fanKw }
}

export interface RoomCal {
  baseOcc: number
  vent: number
  rhOffset: number
  noise: number
}

/** Per-room constants that make the published snapshot an equilibrium of the model. */
export function calibrate(r: Room): RoomCal {
  const excess = r.co2 - OUTDOOR_CO2
  const vent = r.occupancy > 0 && excess > 20 ? Math.min(0.12, Math.max(0.008, (r.occupancy * CO2_PER_PERSON) / excess)) : 0.03
  return { baseOcc: r.occupancy, vent, rhOffset: r.humidity - humidityTarget(r, true), noise: r.noise }
}

function humidityTarget(r: Room, cooling: boolean) {
  if (!cooling) return 66
  return (r.acMode === 'dry' ? 46 : 50) + (r.capacity ? (r.occupancy / r.capacity) * 6 : 0)
}

/** Advances one room by dt seconds. */
export function stepRoom(r: Room, cal: RoomCal, c: Context, dt: number, powerScale: number): Room {
  const gain = thermalGain(r, c)
  const { q, kw } = hvac(r, c, gain)
  const a = area(r)
  const temp = r.temp + ((gain - q) / (a * HEAT_CAPACITY)) * dt + (Math.random() - 0.5) * 0.02
  const vent = cal.vent * (c.fireMode ? 0.25 : 1) * (c.aiApplied && r.co2 > 800 ? 1.6 : 1)
  const co2 = r.co2 + (r.occupancy * CO2_PER_PERSON - vent * (r.co2 - OUTDOOR_CO2)) * dt + (Math.random() - 0.5) * 3
  const cooling = q > 0.05
  const rhT = humidityTarget(r, cooling) + (cooling ? cal.rhOffset : 0)
  const humidity = r.humidity + (rhT - r.humidity) * 0.03 * dt + (Math.random() - 0.5) * 0.2
  const noiseT = r.occupancy > 0 ? cal.noise * (0.75 + 0.25 * Math.min(1, r.occupancy / Math.max(1, cal.baseOcc))) : 31 + (kw > 0 ? 3 : 0)
  const noise = r.noise + (noiseT - r.noise) * 0.2 * dt + (Math.random() - 0.5) * 0.8
  const hvacKw = kw * powerScale
  const energyKw = (kw + lightingKw(r, c) + plugKw(r, c)) * powerScale
  return { ...r, temp, co2: Math.max(OUTDOOR_CO2, co2), humidity: Math.min(90, Math.max(25, humidity)), noise, hvacKw, energyKw }
}

/** Electrical draw at the current state without advancing it (used for calibration). */
export function roomPower(r: Room, c: Context) {
  return hvac(r, c).kw + lightingKw(r, c) + plugKw(r, c)
}
