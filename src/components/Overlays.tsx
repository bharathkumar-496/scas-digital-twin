import { CheckCircle2, ChevronLeft, ChevronRight, Pause, Play, Siren, Users, X } from 'lucide-react'
import { useEffect } from 'react'
import { TOUR } from '../data/tour'
import { goToStep, stopFireDrill, stopTour } from '../lib/controllers'
import { store, useApp } from '../state/store'
import { cx, Tag } from './ui'

export function FireDrillBanner() {
  const fire = useApp((s) => s.fire)
  if (fire.phase === 'idle') return null
  const done = fire.phase === 'complete'
  const pct = fire.total ? (fire.evacuated / fire.total) * 100 : 0
  const secs = done ? Math.round((performance.now() - fire.startedAt) / 1000) : 0
  return (
    <div className="pointer-events-none absolute left-1/2 top-[218px] z-40 w-[min(560px,calc(100vw-32px))] -translate-x-1/2">
      <div className={cx('pointer-events-auto overflow-hidden rounded-2xl text-white shadow-[0_0_40px_rgba(244,63,94,0.45)] ring-1 ring-white/15 anim-rise', done ? 'bg-emerald-600/90' : 'alarm-bg')}>
        <div className="flex items-center gap-3 px-4 py-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-black/25">{done ? <CheckCircle2 size={20} /> : <Siren size={20} />}</span>
          <div className="min-w-0 flex-1">
            <div className="text-[10.5px] font-bold uppercase tracking-[0.2em] opacity-85">{done ? 'All clear · Drill complete' : fire.phase === 'alarm' ? 'Fire alarm · Zone F2-N' : 'Evacuation in progress'}</div>
            <div className="truncate text-[14px] font-semibold">Room 345 Cyber Security Lab · smoke detected</div>
          </div>
          <div className="text-right">
            <div className="flex items-center justify-end gap-1 font-mono text-[18px] font-bold leading-none">
              <Users size={15} /> {fire.evacuated.toLocaleString('en-IN')}
            </div>
            <div className="text-[10px] opacity-80">of {fire.total.toLocaleString('en-IN')} evacuated</div>
          </div>
          <button onClick={() => stopFireDrill()} className="grid h-8 w-8 place-items-center rounded-lg bg-black/20 hover:bg-black/35" aria-label="End drill">
            <X size={15} />
          </button>
        </div>
        <div className="h-1.5 bg-black/25">
          <div className="h-full bg-white transition-all duration-150" style={{ width: `${pct}%` }} />
        </div>
        <div className="flex items-center justify-between bg-black/20 px-4 py-1.5 text-[10.5px]">
          <span>{done ? `Building cleared in ${Math.floor(secs / 60)}m ${secs % 60}s (simulated drill)` : 'Egress: east stair core → lobby → portico → eastern assembly point'}</span>
          <Tag kind="SIMULATED" className="!text-white/90 !ring-white/30" />
        </div>
      </div>
    </div>
  )
}

const STEP_SECONDS = 8

export function TourOverlay() {
  const tour = useApp((s) => s.tour)
  useEffect(() => {
    if (!tour.active || !tour.playing) return
    const id = window.setTimeout(() => {
      if (tour.step < TOUR.length - 1) goToStep(tour.step + 1)
      else store.set({ tour: { ...tour, playing: false } })
    }, STEP_SECONDS * 1000)
    return () => window.clearTimeout(id)
  }, [tour])

  useEffect(() => {
    if (!tour.active) return
    const h = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return
      if (e.key === 'ArrowRight') goToStep(Math.min(TOUR.length - 1, tour.step + 1))
      if (e.key === 'ArrowLeft') goToStep(Math.max(0, tour.step - 1))
      if (e.key === ' ') {
        e.preventDefault()
        store.set({ tour: { ...tour, playing: !tour.playing } })
      }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [tour])

  if (!tour.active) return null
  const step = TOUR[tour.step]
  return (
    <div className="pointer-events-none absolute bottom-[124px] left-1/2 z-30 w-[min(640px,calc(100vw-32px))] -translate-x-1/2 lg:left-[calc(50%-150px)]">
      <div key={tour.step} className="glass-strong pointer-events-auto p-4 anim-rise">
        <div className="flex items-center gap-2">
          <span className="rounded-md bg-cyan-500/15 px-1.5 py-0.5 font-mono text-[10.5px] font-bold text-cyan-400">
            {String(tour.step + 1).padStart(2, '0')} / {TOUR.length}
          </span>
          <span className="flex-1 truncate text-[14px] font-semibold text-ink">{step.title}</span>
          <button onClick={() => goToStep(Math.max(0, tour.step - 1))} className="grid h-7 w-7 place-items-center rounded-lg text-sub hover:bg-chip hover:text-ink" aria-label="Previous step">
            <ChevronLeft size={16} />
          </button>
          <button onClick={() => store.set({ tour: { ...tour, playing: !tour.playing } })} className="grid h-7 w-7 place-items-center rounded-lg text-sub hover:bg-chip hover:text-ink" aria-label={tour.playing ? 'Pause' : 'Play'}>
            {tour.playing ? <Pause size={14} /> : <Play size={14} />}
          </button>
          <button onClick={() => goToStep(Math.min(TOUR.length - 1, tour.step + 1))} className="grid h-7 w-7 place-items-center rounded-lg text-sub hover:bg-chip hover:text-ink" aria-label="Next step">
            <ChevronRight size={16} />
          </button>
          <button onClick={stopTour} className="grid h-7 w-7 place-items-center rounded-lg text-sub hover:bg-chip hover:text-ink" aria-label="Exit tour">
            <X size={15} />
          </button>
        </div>
        <p className="mt-2 text-[13px] leading-relaxed text-sub">{step.narration}</p>
        <div className="mt-3 flex gap-1">
          {TOUR.map((_, i) => (
            <button key={i} onClick={() => goToStep(i)} className="h-1 flex-1 overflow-hidden rounded-full bg-chip-strong" aria-label={`Go to step ${i + 1}`}>
              <span
                className={cx('block h-full rounded-full bg-cyan-400', i === tour.step && tour.playing && 'origin-left')}
                style={
                  i < tour.step
                    ? { width: '100%' }
                    : i === tour.step
                      ? { width: '100%', animation: tour.playing ? `tourbar ${STEP_SECONDS}s linear both` : undefined, transform: tour.playing ? undefined : 'scaleX(0.5)', transformOrigin: 'left' }
                      : { width: 0 }
                }
              />
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
