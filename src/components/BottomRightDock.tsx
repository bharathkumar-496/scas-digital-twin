import { Activity, ChevronDown, TriangleAlert, Video, Zap } from 'lucide-react'
import { useState } from 'react'
import { CAMERAS } from '../data/campus'
import { actions, store, useApp, type DockTab } from '../state/store'
import { CCTVFeed } from './Feeds'
import { STATUS_COLOR } from '../three/textures'
import { Bar, Chip, cx, StatusDot, Toggle } from './ui'

export function BottomRightDock() {
  const tab = useApp((s) => s.dockTab)
  const min = useApp((s) => s.dockMinimized)
  const rooms = useApp((s) => s.rooms)
  const solar = useApp((s) => s.solar)
  const alerts = useApp((s) => s.alerts)
  const selection = useApp((s) => s.selection)
  const [camOn, setCamOn] = useState<Record<string, boolean>>({})
  const inSession = rooms.filter((r) => r.status === 'in-session').length
  const activeAlerts = alerts.filter((a) => !a.acknowledged).length

  if (min) {
    return (
      <button
        onClick={() => store.set({ dockMinimized: false })}
        className="glass pointer-events-auto flex h-11 items-center gap-2 self-end rounded-full px-4 text-[12px] font-semibold text-ink"
        title="Expand live activity"
      >
        <Activity size={15} className="text-cyan-400" /> Live Activity
        {activeAlerts > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-rose-500 px-1 font-mono text-[10px] text-white">{activeAlerts}</span>}
      </button>
    )
  }

  const tabs: { id: DockTab; label: string }[] = [
    { id: 'rooms', label: `Rooms (${inSession}/${rooms.length})` },
    { id: 'cctv', label: `CCTV (${CAMERAS.length}/${CAMERAS.length})` },
    { id: 'solar', label: `Solar (${solar.length} Str)` },
    { id: 'alerts', label: `Alerts (${alerts.length})` },
  ]
  const sorted = [...rooms].sort((a, b) => (a.status === b.status ? a.number - b.number : a.status === 'in-session' ? -1 : 1))

  return (
    <section className="glass pointer-events-auto flex h-[272px] shrink-0 flex-col p-2" aria-label="Live activity">
      <div className="flex items-center gap-1">
        <div className="scroll-thin flex flex-1 gap-0.5 overflow-x-auto rounded-xl bg-chip p-0.5">
          {tabs.map((t) => (
            <button key={t.id} onClick={() => store.set({ dockTab: t.id })} className={cx('h-7 shrink-0 rounded-lg px-2 text-[10.5px] font-semibold transition', tab === t.id ? 'bg-chip-strong text-ink ring-1 ring-line' : 'text-faint hover:text-ink')}>
              {t.label}
            </button>
          ))}
        </div>
        <button onClick={() => store.set({ dockMinimized: true })} className="grid h-7 w-7 place-items-center rounded-lg text-faint hover:bg-chip hover:text-ink" aria-label="Minimise dock">
          <ChevronDown size={15} />
        </button>
      </div>
      <div className="scroll-thin mt-1.5 min-h-0 flex-1 space-y-1 overflow-y-auto pr-0.5">
        {tab === 'rooms' &&
          sorted.map((r) => {
            const sel = selection?.kind === 'room' && selection.id === r.id
            return (
              <button key={r.id} onClick={() => actions.select({ kind: 'room', id: r.id })} className={cx('flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left transition', sel ? 'bg-cyan-500/10 ring-1 ring-inset ring-cyan-400/30' : 'hover:bg-chip')}>
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full font-mono text-[10.5px] font-bold ring-2" style={{ color: STATUS_COLOR[r.status], ['--tw-ring-color' as string]: STATUS_COLOR[r.status] + '66' }}>
                  {r.number}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12px] font-medium text-ink">{r.name}</span>
                  <span className="block font-mono text-[10px] text-faint">
                    {r.floor} · {Math.round(r.co2)} ppm · {r.temp.toFixed(1)}°C
                  </span>
                </span>
                {r.status === 'in-session' ? <Chip tone="cyan">{r.occupancy}/{r.capacity}</Chip> : <Chip tone={r.status === 'available' ? 'green' : 'amber'}>{r.status === 'available' ? 'Free' : 'Maint.'}</Chip>}
              </button>
            )
          })}
        {tab === 'cctv' &&
          CAMERAS.map((c) => {
            const on = camOn[c.id] ?? true
            return (
              <div key={c.id} onClick={() => actions.select({ kind: 'camera', id: c.id })} className={cx('flex cursor-pointer items-center gap-2.5 rounded-xl p-1.5 transition', selection?.kind === 'camera' && selection.id === c.id ? 'bg-cyan-500/10 ring-1 ring-inset ring-cyan-400/30' : 'hover:bg-chip')}>
                <div className={cx('w-[68px] shrink-0 overflow-hidden rounded-lg ring-1 ring-line', !on && 'opacity-30 grayscale')}>
                  <CCTVFeed cam={c} still osd={false} overlays={false} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12px] font-medium text-ink">{c.name}</div>
                  <div className="truncate text-[10px] text-faint">{c.zone}</div>
                  <span className="mt-0.5 inline-flex items-center gap-1 rounded-md bg-chip-strong px-1.5 py-[1px] font-mono text-[9px] text-sub">
                    <StatusDot color={c.status === 'online' ? '#10b981' : '#f59e0b'} pulse /> {c.id} · Live
                  </span>
                </div>
                <Toggle on={on} onChange={(v) => setCamOn((s) => ({ ...s, [c.id]: v }))} label={`Toggle ${c.id}`} />
              </div>
            )
          })}
        {tab === 'solar' &&
          solar.map((s) => (
            <button key={s.id} onClick={() => actions.select({ kind: 'solar', id: s.id })} className={cx('w-full rounded-xl px-2.5 py-2 text-left', selection?.kind === 'solar' && selection.id === s.id ? 'bg-amber-500/10 ring-1 ring-inset ring-amber-400/30' : 'hover:bg-chip')}>
              <div className="mb-1.5 flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-[12px] font-medium text-ink">
                  <Zap size={13} className="text-amber-400" /> {s.name}
                </span>
                <Chip tone={s.health === 'optimal' ? 'green' : 'amber'}>{s.outputKw.toFixed(1)} kW</Chip>
              </div>
              <Bar value={s.outputKw} max={s.capacityKw} color={s.health === 'optimal' ? '#f59e0b' : '#f43f5e'} />
            </button>
          ))}
        {tab === 'alerts' &&
          alerts.map((a) => (
            <div key={a.id} className="rounded-xl bg-chip p-2 ring-1 ring-inset ring-line">
              <button onClick={() => actions.select(a.focus)} className="flex w-full items-start gap-2 text-left">
                <TriangleAlert size={14} className={cx('mt-0.5 shrink-0', a.severity === 'critical' ? 'text-rose-400' : a.severity === 'warning' ? 'text-amber-400' : 'text-sky-400')} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12px] font-semibold text-ink">{a.title}</span>
                  <span className="block truncate text-[10px] text-faint">
                    {a.source} · {a.time}
                  </span>
                </span>
              </button>
              <div className="mt-1.5 flex justify-end gap-1.5">
                {a.acknowledged ? (
                  <Chip tone="green">Acknowledged</Chip>
                ) : (
                  <button onClick={() => store.set((s) => ({ alerts: s.alerts.map((x) => (x.id === a.id ? { ...x, acknowledged: true } : x)) }))} className="h-6 rounded-md bg-chip-strong px-2 text-[10px] font-semibold text-ink hover:bg-cyan-500/20">
                    Acknowledge
                  </button>
                )}
                <button onClick={() => actions.select(a.focus)} className="flex h-6 items-center gap-1 rounded-md bg-cyan-500/15 px-2 text-[10px] font-semibold text-cyan-300 light:text-cyan-700">
                  <Video size={11} /> Fly to
                </button>
              </div>
            </div>
          ))}
      </div>
    </section>
  )
}
