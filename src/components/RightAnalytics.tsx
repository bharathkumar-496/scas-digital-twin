import {
  Bot,
  Camera,
  Check,
  Cpu,
  Eye,
  Fan,
  Lightbulb,
  Maximize2,
  Monitor,
  Projector,
  Radio,
  ScanLine,
  Sparkles,
  Thermometer,
  Video,
  Wifi,
  X,
  Zap,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { CAMERAS, STREETLIGHTS } from '../data/campus'
import { schedule } from '../lib/physics'
import { buildingSummary, co2Label, solarScale } from '../lib/metrics'
import { nightFactor, sunPosition } from '../lib/sun'
import { actions, store, useApp } from '../state/store'
import type { Room, RoomDevice, SolarString } from '../types'
import { CCTVFeed, EvidencePhoto } from './Feeds'
import { Bar, Chip, cx, Dial, Metric, SectionTitle, StatusDot, Tag, Toggle } from './ui'

const DEVICE_ICON: Record<RoomDevice['kind'], typeof Fan> = {
  vrf: Fan,
  projector: Projector,
  wifi: Wifi,
  display: Monitor,
  sensor: Radio,
  camera: Camera,
}

function Header({ eyebrow, title, sub, onClose, right }: { eyebrow: string; title: string; sub?: string; onClose?: () => void; right?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-start gap-2">
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-400">{eyebrow}</div>
        <h2 className="mt-0.5 truncate text-[16px] font-semibold tracking-tight text-ink">{title}</h2>
        {sub && <div className="mt-0.5 text-[11px] text-faint">{sub}</div>}
      </div>
      {right}
      {onClose && (
        <button onClick={onClose} className="grid h-7 w-7 place-items-center rounded-lg text-faint hover:bg-chip hover:text-ink" aria-label="Close inspector">
          <X size={15} />
        </button>
      )}
    </div>
  )
}

/* ---------------------------------------------------------------- room */

function RoomInspector({ room }: { room: Room }) {
  const occ = room.capacity ? room.occupancy / room.capacity : 0
  const statusTone = room.status === 'in-session' ? 'cyan' : room.status === 'available' ? 'green' : 'amber'
  return (
    <div className="anim-rise">
      <Header
        eyebrow={`${room.floor} · Room ${room.number}`}
        title={room.name}
        sub={`${room.type[0].toUpperCase()}${room.type.slice(1)} · ${room.rect.w.toFixed(1)} × ${room.rect.d.toFixed(1)} m`}
        onClose={() => store.set({ selection: null })}
      />
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <Chip tone={statusTone}>
          <StatusDot color="currentColor" pulse={room.status === 'in-session'} /> {room.status.replace('-', ' ')}
        </Chip>
        {room.verified && <Chip tone="green"><Check size={10} /> Verified room</Chip>}
        <Tag kind="SOURCE-DERIVED" />
      </div>
      <EvidencePhoto room={room} className="aspect-[16/9]" />

      <div className="mt-3 flex items-center gap-3">
        <Dial value={occ * 100} label="Occupancy" display={`${Math.round(occ * 100)}%`} size={112} minLabel="0" maxLabel={String(room.capacity)} color={room.status === 'in-session' ? '#22d3ee' : '#10b981'} />
        <div className="flex-1 space-y-2">
          <div>
            <div className="text-[10px] text-faint">Headcount</div>
            <div className="font-mono text-[18px] font-semibold text-ink">
              {room.occupancy}
              <span className="text-[12px] text-faint"> / {room.capacity}</span>
            </div>
          </div>
          <div>
            <div className="mb-1 flex justify-between text-[10px] text-faint">
              <span>Load</span>
              <span className="font-mono text-sub">{room.energyKw.toFixed(2)} kW</span>
            </div>
            <Bar value={room.energyKw} max={4.5} color="#f59e0b" />
          </div>
          <Tag kind="DERIVED" />
        </div>
      </div>

      <SectionTitle right={<Tag kind="SIMULATED" />}>IAQ Sensors</SectionTitle>
      <div className="grid grid-cols-2 gap-1.5">
        <Metric label="Temperature" value={room.temp.toFixed(1)} unit="°C" />
        <Metric label="Humidity" value={room.humidity.toFixed(0)} unit="% RH" />
        <Metric label="CO₂" value={Math.round(room.co2).toString()} unit={`ppm · ${co2Label(room.co2)}`} tone={room.co2 > 1000 ? '#f43f5e' : room.co2 > 800 ? '#f59e0b' : undefined} />
        <Metric label="Noise" value={room.noise.toFixed(0)} unit="dBA" />
      </div>

      <SectionTitle right={<span className="text-[10px] text-faint">{room.devices.length} devices</span>}>Connected Devices</SectionTitle>
      <div className="space-y-1">
        {room.devices.map((d) => {
          const Icon = DEVICE_ICON[d.kind]
          const on = d.kind === 'vrf' ? room.acOn : room.deviceOn[d.id] ?? d.status !== 'standby'
          return (
            <div key={d.id} className="flex items-center gap-2.5 rounded-xl bg-chip px-2.5 py-2 ring-1 ring-inset ring-line">
              <span className={cx('grid h-7 w-7 place-items-center rounded-lg', on ? 'bg-cyan-500/15 text-cyan-400' : 'bg-chip-strong text-faint')}>
                <Icon size={14} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12px] font-medium text-ink">{d.name}</div>
                <div className="truncate font-mono text-[10px] text-faint">
                  {d.id} · {d.kind === 'vrf' ? (room.acOn ? `${room.acMode} · ${room.setpoint.toFixed(1)} °C · ${room.hvacKw.toFixed(2)} kW` : 'Off') : d.detail}
                </div>
              </div>
              <Toggle on={on} onChange={(v) => actions.setRoom(room.id, d.kind === 'vrf' ? { acOn: v } : { deviceOn: { ...room.deviceOn, [d.id]: v } })} label={`Toggle ${d.name}`} />
            </div>
          )
        })}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button onClick={() => store.set({ classroomModal: room.id })} className="flex h-9 items-center justify-center gap-1.5 rounded-xl bg-cyan-500 text-[12px] font-semibold text-slate-950 hover:bg-cyan-400">
          <Maximize2 size={14} /> Full Inspector
        </button>
        <button
          disabled={!room.cameraId}
          onClick={() => room.cameraId && store.set({ cctvModal: room.cameraId })}
          className="flex h-9 items-center justify-center gap-1.5 rounded-xl bg-chip-strong text-[12px] font-semibold text-ink ring-1 ring-inset ring-line hover:bg-chip disabled:opacity-40"
          title={room.cameraId ? `Open ${room.cameraId}` : 'No camera in this room'}
        >
          <Video size={14} /> {room.cameraId ?? 'No'} CCTV
        </button>
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------- camera */

function CameraInspector({ id }: { id: string }) {
  const cam = CAMERAS.find((c) => c.id === id)!
  const time = useApp((s) => s.time)
  const night = nightFactor(sunPosition(time).elevation) > 0.5
  return (
    <div className="anim-rise">
      <Header eyebrow={`CCTV · ${cam.id}`} title={cam.name} sub={cam.zone} onClose={() => store.set({ selection: null })} />
      <div className="mb-3 flex flex-wrap gap-1.5">
        <Chip tone={cam.status === 'online' ? 'green' : 'amber'}>
          <StatusDot color="currentColor" pulse /> {cam.status === 'online' ? 'Live' : 'Degraded'}
        </Chip>
        <Chip tone="cyan">1080p preview</Chip>
        <Tag kind="SIMULATED" />
      </div>
      <div className="relative overflow-hidden rounded-xl ring-1 ring-line">
        <CCTVFeed cam={cam} ir={night && cam.ir} />
      </div>
      <div className="mt-3 grid grid-cols-3 gap-1.5">
        <Metric label="FPS" value={String(cam.fps)} />
        <Metric label="FOV" value={`${cam.fov}°`} />
        <Metric label="IR" value={cam.ir ? (night ? 'ACTIVE' : 'AUTO') : 'N/A'} tone={cam.ir && night ? '#10b981' : undefined} />
      </div>
      <div className="mt-1.5 grid grid-cols-2 gap-1.5">
        <Metric label="Stream" value={cam.resolution} />
        <Metric label="AI targets" value={String(cam.detections)} tone="#22d3ee" />
      </div>
      <SectionTitle>AI Target Tracking</SectionTitle>
      <div className="space-y-1 text-[11px]">
        {(cam.roomNumber
          ? [['Students', Math.max(0, cam.detections - 2)], ['Active Laptop', 1], ['Smart Display 86"', 1]]
          : [['Persons', cam.detections], ['Vehicles', cam.id === 'CAM-01' || cam.id === 'CAM-02' ? 1 : 0]]
        ).map(([k, v]) => (
          <div key={k as string} className="flex items-center justify-between rounded-lg bg-chip px-2.5 py-1.5">
            <span className="flex items-center gap-1.5 text-sub">
              <ScanLine size={12} className="text-cyan-400" /> {k}
            </span>
            <span className="font-mono text-ink">{v}</span>
          </div>
        ))}
      </div>
      <button onClick={() => store.set({ cctvModal: cam.id })} className="mt-3 flex h-9 w-full items-center justify-center gap-1.5 rounded-xl bg-cyan-500 text-[12px] font-semibold text-slate-950 hover:bg-cyan-400">
        <Eye size={14} /> Launch 4K Live Stream Modal
      </button>
    </div>
  )
}

/* ---------------------------------------------------------------- solar */

function SolarInspector({ id }: { id: SolarString['id'] }) {
  const solar = useApp((s) => s.solar)
  const str = solar.find((s) => s.id === id)!
  const total = solar.reduce((a, b) => a + b.outputKw, 0)
  const rowHealth = [0.99, 0.98, 0.97, 0.99, 0.98].map((h, i) => (str.health === 'degraded' && i >= 2 ? h - 0.16 - i * 0.02 : h))
  return (
    <div className="anim-rise">
      <Header eyebrow="Rooftop PV" title={str.name} sub={`${str.panels} × ${str.panelWatt} W modules · ${str.inverter}`} onClose={() => store.set({ selection: null })} />
      <div className="mb-3 flex gap-1.5">
        <Chip tone={str.health === 'optimal' ? 'green' : 'amber'}>{str.health === 'optimal' ? 'Optimal' : 'Degraded · soiling'}</Chip>
        <Tag kind="SIMULATED" />
      </div>
      <div className="flex items-center gap-3">
        <Dial value={str.outputKw} max={str.capacityKw} label="kW out" display={str.outputKw.toFixed(1)} color={str.health === 'optimal' ? '#f59e0b' : '#f43f5e'} size={112} minLabel="0" maxLabel="45" />
        <div className="grid flex-1 grid-cols-2 gap-1.5">
          <Metric label="Voltage" value={str.voltage.toFixed(0)} unit="V" />
          <Metric label="Current" value={str.current.toFixed(1)} unit="A" />
          <Metric label="Module" value={str.moduleTemp.toFixed(0)} unit="°C" />
          <Metric label="Eff." value={str.efficiency.toFixed(0)} unit="%" />
        </div>
      </div>
      <SectionTitle>Row Health</SectionTitle>
      <div className="grid grid-cols-5 gap-1">
        {rowHealth.map((h, i) => (
          <div key={i} className="rounded-lg bg-chip p-1.5 text-center">
            <div className="font-mono text-[10px] text-faint">
              {id}
              {i + 1}
            </div>
            <div className="font-mono text-[12px] font-semibold" style={{ color: h > 0.9 ? '#10b981' : '#f59e0b' }}>
              {Math.round(h * 100)}%
            </div>
          </div>
        ))}
      </div>
      <SectionTitle right={<span className="font-mono text-[10px] text-sub">{total.toFixed(1)} kW</span>}>String Breakdown</SectionTitle>
      <div className="space-y-2">
        {solar.map((s) => (
          <button key={s.id} onClick={() => actions.select({ kind: 'solar', id: s.id })} className={cx('w-full rounded-lg px-2 py-1.5 text-left', s.id === id ? 'bg-amber-500/10 ring-1 ring-inset ring-amber-400/30' : 'hover:bg-chip')}>
            <div className="mb-1 flex justify-between text-[11px]">
              <span className="font-medium text-ink">String {s.id}</span>
              <span className="font-mono text-sub">{s.outputKw.toFixed(1)} / 45 kW</span>
            </div>
            <Bar value={s.outputKw} max={45} color={s.health === 'optimal' ? '#f59e0b' : '#f43f5e'} />
          </button>
        ))}
      </div>
      <SectionTitle>Inverter</SectionTitle>
      <div className="grid grid-cols-3 gap-1.5">
        <Metric label="AC out" value={(str.outputKw * 0.975).toFixed(1)} unit="kW" />
        <Metric label="Grid" value="415" unit="V" />
        <Metric label="Freq" value="50.0" unit="Hz" />
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------- streetlight */

function StreetlightInspector({ id }: { id: string }) {
  const sl = STREETLIGHTS.find((s) => s.id === id)!
  const time = useApp((s) => s.time)
  const night = nightFactor(sunPosition(time).elevation)
  const on = night > 0.4
  return (
    <div className="anim-rise">
      <Header eyebrow="LoRa Mesh Lighting" title={`${sl.id} · ${sl.name}`} sub={`Node ${sl.node}`} onClose={() => store.set({ selection: null })} />
      <div className="mb-3 flex gap-1.5">
        <Chip tone={on ? 'amber' : 'neutral'}>
          <Lightbulb size={10} /> {on ? 'ON · dusk schedule' : 'OFF · daylight'}
        </Chip>
        <Tag kind="SIMULATED" />
      </div>
      <div className="flex items-center gap-3">
        <Dial value={on ? 85 : 0} label="Dimming" display={on ? '85%' : '0%'} color="#f59e0b" size={112} />
        <div className="grid flex-1 grid-cols-1 gap-1.5">
          <Metric label="Power" value={on ? (sl.powerW * 0.85).toFixed(0) : '0'} unit="W" />
          <Metric label="RSSI" value={String(sl.rssi)} unit="dBm" />
        </div>
      </div>
      <p className="mt-3 rounded-xl bg-chip p-2.5 text-[11px] leading-relaxed text-sub">
        Luminaires switch on when the sun drops below the horizon. Drag the time slider past 18:15 to see the pools of light on the approach road.
      </p>
    </div>
  )
}

/* ---------------------------------------------------------------- idle overview */

function Overview() {
  const rooms = useApp((s) => s.rooms)
  const solar = useApp((s) => s.solar)
  const ai = useApp((s) => s.ai)
  const weather = useApp((s) => s.weather)
  const commonKw = useApp((s) => s.commonKw)
  const time = useApp((s) => s.time)
  const baselineKw = useApp((s) => s.aiBaselineKw)
  const m = buildingSummary(rooms, solar, commonKw)
  const [step, setStep] = useState(0)

  useEffect(() => {
    if (ai !== 'analysing') return
    setStep(0)
    const ids = [1, 2, 3].map((n) => window.setTimeout(() => setStep(n), n * 700))
    const done = window.setTimeout(() => store.set({ ai: 'applied' }), 2400)
    return () => [...ids, done].forEach(window.clearTimeout)
  }, [ai])

  const load = m.loadKw
  const net = m.solarKw - load
  const saving = baselineKw > 0 ? (baselineKw - load) / baselineKw : 0
  const vacantSetback = rooms.filter((r) => r.occupancy === 0 && r.acOn).length
  // 24 h profile: occupied and unoccupied load anchored to the live reading
  const shape = (min: number) => 0.32 + 0.68 * schedule(min)
  const pts = Array.from({ length: 25 }, (_, h) => {
    const s = 154.8 * solarScale(Math.min(1439, h * 60), weather)
    const l = (load * shape(Math.min(1439, h * 60))) / shape(time)
    return [h, s, Math.min(175, l)] as const
  })
  const W = 296
  const H = 70
  const x = (h: number) => (h / 24) * W
  const y = (v: number) => H - (v / 180) * H
  const path = (k: 1 | 2) => pts.map((p, i) => `${i ? 'L' : 'M'}${x(p[0]).toFixed(1)},${y(p[k]).toFixed(1)}`).join(' ')

  return (
    <div className="anim-rise">
      <Header eyebrow="Building Overview" title="Centre for Advanced Studies" sub="SCAS Block · 3 floors · 48 rooms · 2 light-wells" right={<Tag kind="DERIVED" />} />
      <div className="grid grid-cols-3 gap-1.5">
        <Metric label="Students" value={m.students.toLocaleString('en-IN')} />
        <Metric label="Utilisation" value={m.utilisation.toFixed(1)} unit="%" />
        <Metric label="Rooms live" value={`${m.inSession}/${m.total}`} />
      </div>

      <SectionTitle right={<Tag kind="SIMULATED" />}>Campus Load vs Solar</SectionTitle>
      <div className="rounded-xl bg-chip p-2.5 ring-1 ring-inset ring-line">
        <div className="flex items-end justify-between">
          <div>
            <div className="text-[10px] text-faint">Solar generation</div>
            <div className="font-mono text-[17px] font-semibold text-amber-400">{m.solarKw.toFixed(1)} kW</div>
          </div>
          <div className="text-right">
            <div className="text-[10px] text-faint">Building load</div>
            <div className="font-mono text-[17px] font-semibold text-cyan-400">{load.toFixed(1)} kW</div>
          </div>
        </div>
        <svg viewBox={`0 0 ${W} ${H + 12}`} className="mt-2 w-full" role="img" aria-label="24 hour solar versus load">
          <defs>
            <linearGradient id="solarFill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="#f59e0b" stopOpacity="0.45" />
              <stop offset="1" stopColor="#f59e0b" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={`${path(1)} L${W},${H} L0,${H} Z`} fill="url(#solarFill)" />
          <path d={path(1)} fill="none" stroke="#f59e0b" strokeWidth="1.6" />
          <path d={path(2)} fill="none" stroke="#22d3ee" strokeWidth="1.6" strokeDasharray="4 3" />
          {[0, 6, 12, 18, 24].map((h) => (
            <text key={h} x={Math.min(W - 10, x(h))} y={H + 11} fontSize="8" fill="currentColor" className="text-faint" fontFamily="JetBrains Mono">
              {String(h).padStart(2, '0')}
            </text>
          ))}
        </svg>
        <div className={cx('mt-1.5 flex items-center justify-between rounded-lg px-2 py-1.5 text-[11px]', net >= 0 ? 'bg-emerald-500/10 text-emerald-300 light:text-emerald-700' : 'bg-rose-500/10 text-rose-300')}>
          <span>{net >= 0 ? 'Net export to grid' : 'Net import from grid'}</span>
          <span className="font-mono font-semibold">
            {net >= 0 ? '+' : ''}
            {net.toFixed(1)} kW
          </span>
        </div>
      </div>

      <SectionTitle right={<Tag kind="DERIVED" />}>AI Building Optimization</SectionTitle>
      <div className="rounded-xl bg-gradient-to-br from-cyan-500/10 to-violet-500/10 p-3 ring-1 ring-inset ring-cyan-400/20">
        {ai === 'idle' && (
          <>
            <p className="text-[11.5px] leading-relaxed text-sub">Simulate an optimisation pass across HVAC setpoints, lighting and plug loads using live occupancy.</p>
            <button onClick={() => store.set({ ai: 'analysing' })} className="mt-2.5 flex h-9 w-full items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-500 text-[12px] font-semibold text-white">
              <Sparkles size={14} /> Run AI Optimization
            </button>
          </>
        )}
        {ai === 'analysing' && (
          <div className="space-y-1.5">
            {['Reading 48 IAQ + occupancy streams', 'Modelling VRF thermal response', 'Scheduling lighting & plug loads'].map((t, i) => (
              <div key={t} className="flex items-center gap-2 text-[11.5px]">
                {step > i ? <Check size={13} className="text-emerald-400" /> : <Bot size={13} className={step === i ? 'text-cyan-400' : 'text-faint'} />}
                <span className={step >= i ? 'text-ink' : 'text-faint'}>{t}</span>
              </div>
            ))}
            <div className="shimmer mt-2 h-1.5 rounded-full bg-chip-strong" />
          </div>
        )}
        {ai === 'applied' && (
          <>
            <div className="flex items-end justify-between">
              <div>
                <div className="text-[10px] text-faint">Load reduction</div>
                <div className="font-mono text-[22px] font-bold text-emerald-400">{saving >= 0 ? '−' : '+'}{Math.abs(saving * 100).toFixed(1)}%</div>
              </div>
              <div className="text-right font-mono text-[11px] text-sub">
                {baselineKw.toFixed(1)} → {load.toFixed(1)} kW
                <div className="text-emerald-400">{(load - baselineKw).toFixed(1)} kW Δ live</div>
              </div>
            </div>
            <ul className="mt-2 space-y-1 text-[11px] text-sub">
              <li className="flex gap-1.5"><Thermometer size={12} className="mt-0.5 text-cyan-400" /> VRF setback to 26 °C in {vacantSetback} vacant rooms</li>
              <li className="flex gap-1.5"><Lightbulb size={12} className="mt-0.5 text-amber-400" /> Lights off in vacant rooms</li>
              <li className="flex gap-1.5"><Cpu size={12} className="mt-0.5 text-violet-400" /> Lab workstations sleep when the room empties</li>
              <li className="flex gap-1.5"><Zap size={12} className="mt-0.5 text-emerald-400" /> Fresh-air boost where CO₂ exceeds 800 ppm</li>
            </ul>
            <button onClick={() => store.set({ ai: 'idle' })} className="mt-2.5 h-8 w-full rounded-lg bg-chip-strong text-[11px] font-semibold text-sub hover:text-ink">
              Revert simulation
            </button>
          </>
        )}
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------- composite */

export function Inspector() {
  const sel = useApp((s) => s.selection)
  const rooms = useApp((s) => s.rooms)
  const room = sel?.kind === 'room' ? rooms.find((r) => r.id === sel.id) : undefined
  return (
    <section className="glass scroll-thin pointer-events-auto min-h-0 flex-1 overflow-y-auto p-3.5" aria-label="Inspector">
      {room ? (
        <RoomInspector key={room.id} room={room} />
      ) : sel?.kind === 'camera' ? (
        <CameraInspector key={sel.id} id={sel.id} />
      ) : sel?.kind === 'solar' ? (
        <SolarInspector key={sel.id} id={sel.id} />
      ) : sel?.kind === 'streetlight' ? (
        <StreetlightInspector key={sel.id} id={sel.id} />
      ) : (
        <Overview />
      )}
    </section>
  )
}
