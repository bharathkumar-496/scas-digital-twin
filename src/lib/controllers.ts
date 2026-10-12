import confetti from 'canvas-confetti'
import { TOUR } from '../data/tour'
import { actions, store } from '../state/store'
import type { CampusAlert, TourStep } from '../types'
import { buildingSummary } from './metrics'

/* ---------------------------------------------------------------- fire drill */

const EVAC_SECONDS = 38
const FIRE_ALERT: CampusAlert = {
  id: 'AL-FIRE',
  severity: 'critical',
  title: 'FIRE · Smoke detected in Room 345',
  detail: 'Cyber Security Lab ionisation detector SD-345-02 tripped. Evacuation via east stair core to the eastern assembly point.',
  source: 'Fire Panel FACP-1 · Zone F2-N',
  time: 'now',
  acknowledged: false,
  focus: { kind: 'room', id: 'R345' },
}

let fireTimers: number[] = []

export function startFireDrill() {
  stopTour()
  stopFireDrill(false)
  const s = store.get()
  const total = buildingSummary(s.rooms, s.solar).students
  store.set({
    fire: { phase: 'alarm', evacuated: 0, total, startedAt: performance.now() },
    floor: 'ALL',
    explode: 0,
    heatmap: 'off',
    selection: { kind: 'room', id: 'R345' },
    introOpen: false,
    classroomModal: null,
    cctvModal: null,
    alerts: [FIRE_ALERT, ...s.alerts.filter((a) => a.id !== FIRE_ALERT.id)],
    dockTab: 'alerts',
    dockMinimized: false,
  })
  actions.flyTo({ position: [52, 46, -46], target: [18, 5, -2] })
  fireTimers.push(
    window.setTimeout(() => {
      store.set((st) => ({ fire: { ...st.fire, phase: 'evacuating' } }))
      actions.flyTo({ position: [118, 58, 46], target: [52, 0, -2] })
    }, 2600),
  )
  fireTimers.push(
    window.setInterval(() => {
      const f = store.get().fire
      if (f.phase !== 'evacuating') return
      // ease-out evacuation curve
      const elapsed = (performance.now() - f.startedAt) / 1000 - 2.6
      const p = Math.min(1, elapsed / EVAC_SECONDS)
      const evacuated = Math.round(f.total * (1 - Math.pow(1 - p, 1.7)))
      if (p >= 1) {
        store.set({ fire: { ...f, evacuated: f.total, phase: 'complete' } })
        confetti({ particleCount: 140, spread: 80, origin: { y: 0.25 }, colors: ['#10b981', '#22d3ee', '#ffffff'] })
      } else store.set({ fire: { ...f, evacuated } })
    }, 120),
  )
}

export function stopFireDrill(resetAlerts = true) {
  fireTimers.forEach((t) => {
    window.clearTimeout(t)
    window.clearInterval(t)
  })
  fireTimers = []
  const s = store.get()
  if (s.fire.phase === 'idle') return
  store.set({
    fire: { phase: 'idle', evacuated: 0, total: 0, startedAt: 0 },
    alerts: resetAlerts ? s.alerts.filter((a) => a.id !== FIRE_ALERT.id) : s.alerts,
  })
}

/* ---------------------------------------------------------------- guided tour */

/** Applies a tour step; unspecified fields carry over from earlier steps. */
export function goToStep(i: number) {
  const step: TourStep | undefined = TOUR[i]
  if (!step) return
  const patch: Parameters<typeof store.set>[0] = {}
  const p = patch as Record<string, unknown>
  if (step.floor !== undefined) p.floor = step.floor
  if (step.explode !== undefined) p.explode = step.explode
  if (step.time !== undefined) p.time = step.time
  if (step.weather !== undefined) p.weather = step.weather
  if (step.heatmap !== undefined) p.heatmap = step.heatmap
  if (step.select !== undefined) p.selection = step.select
  store.set((s) => ({ ...patch, tour: { ...s.tour, active: true, step: i } }))
  actions.flyTo(step.pose)
}

export function startTour() {
  stopFireDrill()
  store.set({ cameraMode: 'persp', introOpen: false, classroomModal: null, cctvModal: null, tour: { active: true, step: 0, playing: true } })
  goToStep(0)
}

export function stopTour() {
  if (store.get().tour.active) store.set({ tour: { active: false, step: 0, playing: true } })
}
