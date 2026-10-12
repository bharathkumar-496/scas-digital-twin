import {
  Activity,
  Building2,
  Camera,
  ChevronDown,
  Clapperboard,
  Cloud,
  CloudLightning,
  CloudRain,
  Flame,
  GraduationCap,
  Layers,
  Lightbulb,
  Moon,
  Search,
  Sun,
  Thermometer,
  TriangleAlert,
  Zap,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { CAMERAS, STREETLIGHTS } from '../data/campus'
import { startFireDrill, startTour, stopFireDrill, stopTour } from '../lib/controllers'
import { HEATMAP_META } from '../lib/metrics'
import { formatClock12 } from '../lib/sun'
import { actions, store, useApp } from '../state/store'
import type { HeatmapMode, Selection, Weather } from '../types'
import { Chip, cx, Kbd, StatusDot, Tag } from './ui'

export function useOutside<T extends HTMLElement>(open: boolean, close: () => void) {
  const ref = useRef<T>(null)
  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close()
    }
    window.addEventListener('mousedown', h)
    return () => window.removeEventListener('mousedown', h)
  }, [open, close])
  return ref
}

export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <defs>
        <linearGradient id="lg-top" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#67e8f9" />
          <stop offset="1" stopColor="#22d3ee" />
        </linearGradient>
        <linearGradient id="lg-l" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0891b2" />
          <stop offset="1" stopColor="#164e63" />
        </linearGradient>
        <linearGradient id="lg-r" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0e7490" />
          <stop offset="1" stopColor="#082f49" />
        </linearGradient>
      </defs>
      <path d="M16 3l11 6v14l-11 6-11-6V9z" fill="#22d3ee" opacity=".15" />
      <path d="M16 5l10 5.4L16 16 6 10.4z" fill="url(#lg-top)" />
      <path d="M16 16v11.5L6 22V10.4z" fill="url(#lg-l)" />
      <path d="M16 16v11.5L26 22V10.4z" fill="url(#lg-r)" />
      <path d="M16 5l10 5.4L16 16 6 10.4z" fill="none" stroke="#fff" strokeOpacity=".4" strokeWidth=".6" />
    </svg>
  )
}

/* ---------------------------------------------------------------- search */

interface Hit {
  key: string
  label: string
  sub: string
  icon: ReactNode
  sel: NonNullable<Selection>
}

function SearchBox() {
  const rooms = useApp((s) => s.rooms)
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [idx, setIdx] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  const wrap = useOutside<HTMLDivElement>(open, () => setOpen(false))

  const index = useMemo<Hit[]>(() => {
    const out: Hit[] = []
    rooms.forEach((r) => {
      out.push({ key: r.id, label: `Room ${r.number} · ${r.name}`, sub: `${r.floor} · ${r.status}`, icon: <GraduationCap size={14} />, sel: { kind: 'room', id: r.id } })
      out.push({ key: `IAQ-${r.number}`, label: `IAQ-${r.number} sensor`, sub: `CO₂ ${Math.round(r.co2)} ppm · ${r.temp.toFixed(1)} °C`, icon: <Activity size={14} />, sel: { kind: 'room', id: r.id } })
      r.devices
        .filter((d) => d.kind === 'vrf' || d.kind === 'display' || d.kind === 'projector')
        .forEach((d) => out.push({ key: d.id, label: `${d.id} · ${d.name}`, sub: `Room ${r.number}`, icon: <Building2 size={14} />, sel: { kind: 'room', id: r.id } }))
    })
    CAMERAS.forEach((c) => out.push({ key: c.id, label: `${c.id} · ${c.name}`, sub: c.zone, icon: <Camera size={14} />, sel: { kind: 'camera', id: c.id } }))
    ;(['A', 'B', 'C', 'D'] as const).forEach((id) => out.push({ key: `S-${id}`, label: `Solar String ${id}`, sub: 'Rooftop PV · 45 kW', icon: <Zap size={14} />, sel: { kind: 'solar', id } }))
    STREETLIGHTS.forEach((l) => out.push({ key: l.id, label: `${l.id} · ${l.name}`, sub: `LoRa ${l.node}`, icon: <Lightbulb size={14} />, sel: { kind: 'streetlight', id: l.id } }))
    return out
  }, [rooms])

  const results = useMemo(() => {
    const t = q.trim().toLowerCase()
    if (!t) return index.filter((h) => ['R303', 'R345', 'CAM-07', 'S-D', 'R482'].includes(h.key))
    return index.filter((h) => `${h.label} ${h.sub}`.toLowerCase().includes(t)).slice(0, 8)
  }, [q, index])

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (e.key === '/' && el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA') {
        e.preventDefault()
        input.current?.focus()
        setOpen(true)
      }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])

  const choose = (h: Hit) => {
    actions.select(h.sel)
    const tab = h.sel.kind === 'camera' ? 'cctv' : h.sel.kind === 'solar' ? 'solar' : h.sel.kind === 'room' ? 'rooms' : null
    if (tab) store.set({ dockTab: tab })
    setQ('')
    setOpen(false)
    input.current?.blur()
  }

  return (
    <div ref={wrap} className="relative w-full max-w-[420px]">
      <div className={cx('flex h-9 items-center gap-2 rounded-full bg-chip px-3.5 ring-1 ring-inset transition', open ? 'ring-cyan-400/50' : 'ring-line')}>
        <Search size={15} className="shrink-0 text-faint" />
        <input
          ref={input}
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            setIdx(0)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') setIdx((i) => Math.min(results.length - 1, i + 1))
            else if (e.key === 'ArrowUp') setIdx((i) => Math.max(0, i - 1))
            else if (e.key === 'Enter' && results[idx]) choose(results[idx])
            else if (e.key === 'Escape') {
              setOpen(false)
              input.current?.blur()
            }
          }}
          placeholder="Search rooms, equipment, cameras, sensors..."
          className="min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-faint"
          aria-label="Search the digital twin"
        />
        <Kbd>/</Kbd>
      </div>
      {open && results.length > 0 && (
        <div className="glass-strong anim-rise absolute left-0 right-0 top-11 z-40 overflow-hidden p-1.5">
          <div className="px-2 pb-1 pt-0.5 text-[10px] uppercase tracking-widest text-faint">{q ? `${results.length} matches` : 'Suggested'}</div>
          {results.map((h, i) => (
            <button
              key={h.key}
              onMouseEnter={() => setIdx(i)}
              onClick={() => choose(h)}
              className={cx('flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left', i === idx ? 'bg-cyan-500/10' : '')}
            >
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-chip-strong text-cyan-400">{h.icon}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12.5px] font-medium text-ink">{h.label}</span>
                <span className="block truncate text-[10.5px] text-faint">{h.sub}</span>
              </span>
              {i === idx && <Kbd>↵</Kbd>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/* ---------------------------------------------------------------- dropdown */

function Menu<T extends string>({
  value,
  options,
  onChange,
  icon,
  label,
  tag,
}: {
  value: T
  options: { id: T; label: string; icon: ReactNode }[]
  onChange: (v: T) => void
  icon: ReactNode
  label: string
  tag?: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const ref = useOutside<HTMLDivElement>(open, () => setOpen(false))
  const cur = options.find((o) => o.id === value)
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        title={label}
        className="flex h-9 items-center gap-1.5 rounded-full bg-chip px-3 text-[12px] font-medium text-ink ring-1 ring-inset ring-line hover:bg-chip-strong"
      >
        {cur?.icon ?? icon}
        <span className="hidden 2xl:inline">{cur?.label}</span>
        <ChevronDown size={13} className="text-faint" />
      </button>
      {open && (
        <div className="glass-strong anim-rise absolute right-0 top-11 z-40 w-48 p-1.5">
          <div className="flex items-center justify-between px-2 pb-1 text-[10px] uppercase tracking-widest text-faint">
            {label}
            {tag}
          </div>
          {options.map((o) => (
            <button
              key={o.id}
              onClick={() => {
                onChange(o.id)
                setOpen(false)
              }}
              className={cx('flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-[12.5px]', o.id === value ? 'bg-cyan-500/10 text-cyan-300 light:text-cyan-700' : 'text-ink hover:bg-chip')}
            >
              {o.icon}
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export const WEATHER_OPTS: { id: Weather; label: string; icon: ReactNode }[] = [
  { id: 'clear', label: 'Clear Sky', icon: <Sun size={14} className="text-amber-400" /> },
  { id: 'cloudy', label: 'Overcast', icon: <Cloud size={14} className="text-slate-400" /> },
  { id: 'rain', label: 'Rain', icon: <CloudRain size={14} className="text-sky-400" /> },
  { id: 'storm', label: 'Storm', icon: <CloudLightning size={14} className="text-violet-400" /> },
]

const HEAT_OPTS: { id: HeatmapMode; label: string; icon: ReactNode }[] = [
  { id: 'off', label: 'Heatmap Off', icon: <Layers size={14} className="text-faint" /> },
  { id: 'temperature', label: HEATMAP_META.temperature.label, icon: <Thermometer size={14} className="text-rose-400" /> },
  { id: 'co2', label: HEATMAP_META.co2.label, icon: <Activity size={14} className="text-emerald-400" /> },
  { id: 'energy', label: HEATMAP_META.energy.label, icon: <Zap size={14} className="text-amber-400" /> },
]

/* ---------------------------------------------------------------- alert center */

function AlertCenter() {
  const alerts = useApp((s) => s.alerts)
  const [open, setOpen] = useState(false)
  const ref = useOutside<HTMLDivElement>(open, () => setOpen(false))
  const active = alerts.filter((a) => !a.acknowledged).length
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={cx(
          'flex h-9 items-center gap-1.5 rounded-full px-3 font-mono text-[12px] font-semibold ring-1 ring-inset',
          active ? 'bg-amber-500/15 text-amber-300 ring-amber-400/40 light:text-amber-700' : 'bg-chip text-sub ring-line',
        )}
        title="Campus Alert Center"
      >
        <TriangleAlert size={14} />
        {String(active).padStart(2, '0')}
      </button>
      {open && (
        <div className="glass-strong anim-rise absolute right-0 top-11 z-40 w-[340px] p-2">
          <div className="flex items-center justify-between px-1.5 pb-2">
            <span className="text-[12px] font-semibold text-ink">Campus Alert Center</span>
            <Tag kind="SIMULATED" />
          </div>
          <div className="space-y-1.5">
            {alerts.map((a) => (
              <button
                key={a.id}
                onClick={() => {
                  actions.select(a.focus)
                  setOpen(false)
                }}
                className="w-full rounded-xl bg-chip p-2.5 text-left ring-1 ring-inset ring-line hover:bg-chip-strong"
              >
                <div className="flex items-center gap-2">
                  <span className={cx('h-2 w-2 shrink-0 rounded-full', a.severity === 'critical' ? 'bg-rose-500' : a.severity === 'warning' ? 'bg-amber-400' : 'bg-sky-400')} />
                  <span className="flex-1 truncate text-[12px] font-semibold text-ink">{a.title}</span>
                  <span className="font-mono text-[10px] text-faint">{a.time}</span>
                </div>
                <p className="mt-1 line-clamp-2 pl-4 text-[11px] leading-snug text-sub">{a.detail}</p>
                <div className="mt-1.5 flex items-center justify-between pl-4">
                  <span className="text-[10px] text-faint">{a.source}</span>
                  <span className="text-[10px] font-semibold text-cyan-400">Fly to ›</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/* ---------------------------------------------------------------- top nav */

function Clock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(id)
  }, [])
  return (
    <div className="hidden h-9 items-center gap-2 rounded-full bg-chip px-3 font-mono text-[12px] font-semibold text-ink ring-1 ring-inset ring-line lg:flex" title="[REAL] Local browser clock">
      <StatusDot color="#10b981" pulse />
      <span className="text-emerald-400">LIVE</span>
      {formatClock12(now)}
    </div>
  )
}

export function TopNav() {
  const theme = useApp((s) => s.theme)
  const weather = useApp((s) => s.weather)
  const heatmap = useApp((s) => s.heatmap)
  const tour = useApp((s) => s.tour.active)
  const fire = useApp((s) => s.fire.phase)
  const [facOpen, setFacOpen] = useState(false)
  const facRef = useOutside<HTMLDivElement>(facOpen, () => setFacOpen(false))

  return (
    <header className="glass pointer-events-auto absolute left-3 right-3 top-3 z-30 flex h-[52px] items-center gap-3 px-2.5">
      <div className="flex shrink-0 items-center gap-2">
        <button onClick={() => store.set({ introOpen: true })} className="flex items-center gap-2 rounded-xl px-1.5 py-1 hover:bg-chip" title="Open title card">
          <LogoMark />
          <span className="text-left leading-tight">
            <span className="block text-[13px] font-bold tracking-tight text-ink">
              BB <span className="text-cyan-400">Digital Twin</span>
            </span>
            <span className="block text-[9.5px] font-medium uppercase tracking-[0.16em] text-faint">SIST · Chennai</span>
          </span>
        </button>
        <Chip tone="cyan" className="hidden xl:inline-flex">SCAS • 3D PBR</Chip>
        <div ref={facRef} className="relative hidden lg:block">
          <button onClick={() => setFacOpen((o) => !o)} className="flex h-8 items-center gap-1.5 rounded-full bg-chip px-3 text-[12px] font-medium text-ink ring-1 ring-inset ring-line hover:bg-chip-strong">
            <Building2 size={13} className="text-cyan-400" /> SCAS Block • SIST <ChevronDown size={13} className="text-faint" />
          </button>
          {facOpen && (
            <div className="glass-strong anim-rise absolute left-0 top-10 z-40 w-64 p-1.5">
              <div className="px-2 pb-1 text-[10px] uppercase tracking-widest text-faint">Facility</div>
              <button onClick={() => setFacOpen(false)} className="flex w-full items-center justify-between rounded-lg bg-cyan-500/10 px-2 py-1.5 text-[12.5px] text-cyan-300 light:text-cyan-700">
                Centre for Advanced Studies <Chip tone="green">Live</Chip>
              </button>
              {['Main Academic Block', 'Jeppiaar Research Park', 'Central Library'].map((f) => (
                <div key={f} className="flex items-center justify-between px-2 py-1.5 text-[12.5px] text-faint">
                  {f} <span className="text-[10px]">Not modelled</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex min-w-0 flex-1 justify-center">
        <SearchBox />
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <Clock />
        <Menu label="Simulated weather" value={weather} options={WEATHER_OPTS} onChange={(w) => store.set({ weather: w })} icon={<Sun size={14} />} tag={<Tag kind="SIMULATED" />} />
        <Menu label="Spatial heatmap" value={heatmap} options={HEAT_OPTS} onChange={(h) => store.set({ heatmap: h })} icon={<Thermometer size={14} />} />
        <AlertCenter />
        <button
          onClick={() => (tour ? stopTour() : startTour())}
          className={cx('flex h-9 items-center gap-1.5 rounded-full px-3 text-[12px] font-semibold ring-1 ring-inset', tour ? 'bg-cyan-500/20 text-cyan-300 ring-cyan-400/40 light:text-cyan-700' : 'bg-chip text-ink ring-line hover:bg-chip-strong')}
          title="15-step guided tour"
        >
          <Clapperboard size={14} />
          <span className="hidden xl:inline">{tour ? 'Exit Tour' : 'Tour'}</span>
        </button>
        <button
          onClick={() => (fire === 'idle' ? startFireDrill() : stopFireDrill())}
          className={cx('flex h-9 items-center gap-1.5 rounded-full px-3 text-[12px] font-semibold ring-1 ring-inset', fire !== 'idle' ? 'bg-rose-500/25 text-rose-200 ring-rose-400/50' : 'bg-rose-500/10 text-rose-300 ring-rose-400/30 hover:bg-rose-500/20 light:text-rose-700')}
          title="Fire emergency drill"
        >
          <Flame size={14} />
          <span className="hidden xl:inline">{fire !== 'idle' ? 'End Drill' : 'Fire Drill'}</span>
        </button>
        <button
          onClick={() => store.set({ theme: theme === 'dark' ? 'light' : 'dark' })}
          className="grid h-9 w-9 place-items-center rounded-full bg-chip text-sub ring-1 ring-inset ring-line hover:text-ink"
          title="Toggle light / dark"
        >
          {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
        </button>
        <button
          onClick={() => store.set({ teamOpen: true })}
          className="flex h-9 items-center gap-1 rounded-full bg-gradient-to-r from-cyan-500 to-sky-600 pl-1 pr-3 text-[12px] font-bold text-white shadow-[0_0_18px_rgba(34,211,238,0.35)]"
          title="Team BB"
        >
          <span className="grid h-7 w-7 place-items-center rounded-full bg-black/25 font-mono text-[11px]">BB</span>
          <span className="hidden 2xl:inline">Team</span>
        </button>
      </div>
    </header>
  )
}
