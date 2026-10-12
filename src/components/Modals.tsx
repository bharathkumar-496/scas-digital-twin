import {
  ArrowRight,
  Camera,
  Clapperboard,
  Crosshair,
  Download,
  Droplets,
  Eye,
  Fan,
  Flame,
  Globe,
  MapPin,
  Minus,
  Moon,
  Plus,
  RotateCcw,
  ScanLine,
  Snowflake,
  Thermometer,
  Video,
  Wind,
  X,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { CAMERAS, DATA_TAG_HELP, FACILITY, TEAM } from '../data/campus'
import { startFireDrill, startTour } from '../lib/controllers'
import { co2Label } from '../lib/metrics'
import { actions, store, useApp } from '../state/store'
import { getRoomHistory } from '../lib/sim'
import type { AcMode, DataTag } from '../types'
import { CCTVFeed, EvidencePhoto } from './Feeds'
import { LogoMark } from './TopNav'
import { Chip, cx, Dial, Metric, Modal, SectionTitle, StatusDot, Tag, Toggle } from './ui'

/* ---------------------------------------------------------------- intro / launchpad */

export function IntroModal() {
  const open = useApp((s) => s.introOpen)
  if (!open) return null
  const close = () => store.set({ introOpen: false })
  const modes = [
    { icon: <Globe size={18} />, title: 'Full 3D Campus', sub: 'Free-roam the SCAS twin', tone: 'from-cyan-500/20', run: close },
    { icon: <Clapperboard size={18} />, title: 'Cinematic Tour', sub: '15-step guided walkthrough', tone: 'from-violet-500/20', run: startTour },
    {
      icon: <Video size={18} />, title: 'Room 303 CCTV', sub: 'CAM-07 · 4K AI feed', tone: 'from-emerald-500/20',
      run: () => {
        store.set({ introOpen: false, cctvModal: 'CAM-07' })
        actions.select({ kind: 'room', id: 'R303' })
      },
    },
    { icon: <Flame size={18} />, title: 'Fire Drill', sub: 'Room 345 evacuation', tone: 'from-rose-500/25', run: startFireDrill },
  ]
  const features = ['Procedural PBR Geometry', 'Astronomical Sun Path', '48 Room Telemetry', '7 × 4K CCTV Frustums', '180 kW Rooftop PV', 'AI Load Optimisation']
  return (
    <Modal onClose={close} className="max-w-[760px]" label="BB Digital Twin title card">
      <div className="relative overflow-hidden p-7">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-cyan-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-28 -left-20 h-72 w-72 rounded-full bg-violet-500/15 blur-3xl" />
        <button onClick={close} className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-lg text-faint hover:bg-chip hover:text-ink" aria-label="Close">
          <X size={16} />
        </button>
        <div className="relative flex items-center gap-3">
          <LogoMark size={44} />
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-400">BB Digital Twin</div>
            <h1 className="text-[26px] font-bold leading-tight tracking-tight text-ink">Centre for Advanced Studies</h1>
          </div>
        </div>
        <p className="relative mt-3 max-w-[560px] text-[13.5px] leading-relaxed text-sub">
          A procedural WebGL smart-building twin of the SCAS block at {FACILITY.institute}, {FACILITY.city}. Spatial telemetry, CCTV, solar and incident simulation in one command center.
        </p>
        <div className="relative mt-3 flex flex-wrap items-center gap-2 text-[11px] text-sub">
          <Chip tone="cyan">
            <MapPin size={11} /> {FACILITY.lat}° N, {FACILITY.lon}° E
          </Chip>
          <Chip>Plus Code {FACILITY.plusCode}</Chip>
          <Chip>SIST · Chennai</Chip>
        </div>

        <div className="relative mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {modes.map((m) => (
            <button key={m.title} onClick={m.run} className={cx('group rounded-2xl bg-gradient-to-br to-transparent p-3.5 text-left ring-1 ring-inset ring-line transition hover:-translate-y-0.5 hover:ring-cyan-400/40', m.tone)}>
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-chip-strong text-ink">{m.icon}</span>
              <div className="mt-2.5 text-[13px] font-semibold text-ink">{m.title}</div>
              <div className="text-[11px] text-faint">{m.sub}</div>
              <ArrowRight size={14} className="mt-2 text-cyan-400 transition group-hover:translate-x-1" />
            </button>
          ))}
        </div>

        <div className="relative mt-4 flex flex-wrap gap-1.5">
          {features.map((f) => (
            <span key={f} className="rounded-full bg-chip px-2.5 py-1 font-mono text-[10px] text-sub ring-1 ring-inset ring-line">
              {f}
            </span>
          ))}
        </div>

        <div className="relative mt-5 grid gap-2.5 border-t border-line pt-4 sm:grid-cols-2">
          {TEAM.map((t) => (
            <div key={t.reg} className="flex items-center gap-3 rounded-2xl bg-chip p-3 ring-1 ring-inset ring-line">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br from-cyan-500 to-sky-700 font-mono text-[12px] font-bold text-white">{t.initials}</span>
              <div className="min-w-0">
                <div className="text-[13px] font-semibold text-ink">{t.name}</div>
                <div className="font-mono text-[11px] text-cyan-400">Reg. No {t.reg}</div>
                <div className="truncate text-[10.5px] text-faint">{t.role}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="relative mt-3 text-center text-[10.5px] text-faint">Re-open this card anytime from the logo in the top-left corner.</div>
      </div>
    </Modal>
  )
}

/* ---------------------------------------------------------------- team capsule */

export function TeamModal() {
  const open = useApp((s) => s.teamOpen)
  if (!open) return null
  const close = () => store.set({ teamOpen: false })
  return (
    <Modal onClose={close} className="max-w-[560px]" label="Team BB">
      <div className="p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-gradient-to-r from-cyan-500 to-sky-600 font-mono text-[13px] font-bold text-white">BB</span>
            <div>
              <div className="text-[16px] font-semibold text-ink">Engineering Team BB</div>
              <div className="text-[11px] text-faint">SIST SCAS Smart Building Digital Twin</div>
            </div>
          </div>
          <button onClick={close} className="grid h-8 w-8 place-items-center rounded-lg text-faint hover:bg-chip hover:text-ink" aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <div className="mt-4 space-y-2">
          {TEAM.map((t) => (
            <div key={t.reg} className="rounded-2xl bg-chip p-3.5 ring-1 ring-inset ring-line">
              <div className="flex items-center justify-between">
                <span className="text-[14px] font-semibold text-ink">{t.name}</span>
                <span className="font-mono text-[12px] text-cyan-400">{t.reg}</span>
              </div>
              <div className="mt-0.5 text-[12px] text-sub">{t.role}</div>
            </div>
          ))}
        </div>
        <SectionTitle>Data Honesty Classification</SectionTitle>
        <div className="space-y-1.5">
          {(Object.keys(DATA_TAG_HELP) as DataTag[]).map((k) => (
            <div key={k} className="flex items-start gap-2.5">
              <Tag kind={k} className="mt-0.5 w-[118px] justify-center" />
              <span className="text-[11.5px] leading-snug text-sub">{DATA_TAG_HELP[k]}</span>
            </div>
          ))}
        </div>
        <div className="mt-4 rounded-xl bg-chip p-3 font-mono text-[10.5px] text-faint">React 19 · TypeScript · Vite · Three.js r186 · Tailwind v4 · Lucide · canvas-confetti</div>
      </div>
    </Modal>
  )
}

/* ---------------------------------------------------------------- classroom modal */

/** Last 60 s of a live reading. */
function Sparkline({ values, span, color }: { values: number[]; span: number; color: string }) {
  const pts = values.length > 1 ? values : [values[0] ?? 0, values[0] ?? 0]
  const mid = (Math.min(...pts) + Math.max(...pts)) / 2
  const half = Math.max(span / 2, (Math.max(...pts) - Math.min(...pts)) / 2)
  const d = pts.map((v, i) => `${i ? 'L' : 'M'}${(i / (pts.length - 1)) * 100},${16 - ((v - mid) / half) * 12}`).join(' ')
  return (
    <svg viewBox="0 0 100 30" className="h-7 w-full" preserveAspectRatio="none" aria-hidden>
      <path d={d} fill="none" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

export function ClassroomModal() {
  const id = useApp((s) => s.classroomModal)
  const room = useApp((s) => s.rooms.find((r) => r.id === id))
  const fireMode = useApp((s) => s.fire.phase === 'alarm' || s.fire.phase === 'evacuating')
  const outdoor = useApp((s) => s.outdoorTemp)
  if (!room) return null
  const { setpoint, acMode: mode, fan } = room
  const setSetpoint = (f: (v: number) => number) => actions.setRoom(room.id, { setpoint: f(setpoint) })
  const setMode = (m: AcMode) => actions.setRoom(room.id, { acMode: m })
  const setFan = (n: number) => actions.setRoom(room.id, { fan: n as 1 | 2 | 3, acMode: mode === 'auto' ? 'cool' : mode })
  const hist = getRoomHistory(room.id)
  const close = () => store.set({ classroomModal: null })
  return (
    <Modal onClose={close} className="max-w-[980px]" label={`Room ${room.number} inspector`}>
      <div className="scroll-thin max-h-[calc(100vh-32px)] overflow-y-auto p-5">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <div className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-cyan-400">
              {room.floor} · Room {room.number} {room.verified && '· Verified'}
            </div>
            <h2 className="text-[22px] font-bold tracking-tight text-ink">{room.number === 303 ? 'ICT Computer Lab & ABHS' : room.name}</h2>
            <div className="mt-1 flex flex-wrap gap-1.5">
              <Chip tone="cyan">
                <StatusDot color="currentColor" pulse /> {room.status.replace('-', ' ')}
              </Chip>
              <Chip>{room.occupancy} / {room.capacity} occupants</Chip>
              <Tag kind="SOURCE-DERIVED" />
            </div>
          </div>
          <button onClick={close} className="grid h-8 w-8 place-items-center rounded-lg text-faint hover:bg-chip hover:text-ink" aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="grid gap-4 md:grid-cols-[1.25fr_1fr]">
          <div>
            <EvidencePhoto room={room} className="aspect-[16/9]" />
            <div className="mt-2 rounded-xl bg-chip p-3 text-[11.5px] leading-relaxed text-sub ring-1 ring-inset ring-line">
              <span className="font-semibold text-ink">Evidence trail.</span> Room identity, number and function come from the institutional room register and IQAC photographic archive. Live readings on this card are simulated client-side.
            </div>
            <SectionTitle right={<Tag kind="SIMULATED" />}>Live Microclimate</SectionTitle>
            <div className="grid grid-cols-3 gap-2">
              {[
                { icon: <Thermometer size={13} />, label: 'Temperature', value: `${room.temp.toFixed(1)}°C`, color: '#f43f5e', values: hist?.temp ?? [room.temp], span: 0.6 },
                { icon: <Droplets size={13} />, label: 'Humidity', value: `${room.humidity.toFixed(0)}%`, color: '#22d3ee', values: hist?.humidity ?? [room.humidity], span: 3 },
                { icon: <Wind size={13} />, label: 'CO₂', value: `${Math.round(room.co2)} ppm`, color: '#10b981', values: hist?.co2 ?? [room.co2], span: 40 },
              ].map((m) => (
                <div key={m.label} className="rounded-xl bg-chip p-2.5 ring-1 ring-inset ring-line">
                  <div className="flex items-center gap-1.5 text-[10.5px] text-faint" style={{ color: m.color }}>
                    {m.icon} <span className="text-faint">{m.label}</span>
                  </div>
                  <div className="mt-1 font-mono text-[17px] font-semibold text-ink">{m.value}</div>
                  <Sparkline values={m.values} span={m.span} color={m.color} />
                </div>
              ))}
            </div>
            <div className="mt-2 text-[11px] text-faint">Air quality: {co2Label(room.co2)} · Noise {room.noise.toFixed(0)} dBA</div>
          </div>

          <div className="space-y-3">
            <div className="rounded-2xl bg-chip p-3.5 ring-1 ring-inset ring-line">
              <SectionTitle right={<Tag kind="SIMULATED" />}>VRF Setpoint Controller</SectionTitle>
              <div className="flex items-center justify-center gap-3">
                <button onClick={() => setSetpoint((v) => Math.max(16, v - 0.5))} className="grid h-9 w-9 place-items-center rounded-full bg-chip-strong text-ink hover:bg-cyan-500/20" aria-label="Lower setpoint">
                  <Minus size={16} />
                </button>
                <Dial value={setpoint - 16} max={16} display={`${setpoint.toFixed(1)}°`} label="Setpoint" size={140} minLabel="16" maxLabel="32" color={setpoint < 22 ? '#38bdf8' : setpoint > 25 ? '#f59e0b' : '#22d3ee'} />
                <button onClick={() => setSetpoint((v) => Math.min(32, v + 0.5))} className="grid h-9 w-9 place-items-center rounded-full bg-chip-strong text-ink hover:bg-cyan-500/20" aria-label="Raise setpoint">
                  <Plus size={16} />
                </button>
              </div>
              <div className="mt-3 grid grid-cols-4 gap-1">
                {([
                  ['cool', <Snowflake size={13} key="c" />],
                  ['auto', <Thermometer size={13} key="a" />],
                  ['fan', <Fan size={13} key="f" />],
                  ['dry', <Droplets size={13} key="d" />],
                ] as const).map(([m, icon]) => (
                  <button key={m} onClick={() => setMode(m)} className={cx('flex h-8 items-center justify-center gap-1 rounded-lg text-[11px] font-semibold capitalize', mode === m ? 'bg-cyan-500 text-slate-950' : 'bg-chip-strong text-sub hover:text-ink')}>
                    {icon} {m}
                  </button>
                ))}
              </div>
              <div className="mt-2.5 flex items-center gap-2 text-[11px] text-sub">
                Fan
                {[1, 2, 3].map((n) => (
                  <button key={n} onClick={() => setFan(n)} className={cx('h-6 flex-1 rounded-md font-mono text-[10px]', fan >= n ? 'bg-cyan-500/30 text-cyan-200 light:text-cyan-800' : 'bg-chip-strong text-faint')}>
                    {['LOW', 'MED', 'HIGH'][n - 1]}
                  </button>
                ))}
              </div>
              <div className="mt-2 text-[10.5px] text-faint">
                Room {room.temp.toFixed(1)} °C → target {setpoint.toFixed(1)} °C · Δ {(room.temp - setpoint).toFixed(1)} K · outdoor {outdoor.toFixed(1)} °C
              </div>
              <div className="mt-2 grid grid-cols-3 gap-1.5">
                <Metric label="VRF draw" value={room.hvacKw.toFixed(2)} unit="kW" tone="#22d3ee" />
                <Metric label="Room load" value={room.energyKw.toFixed(2)} unit="kW" tone="#f59e0b" />
                <Metric label="Occupants" value={String(room.occupancy)} unit={`/ ${room.capacity}`} />
              </div>
              <div className="mt-2 flex items-center justify-between text-[11px] text-sub">
                <span>{fireMode ? 'Shut down by fire alarm' : room.acOn ? 'Unit running' : 'Unit off'}</span>
                <Toggle on={room.acOn} onChange={(v) => actions.setRoom(room.id, { acOn: v })} label="VRF power" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              {room.devices.map((d) => {
                const on = d.kind === 'vrf' ? room.acOn && !fireMode : room.deviceOn[d.id] ?? d.status !== 'standby'
                return <Metric key={d.id} label={d.name} value={on ? 'ON' : 'OFF'} tone={on ? '#10b981' : '#f59e0b'} />
              })}
            </div>

            <button
              disabled={!room.cameraId}
              onClick={() => store.set({ classroomModal: null, cctvModal: room.cameraId ?? null })}
              className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-cyan-500 text-[12.5px] font-semibold text-slate-950 hover:bg-cyan-400 disabled:opacity-40"
            >
              <Camera size={15} /> {room.cameraId ? `Switch to CCTV feed ${room.cameraId}` : 'No CCTV in this room'}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  )
}

/* ---------------------------------------------------------------- CCTV modal */

export function CCTVModal() {
  const id = useApp((s) => s.cctvModal)
  const [camId, setCamId] = useState(id ?? 'CAM-07')
  const [ir, setIr] = useState(false)
  const [ai, setAi] = useState(true)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    if (id) {
      setCamId(id)
      setZoom(1)
      setPan({ x: 0, y: 0 })
    }
  }, [id])
  if (!id) return null
  const cam = CAMERAS.find((c) => c.id === camId)!
  const close = () => store.set({ cctvModal: null })
  const reset = () => {
    setZoom(1)
    setPan({ x: 0, y: 0 })
  }
  const snapshot = () => {
    const c = canvasRef.current
    if (!c) return
    const a = document.createElement('a')
    a.href = c.toDataURL('image/png')
    a.download = `${cam.id}-${Date.now()}.png`
    a.click()
  }
  const detections = cam.roomNumber
    ? [
        { label: 'Smart Display 86"', conf: 0.98, color: '#f59e0b' },
        { label: 'Active Laptop', conf: 0.94, color: '#10b981' },
        { label: 'Student 44733013 / CSE', conf: 0.97, color: '#22d3ee' },
        { label: `Students (others) × ${Math.max(0, cam.detections - 3)}`, conf: 0.89, color: '#22d3ee' },
      ]
    : [
        { label: `Persons × ${cam.detections}`, conf: 0.92, color: '#22d3ee' },
        { label: 'Vehicle', conf: 0.91, color: '#f59e0b' },
      ]

  return (
    <Modal onClose={close} className="max-w-[1180px]" label={`${cam.id} live stream`}>
      <div className="grid md:grid-cols-[1fr_280px]">
        <div className="p-3">
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            {CAMERAS.map((c) => (
              <button key={c.id} onClick={() => { setCamId(c.id); reset() }} className={cx('h-7 rounded-lg px-2 font-mono text-[10.5px] font-semibold', c.id === camId ? 'bg-cyan-500 text-slate-950' : 'bg-chip text-sub hover:text-ink')}>
                {c.id}
              </button>
            ))}
            <div className="flex-1" />
            <Tag kind="SIMULATED" />
          </div>
          <div
            className="relative cursor-grab overflow-hidden rounded-xl ring-1 ring-line active:cursor-grabbing"
            onPointerDown={(e) => {
              drag.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y }
              ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
            }}
            onPointerMove={(e) => {
              const d = drag.current
              if (!d || zoom <= 1) return
              const k = 960 / (e.currentTarget.clientWidth || 960)
              const lim = (480 * (zoom - 1))
              setPan({ x: Math.max(-lim, Math.min(lim, d.px + (e.clientX - d.x) * k)), y: Math.max(-lim * 0.56, Math.min(lim * 0.56, d.py + (e.clientY - d.y) * k)) })
            }}
            onPointerUp={() => (drag.current = null)}
            onWheel={(e) => setZoom((z) => Math.max(1, Math.min(4, z - e.deltaY * 0.0015)))}
          >
            <CCTVFeed cam={cam} ir={ir} zoom={zoom} pan={pan} overlays={ai} canvasRef={canvasRef} />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <button onClick={() => setIr((v) => !v)} className={cx('flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[11.5px] font-semibold', ir ? 'bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-400/40' : 'bg-chip text-sub hover:text-ink')}>
              <Moon size={13} /> IR Night Vision
            </button>
            <button onClick={() => setAi((v) => !v)} className={cx('flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[11.5px] font-semibold', ai ? 'bg-cyan-500/20 text-cyan-300 ring-1 ring-cyan-400/40 light:text-cyan-700' : 'bg-chip text-sub hover:text-ink')}>
              <ScanLine size={13} /> AI Detection
            </button>
            <div className="flex h-8 items-center gap-1 rounded-lg bg-chip px-1.5">
              <button onClick={() => setZoom((z) => Math.max(1, z - 0.5))} className="grid h-6 w-6 place-items-center rounded text-sub hover:text-ink" aria-label="Zoom out">
                <Minus size={13} />
              </button>
              <span className="w-10 text-center font-mono text-[11px] text-ink">{zoom.toFixed(1)}×</span>
              <button onClick={() => setZoom((z) => Math.min(4, z + 0.5))} className="grid h-6 w-6 place-items-center rounded text-sub hover:text-ink" aria-label="Zoom in">
                <Plus size={13} />
              </button>
            </div>
            <button onClick={reset} className="flex h-8 items-center gap-1.5 rounded-lg bg-chip px-2.5 text-[11.5px] font-semibold text-sub hover:text-ink">
              <RotateCcw size={13} /> Reset pan
            </button>
            <button onClick={snapshot} className="flex h-8 items-center gap-1.5 rounded-lg bg-chip px-2.5 text-[11.5px] font-semibold text-sub hover:text-ink">
              <Download size={13} /> Snapshot
            </button>
            <span className="ml-auto text-[10.5px] text-faint">Scroll to zoom · drag to pan</span>
          </div>
        </div>
        <aside className="border-t border-line p-4 md:border-l md:border-t-0">
          <div className="flex items-start justify-between">
            <div>
              <div className="font-mono text-[11px] font-semibold text-cyan-400">{cam.id}</div>
              <div className="text-[15px] font-semibold text-ink">{cam.name}</div>
              <div className="text-[11px] text-faint">{cam.zone}</div>
            </div>
            <button onClick={close} className="grid h-8 w-8 place-items-center rounded-lg text-faint hover:bg-chip hover:text-ink" aria-label="Close">
              <X size={16} />
            </button>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-1.5">
            <Metric label="Resolution" value="4K UHD" />
            <Metric label="Frame rate" value={`${cam.fps} FPS`} />
            <Metric label="Field of view" value={`${cam.fov}°`} />
            <Metric label="Codec" value="H.265" />
          </div>
          <SectionTitle>AI Detections</SectionTitle>
          <div className="space-y-1">
            {detections.map((d) => (
              <div key={d.label} className="flex items-center gap-2 rounded-lg bg-chip px-2 py-1.5 text-[11px]">
                <Crosshair size={12} style={{ color: d.color }} />
                <span className="flex-1 truncate text-ink">{d.label}</span>
                <span className="font-mono text-faint">{d.conf.toFixed(2)}</span>
              </div>
            ))}
          </div>
          {cam.roomNumber && (
            <button
              onClick={() => store.set({ cctvModal: null, classroomModal: `R${cam.roomNumber}` })}
              className="mt-3 flex h-9 w-full items-center justify-center gap-1.5 rounded-xl bg-chip-strong text-[12px] font-semibold text-ink ring-1 ring-inset ring-line hover:bg-chip"
            >
              <Eye size={14} /> Room {cam.roomNumber} Inspector
            </button>
          )}
          <p className="mt-3 text-[10.5px] leading-relaxed text-faint">The video stream is a client-side canvas simulation. No real camera feed or personal data is used.</p>
        </aside>
      </div>
    </Modal>
  )
}
