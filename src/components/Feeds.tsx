import { useEffect, useRef, useState, type RefObject } from 'react'
import type { CameraNode, Room } from '../types'
import { cx } from './ui'

const W = 960
const H = 540

interface Box {
  x: number
  y: number
  w: number
  h: number
  label: string
  color: string
}

/* ---------------------------------------------------------------- scene painters */

function paintLab(ctx: CanvasRenderingContext2D, t: number, labName: string, boxes: Box[] | null) {
  const vx = W * 0.56
  const vy = H * 0.34
  // walls
  const wall = ctx.createLinearGradient(0, 0, 0, H * 0.55)
  wall.addColorStop(0, '#c9d2dc')
  wall.addColorStop(1, '#aeb9c6')
  ctx.fillStyle = wall
  ctx.fillRect(0, 0, W, H)
  // ceiling with light panels
  ctx.fillStyle = '#dfe5eb'
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.lineTo(W, 0)
  ctx.lineTo(vx + 210, vy - 95)
  ctx.lineTo(vx - 260, vy - 95)
  ctx.closePath()
  ctx.fill()
  for (let i = 0; i < 4; i++) {
    const k = i / 4
    const y = 10 + k * (vy - 115)
    const half = 300 - k * 210
    ctx.fillStyle = 'rgba(255,255,250,0.95)'
    ctx.fillRect(vx - half * 0.6, y, half * 0.5, 10 - k * 6)
    ctx.fillRect(vx + half * 0.1, y, half * 0.5, 10 - k * 6)
  }
  // floor
  const floor = ctx.createLinearGradient(0, vy + 60, 0, H)
  floor.addColorStop(0, '#8d96a2')
  floor.addColorStop(1, '#5d6672')
  ctx.fillStyle = floor
  ctx.beginPath()
  ctx.moveTo(vx - 260, vy + 70)
  ctx.lineTo(vx + 210, vy + 70)
  ctx.lineTo(W, H)
  ctx.lineTo(0, H)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.08)'
  for (let i = -8; i <= 8; i++) {
    ctx.beginPath()
    ctx.moveTo(vx + i * 30, vy + 70)
    ctx.lineTo(vx + i * 160, H)
    ctx.stroke()
  }
  // back wall + smart display
  ctx.fillStyle = '#b8c2cd'
  ctx.fillRect(vx - 260, vy - 95, 470, 165)
  const dx = vx - 120
  const dy = vy - 70
  ctx.fillStyle = '#0b1220'
  ctx.fillRect(dx, dy, 190, 108)
  const scr = ctx.createLinearGradient(dx, dy, dx + 190, dy + 108)
  scr.addColorStop(0, '#0e7490')
  scr.addColorStop(1, '#1e3a8a')
  ctx.fillStyle = scr
  ctx.fillRect(dx + 5, dy + 5, 180, 98)
  ctx.fillStyle = 'rgba(255,255,255,0.85)'
  ctx.font = '600 13px Inter, sans-serif'
  ctx.fillText(labName.toUpperCase().slice(0, 24), dx + 14, dy + 28)
  ctx.fillStyle = 'rgba(255,255,255,0.5)'
  for (let i = 0; i < 4; i++) ctx.fillRect(dx + 14, dy + 42 + i * 13, 90 + ((i * 37) % 60), 5)
  ctx.strokeStyle = '#22d3ee'
  ctx.lineWidth = 2
  ctx.beginPath()
  for (let i = 0; i < 12; i++) ctx.lineTo(dx + 120 + i * 5, dy + 80 - Math.abs(Math.sin(i * 0.9 + t)) * 30)
  ctx.stroke()
  // left windows
  for (let i = 0; i < 3; i++) {
    const x0 = 20 + i * 90
    ctx.fillStyle = 'rgba(186,230,253,0.85)'
    ctx.beginPath()
    ctx.moveTo(x0, 60 + i * 26)
    ctx.lineTo(x0 + 70, 80 + i * 22)
    ctx.lineTo(x0 + 70, 200 + i * 4)
    ctx.lineTo(x0, 220 - i * 2)
    ctx.closePath()
    ctx.fill()
  }

  // desks with monitors + students (rows back → front)
  const rows = 4
  const det: Box[] = []
  for (let r = 0; r < rows; r++) {
    const k = (r + 1) / (rows + 0.6)
    const y = vy + 70 + k * k * (H - vy - 60)
    const span = 230 + k * 760
    const seats = 4 + r
    const deskH = 8 + k * 26
    ctx.fillStyle = '#e7e2da'
    ctx.fillRect(vx - span / 2 - 30, y, span + 40, deskH)
    ctx.fillStyle = '#9ca3af'
    ctx.fillRect(vx - span / 2 - 30, y + deskH, span + 40, 3 + k * 4)
    for (let s = 0; s < seats; s++) {
      const x = vx - span / 2 + (s + 0.5) * (span / seats) - 10
      const sc = 0.35 + k * 0.9
      const bob = Math.sin(t * 1.3 + r * 2 + s) * 1.5 * sc
      // student behind monitor
      const occupied = (r * 7 + s * 3) % 5 !== 0
      if (occupied) {
        ctx.fillStyle = ['#1e3a8a', '#7c2d12', '#334155', '#065f46', '#4c1d95'][(r + s) % 5]
        ctx.beginPath()
        ctx.roundRect(x - 22 * sc, y - 46 * sc + bob, 44 * sc, 46 * sc, 12 * sc)
        ctx.fill()
        ctx.fillStyle = '#5b3a29'
        ctx.beginPath()
        ctx.arc(x, y - 58 * sc + bob, 12 * sc, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = '#111827'
        ctx.beginPath()
        ctx.arc(x, y - 62 * sc + bob, 12 * sc, Math.PI, Math.PI * 2)
        ctx.fill()
        det.push({
          x: x - 26 * sc,
          y: y - 74 * sc + bob,
          w: 52 * sc,
          h: 76 * sc,
          label: r === rows - 1 && s === 1 ? 'Student 44733013 / CSE 0.97' : `Student ${(0.86 + ((r + s) % 10) / 100).toFixed(2)}`,
          color: '#22d3ee',
        })
      }
      // monitor
      const mw = 34 * sc
      const mh = 22 * sc
      ctx.fillStyle = '#0f172a'
      ctx.fillRect(x + 6 * sc - mw / 2, y - mh - 4 * sc, mw, mh)
      ctx.fillStyle = (r + s) % 3 === 0 ? '#38bdf8' : '#60a5fa'
      ctx.globalAlpha = 0.85
      ctx.fillRect(x + 6 * sc - mw / 2 + 2, y - mh - 4 * sc + 2, mw - 4, mh - 4)
      ctx.globalAlpha = 1
      ctx.fillStyle = '#1f2937'
      ctx.fillRect(x + 4 * sc, y - 4 * sc, 4 * sc, 4 * sc)
    }
  }
  // front laptop
  const lx = W * 0.2
  const ly = H * 0.86
  ctx.fillStyle = '#cbd5e1'
  ctx.beginPath()
  ctx.moveTo(lx, ly)
  ctx.lineTo(lx + 150, ly)
  ctx.lineTo(lx + 170, ly + 26)
  ctx.lineTo(lx - 20, ly + 26)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#0f172a'
  ctx.fillRect(lx + 6, ly - 92, 138, 90)
  ctx.fillStyle = '#0ea5e9'
  ctx.fillRect(lx + 12, ly - 86, 126, 78)
  ctx.fillStyle = 'rgba(255,255,255,0.7)'
  ctx.font = '11px "JetBrains Mono", monospace'
  ctx.fillText('$ nmap -sV lab', lx + 18, ly - 66)
  ctx.fillText('> 22/tcp open', lx + 18, ly - 50)

  if (boxes) {
    boxes.push({ x: dx - 6, y: dy - 6, w: 202, h: 120, label: 'Smart Display 86" 0.98', color: '#f59e0b' })
    boxes.push({ x: lx - 24, y: ly - 98, w: 198, h: 130, label: 'Active Laptop 0.94', color: '#10b981' })
    // keep the closest student boxes readable
    det.slice(-7).forEach((d) => boxes.push(d))
  }
}

function paintExterior(ctx: CanvasRenderingContext2D, t: number, cam: CameraNode, boxes: Box[] | null) {
  const sky = ctx.createLinearGradient(0, 0, 0, H * 0.5)
  sky.addColorStop(0, '#7fb4e6')
  sky.addColorStop(1, '#d6e7f5')
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, W, H)
  const horizon = H * 0.5
  // building facade
  ctx.fillStyle = '#c8c3b8'
  ctx.fillRect(60, 90, W - 120, horizon - 70)
  for (let f = 0; f < 3; f++) {
    for (let i = 0; i < 14; i++) {
      ctx.fillStyle = (i + f) % 4 === 0 ? '#6b7f95' : '#4a5c70'
      ctx.fillRect(84 + i * 58, 104 + f * 62, 44, 40)
    }
  }
  ctx.fillStyle = '#f8fafc'
  ctx.fillRect(40, 82, W - 80, 12)
  if (cam.id === 'CAM-01') {
    ctx.fillStyle = '#f1f5f9'
    ctx.fillRect(250, 150, 470, 26)
    ctx.fillStyle = '#0e7490'
    ctx.font = '700 15px Inter, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('CENTRE FOR ADVANCED STUDIES', 485, 168)
    ctx.textAlign = 'left'
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = '#b4532a'
      ctx.fillRect(280 + i * 130, 176, 22, horizon - 156)
    }
  }
  // ground + road
  const g = ctx.createLinearGradient(0, horizon, 0, H)
  g.addColorStop(0, '#9aa39a')
  g.addColorStop(1, '#5b665e')
  ctx.fillStyle = g
  ctx.fillRect(0, horizon + 20, W, H - horizon)
  ctx.fillStyle = '#3f444b'
  ctx.beginPath()
  ctx.moveTo(W * 0.42, horizon + 20)
  ctx.lineTo(W * 0.58, horizon + 20)
  ctx.lineTo(W * 0.95, H)
  ctx.lineTo(W * 0.05, H)
  ctx.closePath()
  ctx.fill()
  // pedestrians
  const people = cam.detections
  for (let i = 0; i < Math.max(1, people); i++) {
    const k = 0.45 + ((i * 0.37) % 0.55)
    const x = ((t * (14 + i * 6) + i * 210) % (W + 80)) - 40
    const y = horizon + 30 + k * (H - horizon - 60)
    const s = 0.5 + k
    ctx.fillStyle = ['#1e293b', '#7f1d1d', '#1e3a8a', '#064e3b'][i % 4]
    ctx.beginPath()
    ctx.roundRect(x - 9 * s, y - 52 * s, 18 * s, 34 * s, 5 * s)
    ctx.fill()
    ctx.fillRect(x - 7 * s, y - 20 * s, 5 * s, 20 * s)
    ctx.fillRect(x + 2 * s, y - 20 * s, 5 * s, 20 * s)
    ctx.fillStyle = '#6b4a35'
    ctx.beginPath()
    ctx.arc(x, y - 60 * s, 7 * s, 0, Math.PI * 2)
    ctx.fill()
    boxes?.push({ x: x - 14 * s, y: y - 70 * s, w: 28 * s, h: 72 * s, label: `Person ${(0.88 + (i % 10) / 100).toFixed(2)}`, color: '#22d3ee' })
  }
  if (cam.id === 'CAM-01' || cam.id === 'CAM-02') {
    const x = ((t * 40) % (W + 300)) - 150
    ctx.fillStyle = '#e2e8f0'
    ctx.beginPath()
    ctx.roundRect(x, H - 120, 150, 50, 12)
    ctx.fill()
    ctx.fillStyle = '#0f172a'
    ctx.fillRect(x + 22, H - 112, 104, 18)
    boxes?.push({ x: x - 4, y: H - 124, w: 158, h: 70, label: 'Vehicle 0.91', color: '#f59e0b' })
  }
}

/* ---------------------------------------------------------------- feed component */

export interface FeedProps {
  cam: CameraNode
  ir?: boolean
  zoom?: number
  pan?: { x: number; y: number }
  overlays?: boolean
  osd?: boolean
  still?: boolean
  labName?: string
  className?: string
  canvasRef?: RefObject<HTMLCanvasElement | null>
}

export function CCTVFeed({ cam, ir = false, zoom = 1, pan = { x: 0, y: 0 }, overlays = true, osd = true, still = false, labName, className, canvasRef }: FeedProps) {
  const ref = useRef<HTMLCanvasElement | null>(null)
  const opts = useRef({ ir, zoom, pan, overlays, osd })
  opts.current = { ir, zoom, pan, overlays, osd }

  useEffect(() => {
    const canvas = ref.current!
    if (canvasRef) canvasRef.current = canvas
    const ctx = canvas.getContext('2d')!
    const off = document.createElement('canvas')
    off.width = W
    off.height = H
    const octx = off.getContext('2d')!
    let raf = 0
    let last = 0
    const t0 = performance.now()
    const frame = (now: number) => {
      raf = still ? 0 : requestAnimationFrame(frame)
      if (!still && now - last < 1000 / 30) return
      last = now
      const t = (now - t0) / 1000
      const o = opts.current
      const boxes: Box[] | null = o.overlays ? [] : null
      octx.save()
      if (cam.roomNumber) paintLab(octx, t, labName ?? cam.name, boxes)
      else paintExterior(octx, t, cam, boxes)
      if (boxes) {
        octx.lineWidth = 2
        octx.font = '600 12px "JetBrains Mono", monospace'
        for (const b of boxes) {
          octx.strokeStyle = b.color
          octx.strokeRect(b.x, b.y, b.w, b.h)
          const tw = octx.measureText(b.label).width + 10
          octx.fillStyle = b.color
          octx.fillRect(b.x, b.y - 17, tw, 17)
          octx.fillStyle = '#05070a'
          octx.fillText(b.label, b.x + 5, b.y - 5)
        }
      }
      octx.restore()

      ctx.save()
      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, W, H)
      ctx.filter = o.ir ? 'grayscale(1) brightness(1.3) contrast(1.35)' : 'none'
      const z = o.zoom
      ctx.translate(W / 2 + o.pan.x, H / 2 + o.pan.y)
      ctx.scale(z, z)
      ctx.drawImage(off, -W / 2, -H / 2)
      ctx.restore()
      if (o.ir) {
        ctx.save()
        ctx.globalCompositeOperation = 'multiply'
        ctx.fillStyle = '#9dffb0'
        ctx.fillRect(0, 0, W, H)
        ctx.restore()
      }
      // scanlines + vignette
      ctx.fillStyle = 'rgba(0,0,0,0.06)'
      for (let y = 0; y < H; y += 3) ctx.fillRect(0, y, W, 1)
      const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.4, W / 2, H / 2, W * 0.7)
      vg.addColorStop(0, 'rgba(0,0,0,0)')
      vg.addColorStop(1, 'rgba(0,0,0,0.45)')
      ctx.fillStyle = vg
      ctx.fillRect(0, 0, W, H)

      if (o.osd) {
        const d = new Date()
        const ts = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${d.toLocaleTimeString('en-GB')} IST`
        ctx.font = '600 16px "JetBrains Mono", monospace'
        ctx.fillStyle = 'rgba(0,0,0,0.45)'
        ctx.fillRect(14, 14, ctx.measureText(`${cam.id} · ${cam.zone.toUpperCase()}`).width + 20, 28)
        ctx.fillRect(W - 330, 14, 316, 28)
        ctx.fillStyle = '#ffffff'
        ctx.fillText(`${cam.id} · ${cam.zone.toUpperCase()}`, 24, 34)
        ctx.fillText(ts, W - 320, 34)
        ctx.fillStyle = Math.floor(t * 2) % 2 ? '#f43f5e' : 'rgba(244,63,94,0.3)'
        ctx.beginPath()
        ctx.arc(W - 344, 28, 6, 0, Math.PI * 2)
        ctx.fill()
        ctx.font = '500 13px "JetBrains Mono", monospace'
        ctx.fillStyle = 'rgba(0,0,0,0.45)'
        ctx.fillRect(14, H - 40, 470, 26)
        ctx.fillStyle = '#e2e8f0'
        ctx.fillText(`4K ${cam.resolution} · ${cam.fps} FPS · H.265 · ${o.ir ? 'IR ON' : 'DAY'} · ${z.toFixed(1)}×`, 24, H - 22)
        ctx.fillStyle = '#fbbf24'
        ctx.fillText('[SIMULATED FEED]', W - 150, H - 22)
      }
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [cam, still, labName, canvasRef])

  return <canvas ref={ref} width={W} height={H} className={cx('block h-auto w-full bg-black', className)} />
}

/** Room evidence image: loads /evidence/room-<n>.jpg when present, otherwise an illustrative render. */
export function EvidencePhoto({ room, className }: { room: Room; className?: string }) {
  const [real, setReal] = useState<boolean | null>(null)
  const src = `/evidence/room-${room.number}.jpg`
  useEffect(() => {
    const img = new Image()
    img.onload = () => setReal(true)
    img.onerror = () => setReal(false)
    img.src = src
  }, [src])
  const pseudoCam: CameraNode = {
    id: `R${room.number}`, name: room.name, zone: '', floor: room.floor, position: [0, 0, 0], target: [0, 0, 0],
    fov: 90, fps: 0, resolution: '', ir: false, status: 'online', roomNumber: room.number, detections: 0,
  }
  return (
    <div className={cx('relative overflow-hidden rounded-xl ring-1 ring-line', className)}>
      {real ? (
        <img src={src} alt={`Room ${room.number} ${room.name}`} className="block h-full w-full object-cover" />
      ) : (
        <CCTVFeed cam={pseudoCam} still overlays={false} osd={false} labName={room.name} className="h-full object-cover" />
      )}
      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-gradient-to-t from-black/75 to-transparent px-2.5 pb-1.5 pt-6 text-[10px] text-white/85">
        <span className="font-medium">{real ? `IQAC photographic archive · Room ${room.number}` : 'Illustrative render · IQAC photo not bundled'}</span>
        <span className={cx('font-mono text-[9px]', real ? 'text-violet-300' : 'text-amber-300')}>{real ? '[SOURCE-DERIVED]' : '[ILLUSTRATIVE]'}</span>
      </div>
    </div>
  )
}
