import * as THREE from 'three'
import type { Room } from '../types'

const mk = (w: number, h = w) => {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return [c, c.getContext('2d')!] as const
}

export const STATUS_COLOR: Record<Room['status'], string> = {
  'in-session': '#22d3ee',
  available: '#10b981',
  maintenance: '#f59e0b',
}

/** High-DPI circular glass radar badge for a classroom. */
export function drawBadge(canvas: HTMLCanvasElement, room: Room, selected: boolean, alert: boolean) {
  const ctx = canvas.getContext('2d')!
  const S = canvas.width
  const c = S / 2
  ctx.clearRect(0, 0, S, S)
  const col = alert ? '#f43f5e' : STATUS_COLOR[room.status]

  const glow = ctx.createRadialGradient(c, c, S * 0.28, c, c, S * 0.5)
  glow.addColorStop(0, col + (selected ? 'aa' : '55'))
  glow.addColorStop(1, col + '00')
  ctx.fillStyle = glow
  ctx.beginPath()
  ctx.arc(c, c, S * 0.5, 0, Math.PI * 2)
  ctx.fill()

  const body = ctx.createLinearGradient(0, c - S * 0.36, 0, c + S * 0.36)
  body.addColorStop(0, 'rgba(22,32,46,0.94)')
  body.addColorStop(1, 'rgba(6,10,16,0.94)')
  ctx.fillStyle = body
  ctx.beginPath()
  ctx.arc(c, c, S * 0.36, 0, Math.PI * 2)
  ctx.fill()

  // glass highlight
  ctx.fillStyle = 'rgba(255,255,255,0.07)'
  ctx.beginPath()
  ctx.ellipse(c, c - S * 0.16, S * 0.26, S * 0.12, 0, 0, Math.PI * 2)
  ctx.fill()

  // ticks
  ctx.strokeStyle = 'rgba(255,255,255,0.18)'
  ctx.lineWidth = S * 0.008
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2
    const r0 = S * (i % 4 === 0 ? 0.385 : 0.395)
    ctx.beginPath()
    ctx.moveTo(c + Math.cos(a) * r0, c + Math.sin(a) * r0)
    ctx.lineTo(c + Math.cos(a) * S * 0.41, c + Math.sin(a) * S * 0.41)
    ctx.stroke()
  }

  // rim
  ctx.strokeStyle = selected ? '#ffffff' : col
  ctx.lineWidth = S * (selected ? 0.03 : 0.018)
  ctx.beginPath()
  ctx.arc(c, c, S * 0.36, 0, Math.PI * 2)
  ctx.stroke()

  // occupancy arc
  const frac = room.capacity ? room.occupancy / room.capacity : 0
  ctx.strokeStyle = col
  ctx.lineCap = 'round'
  ctx.lineWidth = S * 0.035
  ctx.beginPath()
  ctx.arc(c, c, S * 0.445, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0.02, frac))
  ctx.stroke()

  ctx.fillStyle = '#f8fafc'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `700 ${S * 0.2}px Inter, system-ui, sans-serif`
  ctx.fillText(String(room.number), c, c - S * 0.025)
  ctx.fillStyle = col
  ctx.font = `600 ${S * 0.085}px "JetBrains Mono", monospace`
  const sub = room.status === 'in-session' ? (room.occupancy > 0 ? `${room.occupancy}/${room.capacity}` : 'EMPTY') : room.status === 'available' ? 'FREE' : 'MAINT'
  ctx.fillText(sub, c, c + S * 0.15)
}

export function makeBadgeTexture(room: Room) {
  const [canvas] = mk(256)
  drawBadge(canvas, room, false, false)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  return { canvas, tex }
}

/** Rotating radar sweep overlay shared by all badges. */
export function makeSweepTexture() {
  const [canvas, ctx] = mk(256)
  const c = 128
  const g = ctx.createConicGradient(0, c, c)
  g.addColorStop(0, 'rgba(34,211,238,0.55)')
  g.addColorStop(0.14, 'rgba(34,211,238,0)')
  g.addColorStop(1, 'rgba(34,211,238,0)')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(c, c, 92, 0, Math.PI * 2)
  ctx.fill()
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

export function makeGlowTexture(inner = 'rgba(255,255,255,1)', size = 128) {
  const [canvas, ctx] = mk(size)
  const c = size / 2
  const g = ctx.createRadialGradient(c, c, 0, c, c, c)
  g.addColorStop(0, inner)
  g.addColorStop(0.35, inner.replace(/[\d.]+\)$/, '0.45)'))
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

export function makeCloudTexture() {
  const [canvas, ctx] = mk(256)
  for (let i = 0; i < 26; i++) {
    const x = 50 + Math.random() * 156
    const y = 90 + Math.random() * 70
    const r = 26 + Math.random() * 44
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    g.addColorStop(0, 'rgba(255,255,255,0.32)')
    g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

export function makeLabelTexture(text: string, color = '#22d3ee', bg = 'rgba(6,10,16,0.82)') {
  const [canvas, ctx] = mk(512, 128)
  ctx.font = '700 54px "JetBrains Mono", monospace'
  const w = Math.min(500, ctx.measureText(text).width + 70)
  const x = (512 - w) / 2
  ctx.fillStyle = bg
  ctx.strokeStyle = color
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.roundRect(x, 20, w, 88, 44)
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = color
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, 256, 66)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

/** Subtle procedural concrete/asphalt noise for large surfaces. */
export function makeNoiseTexture(base: string, spread = 14, size = 256) {
  const [canvas, ctx] = mk(size)
  ctx.fillStyle = base
  ctx.fillRect(0, 0, size, size)
  const img = ctx.getImageData(0, 0, size, size)
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * spread
    img.data[i] += n
    img.data[i + 1] += n
    img.data[i + 2] += n
  }
  ctx.putImageData(img, 0, 0)
  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}
