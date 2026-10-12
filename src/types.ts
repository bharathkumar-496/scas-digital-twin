export type Vec3 = [number, number, number]

export type FloorId = 'F1' | 'F2' | 'F3'
export type FloorFilter = 'ALL' | FloorId
export type Weather = 'clear' | 'cloudy' | 'rain' | 'storm'
export type HeatmapMode = 'off' | 'temperature' | 'co2' | 'energy'
export type Theme = 'dark' | 'light'
export type CameraMode = 'persp' | 'ortho'

/** Data honesty classification shown on every card. */
export type DataTag = 'SOURCE-DERIVED' | 'SIMULATED' | 'REAL' | 'DERIVED'

export type RoomStatus = 'in-session' | 'available' | 'maintenance'
export type AcMode = 'cool' | 'auto' | 'fan' | 'dry'
export type RoomType = 'lab' | 'classroom' | 'seminar' | 'research'

export interface RoomDevice {
  id: string
  name: string
  kind: 'vrf' | 'projector' | 'wifi' | 'display' | 'sensor' | 'camera'
  status: 'online' | 'standby' | 'fault'
  detail: string
}

/** Axis-aligned room rectangle in building plan coordinates (metres, +x east, +z south). */
export interface PlanRect {
  x: number
  z: number
  w: number
  d: number
}

export interface Room {
  id: string
  number: number
  floor: FloorId
  name: string
  type: RoomType
  capacity: number
  occupancy: number
  status: RoomStatus
  temp: number
  humidity: number
  co2: number
  noise: number
  /** Total electrical draw of the room (HVAC + lighting + plug loads), kW. */
  energyKw: number
  /** VRF electrical draw, kW (part of energyKw). */
  hvacKw: number
  setpoint: number
  acOn: boolean
  acMode: AcMode
  fan: 1 | 2 | 3
  /** Per-device power switches, keyed by device id. */
  deviceOn: Record<string, boolean>
  rect: PlanRect
  devices: RoomDevice[]
  cameraId?: string
  verified?: boolean
}

export interface CameraNode {
  id: string
  name: string
  zone: string
  floor: FloorId | 'SITE'
  /** Local position (floor-relative for interior cameras, world for site cameras). */
  position: Vec3
  target: Vec3
  fov: number
  fps: number
  resolution: string
  ir: boolean
  status: 'online' | 'degraded'
  roomNumber?: number
  detections: number
}

export interface SolarString {
  id: 'A' | 'B' | 'C' | 'D'
  name: string
  panels: number
  panelWatt: number
  capacityKw: number
  /** Output at the 11:30 clear-sky reference, scaled live by sun + weather. */
  referenceKw: number
  outputKw: number
  voltage: number
  current: number
  efficiency: number
  moduleTemp: number
  health: 'optimal' | 'degraded'
  inverter: string
}

export interface Streetlight {
  id: string
  name: string
  position: Vec3
  node: string
  rssi: number
  powerW: number
}

export type AlertSeverity = 'critical' | 'warning' | 'info'

export interface CampusAlert {
  id: string
  severity: AlertSeverity
  title: string
  detail: string
  source: string
  time: string
  acknowledged: boolean
  focus: Selection
}

export type Selection =
  | { kind: 'room'; id: string }
  | { kind: 'camera'; id: string }
  | { kind: 'solar'; id: SolarString['id'] }
  | { kind: 'streetlight'; id: string }
  | null

export interface Layers {
  rooms: boolean
  sensors: boolean
  cctv: boolean
  solar: boolean
  streetlights: boolean
  site: boolean
}

export type FireDrillPhase = 'idle' | 'alarm' | 'evacuating' | 'complete'

export interface FireDrill {
  phase: FireDrillPhase
  evacuated: number
  total: number
  startedAt: number
}

export interface TourState {
  active: boolean
  step: number
  playing: boolean
}

export interface CameraPose {
  position: Vec3
  target: Vec3
}

export interface TourStep {
  title: string
  narration: string
  pose: CameraPose
  floor?: FloorFilter
  explode?: number
  time?: number
  weather?: Weather
  heatmap?: HeatmapMode
  select?: Selection
}

export type AiState = 'idle' | 'analysing' | 'applied'
