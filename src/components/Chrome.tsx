import {
  Activity,
  Box,
  Building2,
  Flame,
  GraduationCap,
  Home,
  Layers,
  Lightbulb,
  Minus,
  Moon,
  Plus,
  RotateCcw,
  ShieldCheck,
  SlidersHorizontal,
  Square,
  Sun,
  Thermometer,
  TrendingUp,
  Users,
  Wind,
  X,
  Zap,
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { FACILITY, SOLAR_CAPACITY_KW } from '../data/campus'
import { startFireDrill, stopFireDrill } from '../lib/controllers'
import { buildingSummary, co2Label, HEATMAP_META, rampCss } from '../lib/metrics'
import { getBuildingHistory } from '../lib/sim'
import { formatMinutes, sunPosition } from '../lib/sun'
import { actions, store, useApp } from '../state/store'
import type { FloorFilter, Layers as LayerState } from '../types'
import { WEATHER_OPTS } from './TopNav'
import { cx, IconBtn, StatusDot, Tag, Toggle } from './ui'

/* ---------------------------------------------------------------- HUD metric cards */

function HudCard({ icon, label, value, delta, sub, tag, accent, spark }: { icon: ReactNode; label: string; value: ReactNode; delta: string; sub: string; tag: Parameters<typeof Tag>[0]['kind']; accent: string; spark: number[] }) {
  const max = Math.max(...spark)
  return (
    <div className="glass pointer-events-auto w-[236px] p-3 anim-rise">
      <div className="flex items-center gap-2">
        <span className="grid h-7 w-7 place-items-center rounded-lg" style={{ background: `${accent}22`, color: accent }}>
          {icon}
        </span>
        <span className="flex-1 truncate whitespace-nowrap text-[11px] font-medium text-sub">{label}</span>
        <Tag kind={tag} />
      </div>
      <div className="mt-2 flex items-end justify-between gap-2">
        <div>
          <div className="font-mono text-[19px] font-semibold leading-none text-ink">{value}</div>
          <div className="mt-1.5 flex items-center gap-1.5 text-[10.5px] text-sub">
            <span className="inline-flex items-center gap-0.5 font-semibold" style={{ color: accent }}>
              <TrendingUp size={11} /> {delta}
            </span>
          </div>
        </div>
        <div className="flex h-8 items-end gap-[2px]">
          {spark.map((v, i) => (
            <span key={i} className="w-[4px] rounded-sm" style={{ height: `${(v / max) * 100}%`, background: accent, opacity: 0.35 + (i / spark.length) * 0.65 }} />
          ))}
        </div>
      </div>
      <div className="mt-2 border-t border-line pt-1.5 text-[10.5px] text-faint">{sub}</div>
    </div>
  )
}

export function FloatingMetricsHUD() {
  const rooms = useApp((s) => s.rooms)
  const solar = useApp((s) => s.solar)
  const heatmap = useApp((s) => s.heatmap)
  const commonKw = useApp((s) => s.commonKw)
  const m = buildingSummary(rooms, solar, commonKw)
  const h = getBuildingHistory()
  const spark = (arr: number[], now: number) => {
    const tail = arr.slice(-8)
    return tail.length > 1 ? tail.map((v) => Math.max(v, 0.01)) : [Math.max(now, 0.01)]
  }
  const studentDelta = h.students.length > 1 ? m.students - h.students[0] : 0
  return (
    <div className="pointer-events-none absolute left-18 top-[76px] z-20 hidden flex-col gap-2 md:flex">
      <div className="flex gap-2">
        <HudCard
          icon={<Users size={14} />}
          label="Rooms In Session"
          value={
            <>
              {m.inSession} <span className="text-[13px] text-faint">/ {m.total}</span>
            </>
          }
          delta={`${studentDelta >= 0 ? '+' : ''}${studentDelta} students · ${h.students.length}s`}
          sub={`${m.utilisation.toFixed(1)}% · ${m.students.toLocaleString('en-IN')} Students`}
          tag="DERIVED"
          accent="#22d3ee"
          spark={spark(h.students, m.students)}
        />
        <HudCard
          icon={<Zap size={14} />}
          label="Solar PV Gen"
          value={
            <>
              {m.solarKw.toFixed(1)} <span className="text-[13px] text-faint">kW</span>
            </>
          }
          delta={m.solarKw > 0.5 ? `${m.netKw >= 0 ? '+' : ''}${m.netKw.toFixed(1)} kW net · load ${m.loadKw.toFixed(0)}` : `Night · load ${m.loadKw.toFixed(0)} kW`}
          sub={`${m.solarEff.toFixed(0)}% Eff · ${SOLAR_CAPACITY_KW} kW Cap`}
          tag="SIMULATED"
          accent="#f59e0b"
          spark={spark(h.solar, m.solarKw)}
        />
        <HudCard
          icon={<Wind size={14} />}
          label="Microclimate IAQ"
          value={
            <>
              {Math.round(m.co2)} <span className="text-[13px] text-faint">ppm CO₂</span>
            </>
          }
          delta={co2Label(m.co2)}
          sub={`${m.temp.toFixed(1)}°C · ${m.humidity.toFixed(0)}% RH`}
          tag="SIMULATED"
          accent="#10b981"
          spark={spark(h.co2.map((v) => v - 400), m.co2 - 400)}
        />
      </div>
      {heatmap !== 'off' && <HeatLegend />}
    </div>
  )
}

function HeatLegend() {
  const mode = useApp((s) => s.heatmap)
  if (mode === 'off') return null
  const meta = HEATMAP_META[mode]
  return (
    <div className="glass pointer-events-auto w-[300px] p-2.5 anim-rise">
      <div className="mb-1.5 flex items-center justify-between text-[11px] font-medium text-sub">
        <span className="flex items-center gap-1.5">
          <Thermometer size={13} className="text-cyan-400" /> Volumetric {meta.label}
        </span>
        <Tag kind="SIMULATED" />
      </div>
      <div className="h-2 rounded-full" style={{ background: `linear-gradient(to right, ${[0, 0.25, 0.5, 0.75, 1].map(rampCss).join(',')})` }} />
      <div className="mt-1 flex justify-between font-mono text-[10px] text-faint">
        <span>{meta.min}</span>
        <span>{meta.max}</span>
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------- left rail */

type RailMode = 'overview' | 'floors' | 'classrooms' | 'sensors' | 'cctv' | 'solar' | 'lights' | 'fire' | 'layers'

export function LeftSidebar() {
  const floor = useApp((s) => s.floor)
  const heatmap = useApp((s) => s.heatmap)
  const layers = useApp((s) => s.layers)
  const fire = useApp((s) => s.fire.phase)
  const drawer = useApp((s) => s.layersDrawer)
  const selection = useApp((s) => s.selection)
  const [flyout, setFlyout] = useState(false)

  const items: { id: RailMode; label: string; icon: ReactNode; active: boolean; onClick: () => void; tone?: 'rose' | 'amber' }[] = [
    {
      id: 'overview', label: 'Overview', icon: <Layers size={17} />, active: !selection && floor === 'ALL',
      onClick: () => {
        store.set({ selection: null, floor: 'ALL', explode: 0 })
        actions.camera('iso')
      },
    },
    { id: 'floors', label: 'Floor Levels', icon: <Building2 size={17} />, active: flyout || floor !== 'ALL', onClick: () => setFlyout((f) => !f) },
    {
      id: 'classrooms', label: 'Classrooms', icon: <GraduationCap size={17} />, active: layers.rooms && selection?.kind === 'room',
      onClick: () => {
        store.set({ dockTab: 'rooms', dockMinimized: false, layers: { ...layers, rooms: true } })
        actions.select({ kind: 'room', id: 'R303' })
      },
    },
    { id: 'sensors', label: 'Sensors · Heatmap', icon: <Activity size={17} />, active: heatmap !== 'off', onClick: () => store.set({ heatmap: heatmap === 'off' ? 'temperature' : 'off', layers: { ...layers, sensors: true } }) },
    {
      id: 'cctv', label: 'CCTV', icon: <ShieldCheck size={17} />, active: selection?.kind === 'camera',
      onClick: () => {
        store.set({ dockTab: 'cctv', dockMinimized: false, layers: { ...layers, cctv: true } })
        actions.select({ kind: 'camera', id: 'CAM-01' })
      },
    },
    {
      id: 'solar', label: 'Solar PV', icon: <Zap size={17} />, active: selection?.kind === 'solar', tone: 'amber',
      onClick: () => {
        store.set({ dockTab: 'solar', dockMinimized: false, floor: 'ALL', layers: { ...layers, solar: true } })
        actions.select({ kind: 'solar', id: 'A' })
      },
    },
    {
      id: 'lights', label: 'Streetlights', icon: <Lightbulb size={17} />, active: selection?.kind === 'streetlight', tone: 'amber',
      onClick: () => {
        store.set({ layers: { ...layers, streetlights: true } })
        actions.select({ kind: 'streetlight', id: 'SL-01' })
      },
    },
    { id: 'fire', label: 'Fire Drill', icon: <Flame size={17} />, active: fire !== 'idle', tone: 'rose', onClick: () => (fire === 'idle' ? startFireDrill() : stopFireDrill()) },
    { id: 'layers', label: 'Layers Filter', icon: <SlidersHorizontal size={17} />, active: drawer, onClick: () => store.set({ layersDrawer: !drawer }) },
  ]

  return (
    <>
      <nav className="glass pointer-events-auto absolute left-4 top-[76px] z-20 flex w-12 flex-col items-center gap-1 py-2" aria-label="Tools">
        {items.map((it, i) => (
          <div key={it.id} className="relative">
            {(i === 2 || i === 7) && <div className="mx-auto mb-1 h-px w-6 bg-line" />}
            <IconBtn label={it.label} active={it.active} tone={it.tone} onClick={it.onClick}>
              {it.icon}
              <span className="pointer-events-none absolute left-11 top-1/2 z-50 hidden -translate-y-1/2 whitespace-nowrap rounded-md bg-panel-strong px-2 py-1 text-[11px] font-medium text-ink shadow-lg ring-1 ring-line group-hover:block">
                {it.label}
              </span>
            </IconBtn>
            {it.id === 'floors' && flyout && (
              <div className="glass anim-rise absolute left-12 top-0 z-40 flex gap-1 p-1.5">
                {(['ALL', 'F3', 'F2', 'F1'] as FloorFilter[]).map((f) => (
                  <button
                    key={f}
                    onClick={() => store.set({ floor: f })}
                    className={cx('h-8 min-w-10 rounded-lg px-2 font-mono text-[11px] font-semibold', floor === f ? 'bg-cyan-500 text-slate-950' : 'text-sub hover:bg-chip-strong')}
                  >
                    {f}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </nav>
      {drawer && <LayersDrawer />}
    </>
  )
}

function LayersDrawer() {
  const layers = useApp((s) => s.layers)
  const rows: { key: keyof LayerState; label: string; sub: string; tag: Parameters<typeof Tag>[0]['kind'] }[] = [
    { key: 'rooms', label: 'Classroom badges', sub: '48 radar badges', tag: 'SOURCE-DERIVED' },
    { key: 'sensors', label: 'IAQ sensor nodes', sub: 'Ceiling pucks', tag: 'SIMULATED' },
    { key: 'cctv', label: 'CCTV frustums', sub: 'CAM-01 → CAM-07', tag: 'SIMULATED' },
    { key: 'solar', label: 'Rooftop PV strings', sub: '4 × 45 kW', tag: 'SIMULATED' },
    { key: 'streetlights', label: 'LoRa streetlights', sub: '8 luminaires', tag: 'SIMULATED' },
  ]
  return (
    <div className="glass pointer-events-auto anim-rise absolute left-[76px] top-[76px] z-30 w-64 p-3 md:top-[236px]">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[12px] font-semibold text-ink">Layers</span>
        <button onClick={() => store.set({ layersDrawer: false })} className="text-faint hover:text-ink" aria-label="Close layers">
          <X size={14} />
        </button>
      </div>
      <div className="space-y-1">
        {rows.map((r) => (
          <div key={r.key} className="flex items-center gap-2 rounded-lg px-1.5 py-1.5 hover:bg-chip">
            <div className="min-w-0 flex-1">
              <div className="text-[12px] font-medium text-ink">{r.label}</div>
              <div className="flex items-center gap-1.5 text-[10px] text-faint">
                {r.sub} <Tag kind={r.tag} />
              </div>
            </div>
            <Toggle on={layers[r.key]} onChange={() => actions.toggleLayer(r.key)} label={r.label} />
          </div>
        ))}
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------- camera tool rail */

export function CameraToolRail() {
  const mode = useApp((s) => s.cameraMode)
  return (
    <div className="glass pointer-events-auto absolute bottom-14 left-4 z-20 flex w-12 flex-col items-center gap-1 py-2">
      <IconBtn label="Zoom in" onClick={() => actions.camera('zoom-in')}>
        <Plus size={16} />
      </IconBtn>
      <IconBtn label="Zoom out" onClick={() => actions.camera('zoom-out')}>
        <Minus size={16} />
      </IconBtn>
      <IconBtn label="Orbit reset" onClick={() => actions.camera('reset')}>
        <RotateCcw size={15} />
      </IconBtn>
      <IconBtn label="Isometric view" onClick={() => actions.camera('iso')}>
        <Home size={15} />
      </IconBtn>
      <div className="h-px w-6 bg-line" />
      <IconBtn label={mode === 'persp' ? 'Switch to 2D plan' : 'Switch to 3D'} active={mode === 'ortho'} onClick={() => store.set({ cameraMode: mode === 'persp' ? 'ortho' : 'persp' })}>
        {mode === 'persp' ? <Square size={15} /> : <Box size={15} />}
      </IconBtn>
    </div>
  )
}

/* ---------------------------------------------------------------- bottom floor controls */

export function FloorControls() {
  const floor = useApp((s) => s.floor)
  const explode = useApp((s) => s.explode)
  const time = useApp((s) => s.time)
  const weather = useApp((s) => s.weather)
  const sun = sunPosition(time)
  const isNight = sun.elevation < 0
  return (
    <div className="pointer-events-none absolute bottom-4 left-16 right-[372px] z-20 hidden justify-center lg:flex min-[1800px]:left-[410px]">
      <div className="glass pointer-events-auto flex h-12 items-center gap-3 rounded-full px-2.5">
        <div className="flex gap-0.5 rounded-full bg-chip p-0.5">
          {(['ALL', 'F1', 'F2', 'F3'] as FloorFilter[]).map((f) => (
            <button key={f} onClick={() => store.set({ floor: f })} className={cx('h-8 rounded-full px-2.5 font-mono text-[11px] font-semibold transition', floor === f ? 'bg-cyan-500 text-slate-950 shadow-[0_0_14px_rgba(34,211,238,0.45)]' : 'text-sub hover:text-ink')}>
              {f}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2" title="Floor explode">
          <span className="font-mono text-[10px] text-faint">0%</span>
          <input type="range" min={0} max={100} value={Math.round(explode * 100)} onChange={(e) => store.set({ explode: Number(e.target.value) / 100 })} className="slider w-20 xl:w-24" style={{ ['--pct' as string]: `${explode * 100}%` }} aria-label="Floor explode" />
          <span className="font-mono text-[10px] text-faint">100%</span>
        </label>
        <div className="h-6 w-px bg-line" />
        <label className="flex items-center gap-2" title="[REAL] astronomical sun position for SCAS">
          {isNight ? <Moon size={14} className="text-indigo-300" /> : <Sun size={14} className="text-amber-400" />}
          <span className="hidden font-mono text-[10px] text-faint xl:inline">06:00</span>
          <input type="range" min={360} max={1440} step={5} value={time} onChange={(e) => store.set({ time: Number(e.target.value) })} className="slider w-24 xl:w-32" style={{ ['--pct' as string]: `${((time - 360) / 1080) * 100}%`, ['--fill' as string]: '#f59e0b' }} aria-label="Time of day" />
          <span className="w-10 font-mono text-[11px] font-semibold text-ink">{formatMinutes(time)}</span>
        </label>
        <div className="h-6 w-px bg-line" />
        <div className="flex gap-0.5 rounded-full bg-chip p-0.5">
          {WEATHER_OPTS.map((w) => (
            <button key={w.id} onClick={() => store.set({ weather: w.id })} title={w.label} className={cx('flex h-8 items-center gap-1 rounded-full px-2 text-[10px] font-semibold uppercase transition', weather === w.id ? 'bg-chip-strong text-ink ring-1 ring-line' : 'text-faint hover:text-ink')}>
              {w.icon}
              <span className="hidden min-[1800px]:inline">{w.id === 'cloudy' ? 'Cloudy' : w.id}</span>
            </button>
          ))}
        </div>
        <IconBtn label="Isometric camera reset" onClick={() => actions.camera('iso')}>
          <Box size={15} />
        </IconBtn>
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------- telemetry pill */

export function TelemetryPill() {
  const fps = useApp((s) => s.fps)
  return (
    <div className="glass pointer-events-auto absolute bottom-[68px] left-16 z-20 hidden h-8 items-center min-[1800px]:bottom-4 gap-2 rounded-full px-3 font-mono text-[10px] text-sub md:flex" title="[REAL] WebGL render loop">
      <StatusDot color="#10b981" pulse />
      <span className="font-semibold text-ink">BB DIGITAL TWIN • {FACILITY.short}</span>
      <span className="text-faint">|</span>
      <span>
        {FACILITY.lat.toFixed(2)}°N, {FACILITY.lon.toFixed(2)}°E
      </span>
      <span className="text-faint">|</span>
      <span className={fps >= 50 ? 'text-emerald-400' : fps >= 30 ? 'text-amber-400' : 'text-rose-400'}>{fps} FPS</span>
    </div>
  )
}
