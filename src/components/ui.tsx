import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { DATA_TAG_HELP } from '../data/campus'
import type { DataTag } from '../types'

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')

const TAG_STYLE: Record<DataTag, string> = {
  'SOURCE-DERIVED': 'text-violet-300 bg-violet-500/10 ring-violet-400/25 light:text-violet-700',
  SIMULATED: 'text-amber-300 bg-amber-500/10 ring-amber-400/25 light:text-amber-700',
  REAL: 'text-emerald-300 bg-emerald-500/10 ring-emerald-400/25 light:text-emerald-700',
  DERIVED: 'text-cyan-300 bg-cyan-500/10 ring-cyan-400/25 light:text-cyan-700',
}

/** Data honesty classification chip. */
export function Tag({ kind, className }: { kind: DataTag; className?: string }) {
  return (
    <span
      title={DATA_TAG_HELP[kind]}
      className={cx(
        'inline-flex shrink-0 items-center rounded-md px-1.5 py-[1px] font-mono text-[9px] font-semibold tracking-wide ring-1 ring-inset',
        TAG_STYLE[kind],
        className,
      )}
    >
      [{kind}]
    </span>
  )
}

export function IconBtn({
  active,
  tone = 'cyan',
  className,
  children,
  label,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean; tone?: 'cyan' | 'rose' | 'amber'; label?: string }) {
  const activeCls =
    tone === 'rose'
      ? 'bg-rose-500/20 text-rose-300 ring-rose-400/40'
      : tone === 'amber'
        ? 'bg-amber-500/20 text-amber-300 ring-amber-400/40'
        : 'bg-cyan-500/15 text-cyan-300 ring-cyan-400/40 light:text-cyan-700'
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cx(
        'group relative grid h-9 w-9 place-items-center rounded-xl ring-1 ring-inset transition-all duration-150 disabled:opacity-40',
        active ? activeCls : 'text-sub ring-transparent hover:bg-chip-strong hover:text-ink',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
}

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation()
        onChange(!on)
      }}
      className={cx(
        'relative h-[18px] w-8 shrink-0 rounded-full transition-colors',
        on ? 'bg-cyan-500 shadow-[0_0_12px_rgba(34,211,238,0.5)]' : 'bg-chip-strong',
      )}
    >
      <span className={cx('absolute top-[3px] h-3 w-3 rounded-full bg-white shadow transition-all', on ? 'left-[17px]' : 'left-[3px]')} />
    </button>
  )
}

export function StatusDot({ color = '#10b981', pulse }: { color?: string; pulse?: boolean }) {
  return <span className={cx('inline-block h-1.5 w-1.5 rounded-full', pulse && 'live-dot')} style={{ background: color, color }} />
}

export function Chip({ children, tone = 'neutral', className }: { children: ReactNode; tone?: 'neutral' | 'cyan' | 'green' | 'amber' | 'rose'; className?: string }) {
  const t = {
    neutral: 'bg-chip text-sub ring-line',
    cyan: 'bg-cyan-500/10 text-cyan-300 ring-cyan-400/25 light:text-cyan-700',
    green: 'bg-emerald-500/10 text-emerald-300 ring-emerald-400/25 light:text-emerald-700',
    amber: 'bg-amber-500/10 text-amber-300 ring-amber-400/25 light:text-amber-700',
    rose: 'bg-rose-500/10 text-rose-300 ring-rose-400/25 light:text-rose-700',
  }[tone]
  return <span className={cx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset', t, className)}>{children}</span>
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-2 mt-3.5 flex items-center justify-between gap-2">
      <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-faint">{children}</h3>
      {right}
    </div>
  )
}

/** Circular dial gauge, styled after the reference's climate-control dial. */
export function Dial({
  value,
  max = 100,
  label,
  display,
  color = '#22d3ee',
  size = 120,
  minLabel,
  maxLabel,
}: {
  value: number
  max?: number
  label: string
  display: string
  color?: string
  size?: number
  minLabel?: string
  maxLabel?: string
}) {
  const r = size / 2 - 12
  const c = size / 2
  const start = Math.PI * 0.75
  const sweep = Math.PI * 1.5
  const frac = Math.min(1, Math.max(0, value / max))
  const arc = (f: number) => {
    const a0 = start
    const a1 = start + sweep * f
    const large = sweep * f > Math.PI ? 1 : 0
    return `M ${c + r * Math.cos(a0)} ${c + r * Math.sin(a0)} A ${r} ${r} 0 ${large} 1 ${c + r * Math.cos(a1)} ${c + r * Math.sin(a1)}`
  }
  const ticks = Array.from({ length: 31 }, (_, i) => {
    const a = start + (sweep * i) / 30
    const r0 = r + 6
    const r1 = r + (i % 5 === 0 ? 10 : 8)
    return <line key={i} x1={c + r0 * Math.cos(a)} y1={c + r0 * Math.sin(a)} x2={c + r1 * Math.cos(a)} y2={c + r1 * Math.sin(a)} stroke="currentColor" strokeOpacity={0.25} strokeWidth={1} />
  })
  return (
    <div className="relative grid place-items-center text-sub" style={{ width: size + 8, height: size }}>
      <svg width={size + 8} height={size} viewBox={`-4 0 ${size + 8} ${size}`}>
        {ticks}
        <path d={arc(1)} fill="none" stroke="currentColor" strokeOpacity={0.12} strokeWidth={6} strokeLinecap="round" />
        <path d={arc(frac)} fill="none" stroke={color} strokeWidth={6} strokeLinecap="round" style={{ filter: `drop-shadow(0 0 6px ${color})` }} />
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <div className="grid h-[58%] w-[58%] place-items-center rounded-full bg-chip text-center ring-1 ring-line">
          <div>
            <div className="font-mono text-xl font-semibold leading-none text-ink">{display}</div>
            <div className="mt-1 text-[9px] uppercase tracking-wider text-faint">{label}</div>
          </div>
        </div>
      </div>
      {minLabel && <span className="absolute bottom-0 left-3 font-mono text-[9px] text-faint">{minLabel}</span>}
      {maxLabel && <span className="absolute bottom-0 right-3 font-mono text-[9px] text-faint">{maxLabel}</span>}
    </div>
  )
}

export function Bar({ value, max = 1, color = '#22d3ee', className }: { value: number; max?: number; color?: string; className?: string }) {
  return (
    <div className={cx('h-1.5 w-full overflow-hidden rounded-full bg-chip-strong', className)}>
      <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.min(100, (value / max) * 100)}%`, background: color, boxShadow: `0 0 10px ${color}` }} />
    </div>
  )
}

export function Metric({ label, value, unit, tag, tone }: { label: string; value: string; unit?: string; tag?: DataTag; tone?: string }) {
  return (
    <div className="rounded-xl bg-chip p-2.5 ring-1 ring-inset ring-line">
      <div className="flex items-center justify-between gap-1">
        <span className="text-[10px] text-faint">{label}</span>
        {tag && <Tag kind={tag} />}
      </div>
      <div className="mt-1 font-mono text-[15px] font-semibold text-ink" style={tone ? { color: tone } : undefined}>
        {value}
        {unit && <span className="ml-0.5 text-[10px] font-normal text-sub">{unit}</span>}
      </div>
    </div>
  )
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded-md bg-chip-strong px-1.5 py-0.5 font-mono text-[10px] text-sub ring-1 ring-line">{children}</kbd>
}

export function Modal({ children, onClose, className, label }: { children: ReactNode; onClose: () => void; className?: string; label: string }) {
  return (
    <div className="pointer-events-auto fixed inset-0 z-50 grid place-items-center bg-black/55 p-4 backdrop-blur-sm anim-fade" onMouseDown={onClose} role="dialog" aria-label={label} aria-modal>
      <div className={cx('glass-strong anim-rise max-h-[calc(100vh-32px)] w-full overflow-hidden', className)} onMouseDown={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  )
}
