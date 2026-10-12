import type {
  CameraNode,
  CampusAlert,
  FloorId,
  Room,
  RoomDevice,
  RoomType,
  SolarString,
  Streetlight,
} from '../types'
import { floorRoomRects, GROUND_Y } from './layout'
import { COMMON_DAY_KW, hvac, outdoorTemp, roomPower } from '../lib/physics'

export const FACILITY = {
  name: 'Centre for Advanced Studies',
  short: 'SCAS',
  institute: 'Sathyabama Institute of Science and Technology',
  instituteShort: 'SIST',
  city: 'Chennai',
  lat: 12.8718,
  lon: 80.2253,
  plusCode: 'V6CG+Q4H',
  project: 'BB DIGITAL TWIN',
}

export const TEAM = [
  { name: 'Bharath Kumar', reg: '44733013', role: '3D Spatial Architecture & WebGL Shading', initials: 'BK' },
]

/** Deterministic PRNG so the simulated building is identical on every load. */
function mulberry32(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
export const rand = mulberry32(44733013)

const FLOOR_NUMBERS: Record<FloorId, number[]> = {
  F1: Array.from({ length: 16 }, (_, i) => 303 + i),
  F2: Array.from({ length: 16 }, (_, i) => 340 + i),
  F3: Array.from({ length: 16 }, (_, i) => 475 + i),
}

/** F1 plan slots that differ from numbering order: 303/304 sit in the south-block rooms, 317/318 take the north-bar rooms. */
const F1_SLOT: Record<number, number> = { 0: 15, 1: 14, 14: 1, 15: 0 }

type Spec = [name: string, type: RoomType, cap: number]
const FLOOR_SPECS: Record<FloorId, Spec[]> = {
  F1: [
    ['ICT Computer Lab & ABHS', 'lab', 60],
    ['Advanced Computing Lab', 'lab', 48],
    ['IoT & Embedded Systems Lab', 'lab', 40],
    ['Smart Classroom 306', 'classroom', 50],
    ['Smart Classroom 307', 'classroom', 50],
    ['Seminar Hall A', 'seminar', 72],
    ['Innovation Studio', 'research', 18],
    ['Digital Library Pod', 'research', 30],
    ['Smart Classroom 311', 'classroom', 50],
    ['Smart Classroom 312', 'classroom', 50],
    ['Electronics Design Lab', 'lab', 40],
    ['Smart Classroom 314', 'classroom', 50],
    ['Tutorial Room 315', 'classroom', 36],
    ['Project Review Room', 'research', 16],
    ['Faculty Research Bay I', 'research', 14],
    ['Instrumentation Lab', 'lab', 36],
  ],
  F2: [
    ['AI & Machine Learning Lab', 'lab', 48],
    ['Data Science Lab', 'lab', 48],
    ['Cloud Computing Lab', 'lab', 44],
    ['Smart Classroom 343', 'classroom', 50],
    ['Smart Classroom 344', 'classroom', 50],
    ['Cyber Security Lab', 'lab', 40],
    ['Network Operations Lab', 'lab', 30],
    ['Seminar Hall B', 'seminar', 64],
    ['Smart Classroom 348', 'classroom', 50],
    ['Smart Classroom 349', 'classroom', 50],
    ['Robotics & Automation Lab', 'lab', 36],
    ['Smart Classroom 351', 'classroom', 46],
    ['Tutorial Room 352', 'classroom', 34],
    ['Faculty Research Bay II', 'research', 14],
    ['Quantum Computing Studio', 'research', 18],
    ['VLSI Design Lab', 'lab', 36],
  ],
  F3: [
    ['Nanomaterials Research Lab', 'research', 24],
    ['Bioinformatics Lab', 'lab', 40],
    ['Smart Grid & Energy Lab', 'lab', 40],
    ['Smart Classroom 478', 'classroom', 50],
    ['Smart Classroom 479', 'classroom', 50],
    ['Conference Hall', 'seminar', 56],
    ['PhD Scholars Bay', 'research', 20],
    ['Advanced Studies Board Room', 'seminar', 30],
    ['Smart Classroom 483', 'classroom', 48],
    ['Smart Classroom 484', 'classroom', 48],
    ['Remote Sensing Lab', 'lab', 36],
    ['Smart Classroom 486', 'classroom', 44],
    ['Tutorial Room 487', 'classroom', 32],
    ['Faculty Research Bay III', 'research', 14],
    ['Media & XR Studio', 'research', 24],
    ['Materials Testing Lab', 'lab', 31],
  ],
}

/** Rooms that are not in session right now (10 of 48 → 38 in session). */
const NOT_IN_SESSION = new Set([309, 316, 317, 352, 353, 354, 475, 481, 488, 489])
const MAINTENANCE = new Set([317, 488])

/** Fixed occupancy targets so the derived aggregate is exactly 1,420 students / 1,793 seats. */
export const TARGET_STUDENTS = 1420
export const TARGET_SEATS = 1793

function devicesFor(num: number, type: RoomType, cameraId?: string): RoomDevice[] {
  const list: RoomDevice[] = [
    { id: `VRF-${num}`, name: 'Daikin VRV IDU', kind: 'vrf', status: 'online', detail: 'Cooling · Auto fan' },
    {
      id: `AP-${num}`,
      name: 'Wi-Fi 6E Access Point',
      kind: 'wifi',
      status: 'online',
      detail: `${Math.round(18 + rand() * 40)} clients`,
    },
    { id: `IAQ-${num}`, name: 'IAQ Sensor Node', kind: 'sensor', status: 'online', detail: 'CO₂ · T · RH · dB' },
  ]
  if (type === 'lab' || type === 'seminar') {
    list.splice(1, 0, { id: `DSP-${num}`, name: 'Smart Display 86"', kind: 'display', status: 'online', detail: '4K · Casting' })
  } else {
    list.splice(1, 0, { id: `PRJ-${num}`, name: 'Laser Projector', kind: 'projector', status: 'standby', detail: '6,000 lm' })
  }
  if (cameraId) list.push({ id: cameraId, name: '4K Dome Camera', kind: 'camera', status: 'online', detail: '30 FPS · IR' })
  return list
}

function buildRooms(): Room[] {
  const rects = floorRoomRects()
  const rooms: Room[] = []
  ;(['F1', 'F2', 'F3'] as FloorId[]).forEach((floor) => {
    FLOOR_NUMBERS[floor].forEach((number, i) => {
      const [name, type, capacity] = FLOOR_SPECS[floor][i]
      const inSession = !NOT_IN_SESSION.has(number)
      const status = MAINTENANCE.has(number) ? 'maintenance' : inSession ? 'in-session' : 'available'
      const cameraId = number === 303 ? 'CAM-07' : number === 345 ? 'CAM-06' : undefined
      rooms.push({
        id: `R${number}`,
        number,
        floor,
        name,
        type,
        capacity,
        occupancy: inSession ? Math.round(capacity * (0.82 + rand() * 0.16)) : 0,
        status,
        temp: 22.4 + (rand() - 0.5) * 2.4,
        humidity: 54 + (rand() - 0.5) * 8,
        co2: inSession ? 640 + (rand() - 0.5) * 160 : 470 + rand() * 50,
        noise: inSession ? 46 + rand() * 12 : 32 + rand() * 6,
        energyKw: 0,
        hvacKw: 0,
        setpoint: 23,
        acOn: true,
        acMode: 'auto',
        fan: 2,
        deviceOn: {},
        rect: rects[floor === 'F1' ? (F1_SLOT[i] ?? i) : i],
        devices: devicesFor(number, type, cameraId),
        cameraId,
        verified: number === 303 || number === 345,
      })
    })
  })

  // Calibrate occupancy so the derived total is exactly TARGET_STUDENTS without exceeding capacity.
  const active = rooms.filter((r) => r.status === 'in-session')
  let diff = TARGET_STUDENTS - active.reduce((s, r) => s + r.occupancy, 0)
  for (let guard = 0; diff !== 0 && guard < 10000; guard++) {
    const r = active[guard % active.length]
    if (diff > 0 && r.occupancy < r.capacity) {
      r.occupancy++
      diff--
    } else if (diff < 0 && r.occupancy > Math.round(r.capacity * 0.5)) {
      r.occupancy--
      diff++
    }
  }

  // Calibrate seat count to the published 1,793 seats (1,420 students = 79.2 % utilisation).
  let excess = rooms.reduce((s, r) => s + r.capacity, 0) - TARGET_SEATS
  for (let guard = 0; excess !== 0 && guard < 20000; guard++) {
    const r = rooms[guard % rooms.length]
    const floorCap = r.status === 'in-session' ? r.occupancy + 2 : 12
    if (excess > 0 && r.capacity > floorCap) {
      r.capacity--
      excess--
    } else if (excess < 0) {
      r.capacity++
      excess++
    }
  }

  // Pin the verified evidence rooms to their recorded readings.
  const pinned = new Set([303, 482])
  Object.assign(rooms.find((r) => r.number === 303)!, { temp: 22.4, humidity: 54, co2: 580 })
  rooms.find((r) => r.number === 482)!.co2 = 1040

  // Calibrate unpinned rooms so building means equal the published averages (620 ppm, 22.4 °C, 54 % RH).
  const free = rooms.filter((r) => !pinned.has(r.number))
  const calibrate = (k: 'co2' | 'temp' | 'humidity', target: number) => {
    const delta = (target * rooms.length - rooms.reduce((s, r) => s + r[k], 0)) / free.length
    free.forEach((r) => (r[k] += delta))
  }
  calibrate('co2', 620)
  calibrate('temp', 22.4)
  calibrate('humidity', 54)
  // Each VRF holds its room at the recorded temperature, so the snapshot is a model equilibrium.
  rooms.forEach((r) => (r.setpoint = Math.round(r.temp * 2) / 2))
  return rooms
}

export const INITIAL_ROOMS = buildRooms()
export const CAMPUS_LOAD_KW = 106.6

/** Scales modelled room power so the 11:30 snapshot matches the metered 106.6 kW building load. */
export const POWER_SCALE = (() => {
  const ctx = { tOut: outdoorTemp(11 * 60 + 30, 'clear'), solar: 1, aiApplied: false, fireMode: false }
  const raw = INITIAL_ROOMS.reduce((s, r) => s + roomPower(r, ctx), 0)
  const scale = (CAMPUS_LOAD_KW - COMMON_DAY_KW) / raw
  INITIAL_ROOMS.forEach((r) => {
    r.hvacKw = hvac(r, ctx).kw * scale
    r.energyKw = roomPower(r, ctx) * scale
  })
  return scale
})()
export const TOTAL_SEATS = INITIAL_ROOMS.reduce((s, r) => s + r.capacity, 0)

/** Camera positions: interior cameras are floor-relative, site cameras are world-space. */
export const CAMERAS: CameraNode[] = [
  {
    id: 'CAM-01', name: 'Portico Entrance', zone: 'East Portico', floor: 'SITE',
    position: [63.2, 5.6, -29.5], target: [76, GROUND_Y, -16], fov: 92, fps: 30, resolution: '3840×2160', ir: true,
    status: 'online', detections: 6,
  },
  {
    id: 'CAM-02', name: 'North-East Perimeter', zone: 'North Facade', floor: 'SITE',
    position: [63, 11.5, -49.6], target: [36, GROUND_Y, -60], fov: 80, fps: 30, resolution: '3840×2160', ir: true,
    status: 'online', detections: 2,
  },
  {
    id: 'CAM-03', name: 'West Perimeter', zone: 'North Bar · West End', floor: 'SITE',
    position: [-62.2, 11.5, -22], target: [-44, GROUND_Y, -6], fov: 80, fps: 25, resolution: '2560×1440', ir: true,
    status: 'online', detections: 1,
  },
  {
    id: 'CAM-04', name: 'North Light-Well', zone: 'Elongated Light-Well', floor: 'SITE',
    position: [19.4, 12.6, -36.6], target: [32, GROUND_Y, -31], fov: 100, fps: 30, resolution: '3840×2160', ir: false,
    status: 'online', detections: 3,
  },
  {
    id: 'CAM-05', name: 'Central Courtyard', zone: 'Checkerboard Courtyard', floor: 'SITE',
    position: [19.4, 12.6, 12.3], target: [31, GROUND_Y, 24], fov: 100, fps: 30, resolution: '3840×2160', ir: false,
    status: 'degraded', detections: 0,
  },
  {
    id: 'CAM-06', name: 'Cyber Security Lab', zone: 'F2 · Room 345', floor: 'F2', roomNumber: 345,
    position: [5.6, 3.6, -10.6], target: [16, 0.4, -2], fov: 96, fps: 30, resolution: '3840×2160', ir: true,
    status: 'online', detections: 31,
  },
  {
    id: 'CAM-07', name: 'ICT Computer Lab', zone: 'F1 · Room 303', floor: 'F1', roomNumber: 303,
    position: [32.8, 3.6, 45.6], target: [42, 0.4, 38], fov: 96, fps: 30, resolution: '3840×2160', ir: true,
    status: 'online', detections: 44,
  },
]

export const SOLAR_STRINGS: SolarString[] = [
  { id: 'A', name: 'String A · North-West', panels: 100, panelWatt: 450, capacityKw: 45, referenceKw: 39.6, outputKw: 39.6, voltage: 742, current: 53.4, efficiency: 88, moduleTemp: 46, health: 'optimal', inverter: 'INV-01 · 50 kW' },
  { id: 'B', name: 'String B · North-East', panels: 100, panelWatt: 450, capacityKw: 45, referenceKw: 38.9, outputKw: 38.9, voltage: 738, current: 52.7, efficiency: 86, moduleTemp: 47, health: 'optimal', inverter: 'INV-01 · 50 kW' },
  { id: 'C', name: 'String C · South-West', panels: 100, panelWatt: 450, capacityKw: 45, referenceKw: 41.2, outputKw: 41.2, voltage: 751, current: 54.9, efficiency: 92, moduleTemp: 44, health: 'optimal', inverter: 'INV-02 · 50 kW' },
  { id: 'D', name: 'String D · South-East', panels: 100, panelWatt: 450, capacityKw: 45, referenceKw: 35.1, outputKw: 35.1, voltage: 702, current: 50.0, efficiency: 78, moduleTemp: 53, health: 'degraded', inverter: 'INV-02 · 50 kW' },
]
export const SOLAR_CAPACITY_KW = 180
export const SOLAR_REFERENCE_KW = 154.8

export const STREETLIGHTS: Streetlight[] = [
  [76, -52], [76, -36], [76, 0], [76, 18], [76, 44], [40, 54], [-20, -16], [-50, -52],
].map(([x, z], i) => ({
  id: `SL-0${i + 1}`,
  name: `LoRa Luminaire ${i + 1}`,
  position: [x, GROUND_Y, z],
  node: `LRW-${(0x3a10 + i * 7).toString(16).toUpperCase()}`,
  rssi: -92 + Math.round(rand() * 18),
  powerW: 60,
}))

export const INITIAL_ALERTS: CampusAlert[] = [
  {
    id: 'AL-1042', severity: 'critical', title: 'String D underperforming −14%',
    detail: 'Module temperature 53 °C, soiling suspected on rows D3–D5. Inverter INV-02 MPPT deviation.',
    source: 'Solar PV · INV-02', time: '11:12', acknowledged: false, focus: { kind: 'solar', id: 'D' },
  },
  {
    id: 'AL-1043', severity: 'warning', title: 'CO₂ rising in Room 482 — 1,040 ppm',
    detail: 'Advanced Studies Board Room above 1,000 ppm threshold. Fresh-air damper boost recommended.',
    source: 'IAQ-482', time: '11:24', acknowledged: false, focus: { kind: 'room', id: 'R482' },
  },
  {
    id: 'AL-1039', severity: 'info', title: 'SL-06 LoRa packet loss 8%',
    detail: 'Mesh hop via SL-05 re-routed. Luminaire operational, telemetry interval widened to 60 s.',
    source: 'LoRa Gateway GW-2', time: '10:48', acknowledged: true, focus: { kind: 'streetlight', id: 'SL-06' },
  },
]

export const DATA_TAG_HELP: Record<string, string> = {
  'SOURCE-DERIVED': 'Traced from satellite footprint, institutional photographs and the room register.',
  SIMULATED: 'Synthetic telemetry generated client-side; no live BMS feed is connected.',
  REAL: 'Computed live in your browser (render loop, local clock, sun ephemeris).',
  DERIVED: 'Aggregated from other values shown in this twin.',
}
