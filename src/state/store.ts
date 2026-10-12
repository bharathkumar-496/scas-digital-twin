import { useSyncExternalStore } from 'react'
import { CAMPUS_LOAD_KW, INITIAL_ALERTS, INITIAL_ROOMS, SOLAR_STRINGS } from '../data/campus'
import { COMMON_DAY_KW, outdoorTemp } from '../lib/physics'
import { DEFAULT_TIME } from '../data/tour'
import type {
  AiState,
  CameraMode,
  CameraPose,
  CampusAlert,
  FireDrill,
  FloorFilter,
  HeatmapMode,
  Layers,
  Room,
  Selection,
  SolarString,
  Theme,
  TourState,
  Weather,
} from '../types'

export type DockTab = 'rooms' | 'cctv' | 'solar' | 'alerts'

export interface AppState {
  theme: Theme
  floor: FloorFilter
  explode: number
  time: number
  weather: Weather
  heatmap: HeatmapMode
  selection: Selection
  hover: Selection
  layers: Layers
  rooms: Room[]
  solar: SolarString[]
  alerts: CampusAlert[]
  fire: FireDrill
  tour: TourState
  cameraMode: CameraMode
  fps: number
  ai: AiState
  /** Building load captured when the AI pass started, for live savings. */
  aiBaselineKw: number
  /** Shared-services load (lifts, corridors, pumps, streetlights), kW. */
  commonKw: number
  /** Outdoor dry-bulb from the live weather model, °C. */
  outdoorTemp: number
  dockTab: DockTab
  dockMinimized: boolean
  layersDrawer: boolean
  introOpen: boolean
  teamOpen: boolean
  classroomModal: string | null
  cctvModal: string | null
  /** Bumped to ask the 3D engine to fly somewhere; consumed by the engine. */
  flyRequest: { id: number; pose?: CameraPose; selection?: Selection; preset?: 'iso' | 'zoom-in' | 'zoom-out' | 'reset' } | null
}

const initial: AppState = {
  theme: 'dark',
  floor: 'ALL',
  explode: 0,
  time: DEFAULT_TIME,
  weather: 'clear',
  heatmap: 'off',
  selection: null,
  hover: null,
  layers: { rooms: true, sensors: true, cctv: true, solar: true, streetlights: true, site: true },
  rooms: INITIAL_ROOMS,
  solar: SOLAR_STRINGS,
  alerts: INITIAL_ALERTS,
  fire: { phase: 'idle', evacuated: 0, total: 0, startedAt: 0 },
  tour: { active: false, step: 0, playing: true },
  cameraMode: 'persp',
  fps: 60,
  ai: 'idle',
  aiBaselineKw: CAMPUS_LOAD_KW,
  commonKw: COMMON_DAY_KW,
  outdoorTemp: outdoorTemp(DEFAULT_TIME, 'clear'),
  dockTab: 'rooms',
  dockMinimized: false,
  layersDrawer: false,
  introOpen: true,
  teamOpen: false,
  classroomModal: null,
  cctvModal: null,
  flyRequest: null,
}

let state = initial
const listeners = new Set<() => void>()

export const store = {
  get: () => state,
  set(patch: Partial<AppState> | ((s: AppState) => Partial<AppState>)) {
    const next = typeof patch === 'function' ? patch(state) : patch
    state = { ...state, ...next }
    listeners.forEach((l) => l())
  },
  subscribe(l: () => void) {
    listeners.add(l)
    return () => listeners.delete(l)
  },
}

export function useApp<T>(selector: (s: AppState) => T): T {
  return useSyncExternalStore(store.subscribe, () => selector(state))
}

let flyId = 0
export const actions = {
  select(selection: Selection, fly = true) {
    const patch: Partial<AppState> = { selection }
    if (fly && selection?.kind === 'room') {
      // Rooms sit inside the envelope: isolate their floor so the flight actually reveals them.
      const room = state.rooms.find((r) => r.id === selection.id)
      if (room && ((state.floor === 'ALL' && state.explode < 0.3) || (state.floor !== 'ALL' && state.floor !== room.floor))) {
        patch.floor = room.floor
      }
    }
    store.set(patch)
    if (fly && selection) store.set({ flyRequest: { id: ++flyId, selection } })
  },
  flyTo(pose: CameraPose) {
    store.set({ flyRequest: { id: ++flyId, pose } })
  },
  camera(preset: 'iso' | 'zoom-in' | 'zoom-out' | 'reset') {
    store.set({ flyRequest: { id: ++flyId, preset } })
  },
  /** Changes a room's controls; the simulation picks the change up on its next step. */
  setRoom(id: string, patch: Partial<Pick<Room, 'setpoint' | 'acOn' | 'acMode' | 'fan' | 'deviceOn'>>) {
    store.set((s) => ({ rooms: s.rooms.map((r) => (r.id === id ? { ...r, ...patch } : r)) }))
  },
  toggleLayer(key: keyof Layers) {
    store.set((s) => ({ layers: { ...s.layers, [key]: !s.layers[key] } }))
  },
}

export const roomById = (id: string) => state.rooms.find((r) => r.id === id)
