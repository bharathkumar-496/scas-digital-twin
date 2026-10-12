import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import {
  ASSEMBLY_POINT,
  CORES,
  CORRIDORS,
  COURTYARDS,
  FLOOR_HEIGHT,
  FOOTPRINT,
  GROUND_Y,
  inSolid,
  perimeterSegments,
  PORTICO,
  SLAB,
  type EdgeSeg,
} from '../data/layout'
import type { CameraNode, FloorId, Room, SolarString, Streetlight } from '../types'
import { makeGlowTexture, makeLabelTexture, makeNoiseTexture } from './textures'

/* ------------------------------------------------------------------ helpers */

const box = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) => {
  const g = new THREE.BoxGeometry(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0))
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2)
  return g
}

/** Replace a geometry's UVs with world-space planar UVs so striped cladding stays continuous across boxes. */
function worldUV(g: THREE.BufferGeometry, scale = 0.25, yOffset = 0) {
  const p = g.attributes.position
  const n = g.attributes.normal
  const uv = new Float32Array(p.count * 2)
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i)
    const y = p.getY(i) + yOffset
    const z = p.getZ(i)
    const ax = Math.abs(n.getX(i))
    const az = Math.abs(n.getZ(i))
    const [u, v] = ax > 0.5 ? [z, y] : az > 0.5 ? [x, y] : [x, z]
    uv[i * 2] = u * scale
    uv[i * 2 + 1] = v * scale
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  return g
}

/** Collects geometries per material key and merges them into one mesh each (few draw calls). */
class Batch {
  private parts = new Map<string, THREE.BufferGeometry[]>()
  add(key: string, g: THREE.BufferGeometry) {
    const list = this.parts.get(key) ?? []
    list.push(g.index ? g.toNonIndexed() : g)
    this.parts.set(key, list)
  }
  build(mats: Record<string, THREE.Material>, opts: { cast?: string[]; receive?: string[] } = {}) {
    const meshes: Record<string, THREE.Mesh> = {}
    for (const [key, list] of this.parts) {
      const merged = mergeGeometries(list, false)
      list.forEach((g) => g.dispose())
      if (!merged) continue
      const mesh = new THREE.Mesh(merged, mats[key])
      mesh.castShadow = opts.cast?.includes(key) ?? false
      mesh.receiveShadow = opts.receive?.includes(key) ?? true
      mesh.name = key
      meshes[key] = mesh
    }
    return meshes
  }
}

function footprintShape() {
  // Shape lives in XY; we rotate -90° about X so shape.y = -z.
  const s = new THREE.Shape(FOOTPRINT.map(([x, z]) => new THREE.Vector2(x, -z)))
  for (const c of COURTYARDS) {
    const h = new THREE.Path()
    h.moveTo(c.x, -c.z)
    h.lineTo(c.x, -(c.z + c.d))
    h.lineTo(c.x + c.w, -(c.z + c.d))
    h.lineTo(c.x + c.w, -c.z)
    h.closePath()
    s.holes.push(h)
  }
  return s
}

function slabGeometry(thickness: number) {
  const g = new THREE.ExtrudeGeometry(footprintShape(), { depth: thickness, bevelEnabled: false })
  g.rotateX(-Math.PI / 2)
  return g
}

const SEGMENTS = perimeterSegments()

/** Which cladding a facade run gets, following the photos: dark ribbed brown around the entrance and on the north bar. */
function claddingFor(e: EdgeSeg, mid: number): 'tan' | 'brown' {
  if (e.axis === 'z' && e.fixed === 62.4 && mid > -40 && mid < 2) return 'brown'
  if (e.axis === 'x' && e.fixed === -44.8) return 'brown'
  if (e.axis === 'x' && e.fixed === -22.4 && mid < -20) return 'brown'
  return 'tan'
}

/* ------------------------------------------------------------------ textures */

function canvasTex(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  draw(c.getContext('2d')!)
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  return t
}

/** Warm wood-tone horizontal plank cladding (the tan blocks in the photos). */
const tanTex = canvasTex(256, 256, (ctx) => {
  for (let y = 0; y < 256; y += 16) {
    const shade = 0.88 + ((y * 37) % 23) / 100
    ctx.fillStyle = `rgb(${Math.round(201 * shade)},${Math.round(136 * shade)},${Math.round(84 * shade)})`
    ctx.fillRect(0, y, 256, 16)
    ctx.fillStyle = 'rgba(70,35,15,0.35)'
    ctx.fillRect(0, y + 15, 256, 1)
    for (let k = 0; k < 6; k++) {
      ctx.fillStyle = `rgba(110,60,25,${0.05 + Math.random() * 0.08})`
      ctx.fillRect(Math.random() * 256, y + 2 + Math.random() * 12, 40 + Math.random() * 90, 1)
    }
  }
})

/** Dark brown vertical-ribbed cladding (the panels around the portico). */
const brownTex = canvasTex(256, 64, (ctx) => {
  for (let x = 0; x < 256; x += 8) {
    ctx.fillStyle = x % 16 ? '#5e3b2a' : '#4a2c1f'
    ctx.fillRect(x, 0, 8, 64)
    ctx.fillStyle = 'rgba(255,220,190,0.08)'
    ctx.fillRect(x + 1, 0, 1, 64)
  }
})

/** Horizontal wood-grain stripes for the portico pillars and canopy band. */
const pillarTex = canvasTex(64, 256, (ctx) => {
  for (let y = 0; y < 256; y += 6) {
    ctx.fillStyle = (y / 6) % 3 === 0 ? '#3f2618' : (y / 6) % 3 === 1 ? '#6b4430' : '#56362a'
    ctx.fillRect(0, y, 64, 6)
  }
})

/** Black and white granite checkerboard of the courtyards. */
const checkerTex = canvasTex(256, 256, (ctx) => {
  for (let i = 0; i < 8; i++)
    for (let j = 0; j < 8; j++) {
      ctx.fillStyle = (i + j) % 2 ? '#2b2f36' : '#d9dcdf'
      ctx.fillRect(i * 32, j * 32, 32, 32)
      ctx.fillStyle = 'rgba(255,255,255,0.06)'
      for (let k = 0; k < 12; k++) ctx.fillRect(i * 32 + Math.random() * 30, j * 32 + Math.random() * 30, 2, 2)
    }
})

/* ------------------------------------------------------------------ materials */

export interface FloorMaterials {
  tan: THREE.MeshStandardMaterial
  brown: THREE.MeshStandardMaterial
  slab: THREE.MeshStandardMaterial
  glass: THREE.MeshStandardMaterial
  frame: THREE.MeshStandardMaterial
  wall: THREE.MeshStandardMaterial
  door: THREE.MeshStandardMaterial
  parapet: THREE.MeshStandardMaterial
  blue: THREE.MeshStandardMaterial
  core: THREE.MeshStandardMaterial
  corridor: THREE.MeshStandardMaterial
  desk: THREE.MeshStandardMaterial
  screen: THREE.MeshStandardMaterial
  plant: THREE.MeshStandardMaterial
}

function floorMaterials(): FloorMaterials {
  return {
    tan: new THREE.MeshStandardMaterial({ map: tanTex, color: '#ffffff', roughness: 0.62, metalness: 0.05 }),
    brown: new THREE.MeshStandardMaterial({ map: brownTex, color: '#ffffff', roughness: 0.55, metalness: 0.15 }),
    slab: new THREE.MeshStandardMaterial({ color: '#8d939b', roughness: 0.9, metalness: 0.02 }),
    glass: new THREE.MeshStandardMaterial({
      color: '#4b4337',
      roughness: 0.1,
      metalness: 0.9,
      transparent: true,
      opacity: 0.82,
      emissive: new THREE.Color('#ffcf8a'),
      emissiveIntensity: 0,
      envMapIntensity: 0.9,
      depthWrite: false,
    }),
    frame: new THREE.MeshStandardMaterial({ color: '#2a1d16', roughness: 0.5, metalness: 0.4 }),
    wall: new THREE.MeshStandardMaterial({ color: '#a3a8ae', roughness: 0.85 }),
    door: new THREE.MeshStandardMaterial({ color: '#c47a1d', roughness: 0.6 }),
    parapet: new THREE.MeshStandardMaterial({ color: '#b9bdc2', roughness: 0.8 }),
    blue: new THREE.MeshStandardMaterial({ color: '#1d63d8', roughness: 0.55 }),
    core: new THREE.MeshStandardMaterial({ color: '#6b7280', roughness: 0.8 }),
    corridor: new THREE.MeshStandardMaterial({ color: '#7c838c', roughness: 0.55, metalness: 0.05 }),
    desk: new THREE.MeshStandardMaterial({ color: '#d6d3d1', roughness: 0.6 }),
    screen: new THREE.MeshStandardMaterial({ color: '#0b1220', emissive: new THREE.Color('#38bdf8'), emissiveIntensity: 0.5, roughness: 0.3 }),
    plant: new THREE.MeshStandardMaterial({ color: '#15803d', roughness: 0.8 }),
  }
}

const ROOM_TILE: Record<Room['type'], string> = {
  lab: '#5b6573',
  classroom: '#626b78',
  seminar: '#6b6560',
  research: '#5d5852',
}

/* ------------------------------------------------------------------ floors */

export interface FloorBuild {
  id: FloorId
  index: number
  group: THREE.Group
  solid: THREE.Group
  ghost: THREE.Group
  mats: FloorMaterials
  roomTiles: Map<string, THREE.Mesh>
  badgeLayer: THREE.Group
  heatLayer: THREE.Group
  cameraLayer: THREE.Group
}

const BAY = 7.5
const GLASS_W = 2.4

export function buildFloor(index: number, id: FloorId, rooms: Room[]): FloorBuild {
  const group = new THREE.Group()
  group.name = `floor-${id}`
  const solid = new THREE.Group()
  const ghost = new THREE.Group()
  ghost.visible = false
  group.add(solid, ghost)
  const mats = floorMaterials()
  const H = FLOOR_HEIGHT
  const batch = new Batch()

  const slab = new THREE.Mesh(slabGeometry(SLAB), mats.slab)
  slab.receiveShadow = true
  slab.castShadow = true
  solid.add(slab)

  const seg = (e: EdgeSeg, a0: number, a1: number, y0: number, y1: number, th: number, offset: number) =>
    e.axis === 'x'
      ? box(a0, y0, e.fixed + e.out * offset - th / 2, a1, y1, e.fixed + e.out * offset + th / 2)
      : box(e.fixed + e.out * offset - th / 2, y0, a0, e.fixed + e.out * offset + th / 2, y1, a1)

  for (const e of SEGMENTS) {
    const len = e.a1 - e.a0
    if (e.well) {
      // Light-well edge: open balcony corridors, grey parapets and blue columns (courtyard photo).
      if (index > 0) batch.add('parapet', seg(e, e.a0, e.a1, SLAB, 1.15, 0.22, -0.11))
      batch.add('parapet', seg(e, e.a0, e.a1, H - 0.45, H, 0.3, -0.15))
      const n = Math.max(1, Math.round(len / 7))
      for (let i = 0; i <= n; i++) {
        const a = e.a0 + (len * i) / n
        batch.add('blue', seg(e, a - 0.28, a + 0.28, 0, H, 0.56, 0.3))
      }
      continue
    }
    // Envelope: wood-tone cladding panels with tall recessed glass bays.
    const n = Math.max(1, Math.round(len / BAY))
    const step = len / n
    for (let i = 0; i < n; i++) {
      const a = e.a0 + i * step
      const mid = a + step / 2
      const lobby = index === 0 && e.axis === 'z' && e.fixed === 62.4 && mid > PORTICO.z0 && mid < PORTICO.z1
      const kind = claddingFor(e, mid)
      if (lobby) {
        batch.add('glass', seg(e, a, a + step, 0, H, 0.06, -0.05))
        batch.add('frame', seg(e, a - 0.08, a + 0.08, 0, H, 0.2, 0))
        batch.add('frame', seg(e, a, a + step, H - 0.35, H, 0.25, 0))
        continue
      }
      const g0 = a + step - GLASS_W - 0.5
      const g1 = a + step - 0.5
      batch.add(kind, worldUV(seg(e, a, g0, 0, H, 0.45, 0.1), kind === 'tan' ? 0.25 : 0.5))
      batch.add(kind, worldUV(seg(e, g1, a + step, 0, H, 0.45, 0.1), kind === 'tan' ? 0.25 : 0.5))
      batch.add('glass', seg(e, g0, g1, 0, H, 0.06, -0.08))
      batch.add('frame', seg(e, g0, g1, H - 0.18, H, 0.14, -0.02))
      batch.add('frame', seg(e, g0 + GLASS_W / 2 - 0.04, g0 + GLASS_W / 2 + 0.04, 0, H, 0.12, -0.02))
      // occasional open hopper sashes, as seen in the glazing
      if ((i + index) % 3 === 0) batch.add('frame', seg(e, g0 + 0.3, g0 + 0.9, 2.4, 2.9, 0.5, 0.15))
    }
  }

  // Wide white-framed strip window on the brown entrance facade (second floor).
  if (index === 1) {
    const x = 62.4
    batch.add('parapet', box(x - 0.1, 1.0, -44, x + 0.35, 1.25, -31))
    batch.add('parapet', box(x - 0.1, 2.95, -44, x + 0.35, 3.2, -31))
    batch.add('parapet', box(x - 0.1, 1.0, -44, x + 0.35, 3.2, -43.75))
    batch.add('parapet', box(x - 0.1, 1.0, -31.25, x + 0.35, 3.2, -31))
    batch.add('glass', box(x + 0.18, 1.25, -43.75, x + 0.26, 2.95, -31.25))
  }

  for (const c of CORRIDORS) batch.add('corridor', box(c.x, SLAB, c.z, c.x + c.w, SLAB + 0.02, c.z + c.d))
  for (const c of CORES) batch.add('core', box(c.x, SLAB, c.z, c.x + c.w, H, c.z + c.d))

  // Rooms: grey block walls with orange doors toward the corridors (courtyard photo).
  const wallTop = 3.6
  for (const room of rooms) {
    const r = room.rect
    const edges = [
      { x0: r.x, z0: r.z, x1: r.x + r.w, z1: r.z, nx: 0, nz: -1 },
      { x0: r.x, z0: r.z + r.d, x1: r.x + r.w, z1: r.z + r.d, nx: 0, nz: 1 },
      { x0: r.x, z0: r.z, x1: r.x, z1: r.z + r.d, nx: -1, nz: 0 },
      { x0: r.x + r.w, z0: r.z, x1: r.x + r.w, z1: r.z + r.d, nx: 1, nz: 0 },
    ]
    const interior = edges.filter((e) => inSolid((e.x0 + e.x1) / 2 + e.nx * 0.6, (e.z0 + e.z1) / 2 + e.nz * 0.6))
    for (const e of interior) {
      if (e.nz !== 0) batch.add('wall', box(e.x0 + 0.1, SLAB, e.z0 - 0.09, e.x1 - 0.1, wallTop, e.z0 + 0.09))
      else batch.add('wall', box(e.x0 - 0.09, SLAB, e.z0 + 0.1, e.x0 + 0.09, wallTop, e.z1 - 0.1))
    }
    const longest = interior.sort((a, b) => Math.hypot(b.x1 - b.x0, b.z1 - b.z0) - Math.hypot(a.x1 - a.x0, a.z1 - a.z0))[0]
    if (longest) {
      for (const f of [0.25, 0.75]) {
        const mx = longest.x0 + (longest.x1 - longest.x0) * f
        const mz = longest.z0 + (longest.z1 - longest.z0) * f
        if (longest.nz !== 0) batch.add('door', box(mx - 0.6, SLAB, mz - 0.13, mx + 0.6, 2.5, mz + 0.13))
        else batch.add('door', box(mx - 0.13, SLAB, mz - 0.6, mx + 0.13, 2.5, mz + 0.6))
      }
    }
  }

  // Room floor tiles (pickable), furniture, screens.
  const roomTiles = new Map<string, THREE.Mesh>()
  const deskGeo: THREE.Matrix4[] = []
  const monitorGeo: THREE.Matrix4[] = []
  const chairGeo: THREE.Matrix4[] = []
  const m = new THREE.Matrix4()
  for (const room of rooms) {
    const r = room.rect
    const tileMat = new THREE.MeshStandardMaterial({ color: ROOM_TILE[room.type], roughness: 0.6, metalness: 0.05 })
    const tile = new THREE.Mesh(new THREE.PlaneGeometry(r.w - 0.3, r.d - 0.3), tileMat)
    tile.rotation.x = -Math.PI / 2
    tile.position.set(r.x + r.w / 2, SLAB + 0.025, r.z + r.d / 2)
    tile.receiveShadow = true
    tile.userData = { pick: { kind: 'room', id: room.id } }
    roomTiles.set(room.id, tile)
    solid.add(tile)

    batch.add('screen', box(r.x + 0.25, 1.3, r.z + r.d / 2 - 1.6, r.x + 0.33, 2.75, r.z + r.d / 2 + 1.6))

    const pad = 1.4
    const cols = Math.max(1, Math.floor((r.w - pad * 2) / 1.9))
    const rows = Math.max(1, Math.floor((r.d - pad * 2) / 1.7))
    const isLab = room.type === 'lab'
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        const x = r.x + pad + 1.35 + i * 1.9
        const z = r.z + pad + 0.5 + j * 1.7
        m.makeTranslation(x, SLAB + 0.76, z)
        deskGeo.push(m.clone())
        m.makeTranslation(x + 0.55, SLAB + 0.45, z)
        chairGeo.push(m.clone())
        if (isLab) {
          m.makeTranslation(x - 0.15, SLAB + 1.02, z)
          monitorGeo.push(m.clone())
        }
      }
    }
  }
  const inst = (geo: THREE.BufferGeometry, mat: THREE.Material, list: THREE.Matrix4[], cast = true) => {
    const im = new THREE.InstancedMesh(geo, mat, list.length)
    list.forEach((mm, i) => im.setMatrixAt(i, mm))
    im.castShadow = cast
    im.receiveShadow = true
    solid.add(im)
    return im
  }
  inst(new THREE.BoxGeometry(0.7, 0.05, 1.3), mats.desk, deskGeo)
  inst(new THREE.BoxGeometry(0.45, 0.5, 0.45), mats.core, chairGeo, false)
  if (monitorGeo.length) inst(new THREE.BoxGeometry(0.04, 0.42, 0.62), mats.screen, monitorGeo, false)

  // Potted plants along the courtyard balconies
  const plants: THREE.Matrix4[] = []
  for (const c of COURTYARDS) {
    for (let x = c.x + 2; x < c.x + c.w - 1; x += 5) {
      plants.push(new THREE.Matrix4().makeTranslation(x, SLAB + 0.35, c.z - 0.8))
      plants.push(new THREE.Matrix4().makeTranslation(x, SLAB + 0.35, c.z + c.d + 0.8))
    }
  }
  inst(new THREE.IcosahedronGeometry(0.4, 1), mats.plant, plants)

  const meshes = batch.build(mats as unknown as Record<string, THREE.Material>, {
    cast: ['tan', 'brown', 'core', 'wall', 'blue', 'parapet', 'frame'],
    receive: ['tan', 'brown', 'core', 'corridor', 'wall', 'parapet'],
  })
  Object.values(meshes).forEach((mesh) => solid.add(mesh))
  if (meshes.glass) meshes.glass.renderOrder = 2

  // Ghost wireframe used when another floor is isolated.
  const ghostMat = new THREE.LineBasicMaterial({ color: '#22d3ee', transparent: true, opacity: 0.12, depthWrite: false })
  for (const key of ['tan', 'brown', 'core', 'blue']) {
    const src = meshes[key]
    if (src) ghost.add(new THREE.LineSegments(new THREE.EdgesGeometry(src.geometry, 30), ghostMat))
  }
  ghost.add(
    new THREE.Mesh(slabGeometry(SLAB), new THREE.MeshBasicMaterial({ color: '#22d3ee', transparent: true, opacity: 0.1, depthWrite: false })),
  )

  const badgeLayer = new THREE.Group()
  const heatLayer = new THREE.Group()
  const cameraLayer = new THREE.Group()
  group.add(badgeLayer, heatLayer, cameraLayer)

  return { id, index, group, solid, ghost, mats, roomTiles, badgeLayer, heatLayer, cameraLayer }
}

/* ------------------------------------------------------------------ roof & solar */

export interface RoofBuild {
  group: THREE.Group
  solid: THREE.Group
  ghost: THREE.Group
  strings: Map<SolarString['id'], THREE.InstancedMesh>
  stringMats: Map<SolarString['id'], THREE.MeshStandardMaterial>
  stringCenters: Map<SolarString['id'], THREE.Vector3>
}

function panelTexture() {
  const c = document.createElement('canvas')
  c.width = 128
  c.height = 256
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#0c1d3d'
  ctx.fillRect(0, 0, 128, 256)
  ctx.strokeStyle = 'rgba(148,197,255,0.35)'
  ctx.lineWidth = 2
  for (let i = 1; i < 6; i++) {
    ctx.beginPath()
    ctx.moveTo((i * 128) / 6, 0)
    ctx.lineTo((i * 128) / 6, 256)
    ctx.stroke()
  }
  for (let j = 1; j < 10; j++) {
    ctx.beginPath()
    ctx.moveTo(0, (j * 256) / 10)
    ctx.lineTo(128, (j * 256) / 10)
    ctx.stroke()
  }
  ctx.strokeStyle = '#cbd5e1'
  ctx.lineWidth = 6
  ctx.strokeRect(0, 0, 128, 256)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  return t
}

export function buildRoof(): RoofBuild {
  const group = new THREE.Group()
  group.name = 'roof'
  const solid = new THREE.Group()
  const ghost = new THREE.Group()
  ghost.visible = false
  group.add(solid, ghost)

  const roofSlab = new THREE.Mesh(slabGeometry(0.45), new THREE.MeshStandardMaterial({ color: '#8a8f96', roughness: 0.95 }))
  roofSlab.receiveShadow = true
  roofSlab.castShadow = true
  solid.add(roofSlab)

  const tan = new THREE.MeshStandardMaterial({ map: tanTex, roughness: 0.62 })
  const brown = new THREE.MeshStandardMaterial({ map: brownTex, roughness: 0.55 })
  const coping = new THREE.MeshStandardMaterial({ color: '#3b261b', roughness: 0.5, metalness: 0.3 })
  const blue = new THREE.MeshStandardMaterial({ color: '#1d63d8', roughness: 0.55 })
  const plant = new THREE.MeshStandardMaterial({ color: '#b6bcc4', roughness: 0.6, metalness: 0.3 })
  const batch = new Batch()
  for (const e of SEGMENTS) {
    const s = (a0: number, a1: number, y0: number, y1: number, th: number, off: number) =>
      e.axis === 'x'
        ? box(a0, y0, e.fixed + e.out * off - th / 2, a1, y1, e.fixed + e.out * off + th / 2)
        : box(e.fixed + e.out * off - th / 2, y0, a0, e.fixed + e.out * off + th / 2, y1, a1)
    if (e.well) {
      batch.add('blue', s(e.a0 - 0.3, e.a1 + 0.3, 0, 1.0, 0.6, 0.2))
      continue
    }
    const kind = claddingFor(e, (e.a0 + e.a1) / 2)
    batch.add(kind, worldUV(s(e.a0, e.a1, 0, 1.5, 0.45, 0.1), kind === 'tan' ? 0.25 : 0.5, 12))
    batch.add('coping', s(e.a0 - 0.1, e.a1 + 0.1, 1.5, 1.62, 0.6, 0.1))
  }
  // Lift overruns above each core, water tanks and plant on the north bar (satellite)
  for (const c of CORES) batch.add('plant', box(c.x, 0.45, c.z, c.x + c.w, 3.4, c.z + c.d))
  batch.add('plant', box(-58, 0.45, -42, -50, 3.0, -36))
  batch.add('plant', box(-30, 0.45, -42, -26, 2.2, -38))
  for (let i = 0; i < 4; i++) batch.add('plant', box(-12 + i * 3.2, 0.45, -30, -9.6 + i * 3.2, 1.9, -27.6))
  const meshes = batch.build({ tan, brown, coping, blue, plant }, { cast: ['tan', 'brown', 'blue', 'plant'] })
  Object.values(meshes).forEach((mm) => solid.add(mm))
  const tankMat = new THREE.MeshStandardMaterial({ color: '#e5e7eb', roughness: 0.4 })
  for (let i = 0; i < 3; i++) {
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 1.6, 16), tankMat)
    tank.position.set(-56 + i * 2.2, 3.85, -39)
    tank.castShadow = true
    solid.add(tank)
  }

  // Solar strings: two arrays on the south block roof, as seen on the satellite view
  const tex = panelTexture()
  const strings = new Map<SolarString['id'], THREE.InstancedMesh>()
  const stringMats = new Map<SolarString['id'], THREE.MeshStandardMaterial>()
  const stringCenters = new Map<SolarString['id'], THREE.Vector3>()
  const panelGeo = new THREE.BoxGeometry(0.7, 0.04, 0.98)
  const layout: [SolarString['id'], number, number][] = [
    ['A', 7.2, 33.6],
    ['B', 7.2, 39.6],
    ['C', 29.4, 33.6],
    ['D', 29.4, 39.6],
  ]
  const tilt = (13 * Math.PI) / 180
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), tilt)
  const frameMat = new THREE.MeshStandardMaterial({ color: '#64748b', metalness: 0.8, roughness: 0.35 })
  for (const [id, sx, sz] of layout) {
    const mat = new THREE.MeshStandardMaterial({
      map: tex,
      color: '#ffffff',
      metalness: 0.55,
      roughness: 0.22,
      emissive: new THREE.Color('#22d3ee'),
      emissiveIntensity: 0,
      envMapIntensity: 1.6,
    })
    const im = new THREE.InstancedMesh(panelGeo, mat, 100)
    const mm = new THREE.Matrix4()
    let k = 0
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col < 20; col++) {
        mm.compose(new THREE.Vector3(sx + 0.37 + col * 0.74, 1.05, sz + 0.5 + row * 1.1), q, new THREE.Vector3(1, 1, 1))
        im.setMatrixAt(k++, mm)
      }
    }
    im.castShadow = true
    im.receiveShadow = true
    im.userData = { pick: { kind: 'solar', id } }
    solid.add(im)
    strings.set(id, im)
    stringMats.set(id, mat)
    stringCenters.set(id, new THREE.Vector3(sx + 7.4, 1.0, sz + 2.7))
    const rail = new THREE.Mesh(new THREE.BoxGeometry(14.8, 0.5, 5.4), frameMat)
    rail.position.set(sx + 7.4, 0.72, sz + 2.7)
    solid.add(rail)
  }

  const ghostMat = new THREE.LineBasicMaterial({ color: '#22d3ee', transparent: true, opacity: 0.1 })
  for (const key of ['tan', 'brown']) {
    const src = meshes[key]
    if (src) ghost.add(new THREE.LineSegments(new THREE.EdgesGeometry(src.geometry, 30), ghostMat))
  }

  return { group, solid, ghost, strings, stringMats, stringCenters }
}

/* ------------------------------------------------------------------ signage (extruded voxel font) */

const GLYPHS: Record<string, string[]> = {
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  C: ['01110', '10001', '10000', '10000', '10000', '10001', '01110'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  I: ['01110', '00100', '00100', '00100', '00100', '00100', '01110'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  V: ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
  Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
}

/** Free-standing letters facing +x, centred on z = centerZ. */
function buildSignage(text: string, faceX: number, centerY: number, centerZ: number, pixel: number) {
  const cells: [number, number][] = []
  let col = 0
  for (const ch of text) {
    const g = GLYPHS[ch]
    if (g) g.forEach((row, ry) => [...row].forEach((bit, rx) => bit === '1' && cells.push([col + rx, ry])))
    col += 6
  }
  const width = (col - 1) * pixel
  const mat = new THREE.MeshStandardMaterial({ color: '#f8fafc', emissive: new THREE.Color('#e0f2fe'), emissiveIntensity: 1.2, roughness: 0.3 })
  const geo = new THREE.BoxGeometry(0.16, pixel * 0.94, pixel * 0.94)
  const im = new THREE.InstancedMesh(geo, mat, cells.length)
  const mm = new THREE.Matrix4()
  cells.forEach(([cx, cy], i) => {
    mm.makeTranslation(faceX + 0.08, centerY + (3 - cy) * pixel, centerZ + width / 2 - cx * pixel)
    im.setMatrixAt(i, mm)
  })
  return { mesh: im, mat }
}

/* ------------------------------------------------------------------ site, portico, streetlights */

export interface StreetlightBuild {
  id: string
  group: THREE.Group
  light: THREE.SpotLight
  lamp: THREE.MeshStandardMaterial
  pool: THREE.Mesh
}

export interface SiteBuild {
  group: THREE.Group
  ground: THREE.MeshStandardMaterial
  lawn: THREE.MeshStandardMaterial
  grid: THREE.GridHelper
  signage: THREE.MeshStandardMaterial
  streetlights: StreetlightBuild[]
  assembly: THREE.Group
}

export function buildSite(lights: Streetlight[]): SiteBuild {
  const group = new THREE.Group()
  group.name = 'site'

  const ground = new THREE.MeshStandardMaterial({ color: '#0b1017', roughness: 0.95 })
  const groundMesh = new THREE.Mesh(new THREE.CircleGeometry(520, 64), ground)
  groundMesh.rotation.x = -Math.PI / 2
  groundMesh.position.y = GROUND_Y - 0.02
  groundMesh.receiveShadow = true
  group.add(groundMesh)

  const grid = new THREE.GridHelper(500, 100, '#1e3a4a', '#13202b')
  grid.position.y = GROUND_Y + 0.005
  const gm = grid.material as THREE.LineBasicMaterial
  gm.transparent = true
  gm.opacity = 0.5
  group.add(grid)

  const asphaltTex = makeNoiseTexture('#151b23', 12)
  asphaltTex.repeat.set(12, 12)
  const asphalt = new THREE.MeshStandardMaterial({ color: '#2a3038', map: asphaltTex, roughness: 0.92 })
  const lawn = new THREE.MeshStandardMaterial({ color: '#12301f', roughness: 1 })
  const sand = new THREE.MeshStandardMaterial({ color: '#4a4232', roughness: 1 })
  const paving = new THREE.MeshStandardMaterial({ color: '#59616d', roughness: 0.85 })
  const kerbTex = canvasTex(64, 8, (ctx) => {
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = i % 2 ? '#f1f5f9' : '#2563eb'
      ctx.fillRect(i * 8, 0, 8, 8)
    }
  })
  const kerb = new THREE.MeshStandardMaterial({ map: kerbTex, roughness: 0.7 })

  const flat = (mat: THREE.Material, x0: number, z0: number, x1: number, z1: number, y = GROUND_Y + 0.01) => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), mat)
    mesh.rotation.x = -Math.PI / 2
    mesh.position.set((x0 + x1) / 2, y, (z0 + z1) / 2)
    mesh.receiveShadow = true
    group.add(mesh)
    return mesh
  }
  // open sandy ground to the west (satellite), lawns in front, approach road on the east
  flat(sand, -170, -90, 5, 90, GROUND_Y + 0.003)
  flat(lawn, 5, -70, 78, 70, GROUND_Y + 0.004)
  flat(asphalt, 78, -160, 88, 160)
  flat(asphalt, 62.4, -34, 78, -2)
  flat(paving, 62.4, -32, 76, -4, GROUND_Y + 0.012)
  flat(paving, 62.4, -56, 66, 56, GROUND_Y + 0.008)
  // blue/white kerbs along the front walkway (photos)
  for (const z of [-34.3, -1.7]) {
    const k = new THREE.Mesh(box(62.4, GROUND_Y, z - 0.15, 78, GROUND_Y + 0.25, z + 0.15), kerb)
    worldUV(k.geometry, 1)
    group.add(k)
  }
  const kx = new THREE.Mesh(worldUV(box(65.8, GROUND_Y, -56, 66.1, GROUND_Y + 0.25, 56), 1), kerb)
  group.add(kx)

  // plinth under the building
  const plinthMat = new THREE.MeshStandardMaterial({ color: '#5b6470', roughness: 0.9 })
  const plinthShape = new THREE.Shape(FOOTPRINT.map(([x, z]) => new THREE.Vector2(x, -z)))
  const plinthGeo = new THREE.ExtrudeGeometry(plinthShape, { depth: -GROUND_Y, bevelEnabled: false })
  plinthGeo.rotateX(-Math.PI / 2)
  plinthGeo.translate(0, GROUND_Y, 0)
  const plinth = new THREE.Mesh(plinthGeo, plinthMat)
  plinth.receiveShadow = true
  group.add(plinth)

  // checkerboard granite courtyards
  const checker = new THREE.MeshStandardMaterial({ map: checkerTex, roughness: 0.35, metalness: 0.05 })
  for (const c of COURTYARDS) {
    const t = checkerTex.clone()
    t.repeat.set(c.w / 4.8, c.d / 4.8)
    t.needsUpdate = true
    const mat = checker.clone()
    mat.map = t
    flat(mat, c.x, c.z, c.x + c.w, c.z + c.d, 0.02)
  }

  // central shrine + planters in the square courtyard (courtyard photo)
  const sq = COURTYARDS[1]
  const cx = sq.x + sq.w * 0.62
  const cz = sq.z + sq.d * 0.62
  const black = new THREE.MeshStandardMaterial({ color: '#1f2328', roughness: 0.4 })
  const marble = new THREE.MeshStandardMaterial({ color: '#d4d7db', roughness: 0.5 })
  const grass = new THREE.MeshStandardMaterial({ color: '#3f8f3a', roughness: 1 })
  const addMesh = (g: THREE.BufferGeometry, mat: THREE.Material, cast = true) => {
    const mesh = new THREE.Mesh(g, mat)
    mesh.castShadow = cast
    mesh.receiveShadow = true
    group.add(mesh)
    return mesh
  }
  addMesh(box(cx - 2.6, 0, cz - 2.6, cx + 2.6, 0.7, cz + 2.6), black)
  addMesh(box(cx - 2.4, 0.7, cz - 2.4, cx + 2.4, 0.78, cz + 2.4), grass, false)
  addMesh(box(cx - 1.1, 0.78, cz - 1.1, cx + 1.1, 1.1, cz + 1.1), marble)
  for (const [dx, dz] of [[-0.85, -0.85], [0.85, -0.85], [-0.85, 0.85], [0.85, 0.85]]) addMesh(box(cx + dx - 0.12, 1.1, cz + dz - 0.12, cx + dx + 0.12, 2.6, cz + dz + 0.12), marble)
  addMesh(box(cx - 1.15, 2.6, cz - 1.15, cx + 1.15, 2.9, cz + 1.15), marble)
  addMesh(new THREE.SphereGeometry(0.75, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), marble).position.set(cx, 2.9, cz)
  addMesh(new THREE.CylinderGeometry(0.22, 0.28, 1.2, 10), new THREE.MeshStandardMaterial({ color: '#b91c1c' })).position.set(cx, 1.7, cz)
  const potMat = new THREE.MeshStandardMaterial({ color: '#facc15', roughness: 0.8 })
  for (const c of COURTYARDS) {
    for (let x = c.x + 1; x < c.x + c.w; x += 3) {
      addMesh(new THREE.SphereGeometry(0.32, 8, 6), potMat).position.set(x, 0.35, c.z + 0.7)
      addMesh(new THREE.SphereGeometry(0.32, 8, 6), potMat).position.set(x, 0.35, c.z + c.d - 0.7)
    }
  }

  // trees
  const trunks: THREE.Matrix4[] = []
  const crowns: THREE.Matrix4[] = []
  const treeAt = (x: number, z: number, s: number, y = GROUND_Y) => {
    trunks.push(new THREE.Matrix4().compose(new THREE.Vector3(x, y + 1.2 * s, z), new THREE.Quaternion(), new THREE.Vector3(s, s, s)))
    crowns.push(new THREE.Matrix4().compose(new THREE.Vector3(x, y + 3.6 * s, z), new THREE.Quaternion(), new THREE.Vector3(s, s * 1.1, s)))
  }
  for (let i = 0; i < 12; i++) treeAt(10 + i * 4.6, 50 + (i % 2) * 1.6, 1 + (i % 3) * 0.15)
  for (let i = 0; i < 8; i++) treeAt(91, -60 + i * 16, 1.2)
  for (let i = 0; i < 6; i++) treeAt(72, 40 + i * 3.5, 0.9)
  treeAt(sq.x + 2.5, sq.z + 2.5, 0.55, 0)
  treeAt(sq.x + sq.w - 6, sq.z + 2.8, 0.55, 0)
  treeAt(sq.x + 2.5, sq.z + sq.d - 6, 0.5, 0)
  const trunkIm = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.18, 0.26, 2.4, 6), new THREE.MeshStandardMaterial({ color: '#4a3728' }), trunks.length)
  const crownIm = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1.8, 1), new THREE.MeshStandardMaterial({ color: '#166534', roughness: 0.85, flatShading: true }), crowns.length)
  trunks.forEach((t, i) => trunkIm.setMatrixAt(i, t))
  crowns.forEach((t, i) => crownIm.setMatrixAt(i, t))
  trunkIm.castShadow = crownIm.castShadow = true
  group.add(trunkIm, crownIm)

  /* --- Entrance portico (photos): striped wood pillars, layered white/brown canopy, stairs + ramp --- */
  const P = PORTICO
  const white = new THREE.MeshStandardMaterial({ color: '#f1f5f9', roughness: 0.55 })
  const woodMat = new THREE.MeshStandardMaterial({ map: pillarTex, roughness: 0.5 })
  const step = new THREE.MeshStandardMaterial({ color: '#4b5058', roughness: 0.7 })
  const portico = new THREE.Group()
  const add = (g: THREE.BufferGeometry, mat: THREE.Material) => {
    const mesh = new THREE.Mesh(g, mat)
    mesh.castShadow = true
    mesh.receiveShadow = true
    portico.add(mesh)
    return mesh
  }
  const z0 = P.z0 - 0.6
  const z1 = P.z1 + 0.6
  add(box(P.x0, GROUND_Y, z0, P.x1 + 0.6, 0, z1), step)
  for (let i = 0; i < 6; i++) add(box(P.x1 + 0.6, GROUND_Y, P.z0 + 1, P.x1 + 0.6 + 0.45 * (i + 1), -0.2 * i, P.z1 - 3.5), step)
  // ramp with white railings on the north side
  const ramp = add(new THREE.BoxGeometry(12.1, 0.25, 2.6), step)
  ramp.position.set(P.x1 + 6.6, -0.66, P.z1 - 1.8)
  ramp.rotation.z = -Math.atan2(1.2, 12)
  for (const rz of [P.z1 - 3.1, P.z1 - 0.5]) {
    const rail = add(new THREE.BoxGeometry(12.1, 0.06, 0.06), white)
    rail.position.set(P.x1 + 6.6, 0.3, rz)
    rail.rotation.z = -Math.atan2(1.2, 12)
  }
  // pillars
  for (const z of P.pillarsZ) add(worldUV(box(P.pillarX - 0.6, 0, z - 0.6, P.pillarX + 0.6, P.height, z + 0.6), 0.6), woodMat)
  // layered canopy: white soffit band, brown wood band, dark brown top band
  add(box(P.x0, P.height, z0, P.x1 + 0.6, P.height + 0.45, z1), white)
  add(worldUV(box(P.x0, P.height + 0.45, z0 + 0.1, P.x1 + 0.45, P.height + 1.35, z1 - 0.1), 0.6), woodMat)
  // dark brown top band so the white lettering on it reads clearly
  add(box(P.x0, P.height + 1.35, z0, P.x1 + 0.6, P.height + 1.75, z1), new THREE.MeshStandardMaterial({ color: '#4a2c1a', roughness: 0.6 }))
  const soffit = new THREE.MeshStandardMaterial({ color: '#fff7ed', emissive: new THREE.Color('#ffe4b5'), emissiveIntensity: 0.4 })
  for (let z = P.z0 + 1.5; z <= P.z1 - 1.5; z += 2.5) add(new THREE.CylinderGeometry(0.2, 0.2, 0.04, 12), soffit).position.set(66, P.height - 0.02, z)
  // wood-panelled reception wall with plaque behind the glass lobby
  add(worldUV(box(P.x0 - 4.2, 0, -24, P.x0 - 3.9, 3.8, -16), 0.6), woodMat)
  // free-standing letters on top of the canopy
  const sign = buildSignage('SATHYABAMA CENTRE FOR ADVANCED STUDIES', P.x1 - 0.4, P.height + 1.75 + 0.12 + 3 * 0.085 + 0.04, (P.z0 + P.z1) / 2, 0.085)
  portico.add(sign.mesh)
  group.add(portico)

  /* --- LoRa streetlights --- */
  const poleMat = new THREE.MeshStandardMaterial({ color: '#475569', metalness: 0.7, roughness: 0.4 })
  const poolTex = makeGlowTexture('rgba(255,214,150,1)', 128)
  const streetlights: StreetlightBuild[] = lights.map((sl) => {
    const g = new THREE.Group()
    const [x, , z] = sl.position
    g.position.set(x, GROUND_Y, z)
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.16, 7, 8), poleMat)
    pole.position.y = 3.5
    pole.castShadow = true
    const arm = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.1, 0.1), poleMat)
    arm.position.set(0.7, 6.9, 0)
    const lamp = new THREE.MeshStandardMaterial({ color: '#fef3c7', emissive: new THREE.Color('#ffd28a'), emissiveIntensity: 0 })
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.16, 0.4), lamp)
    head.position.set(1.3, 6.82, 0)
    head.userData = { pick: { kind: 'streetlight', id: sl.id } }
    const hit = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 8, 6), new THREE.MeshBasicMaterial({ visible: false }))
    hit.position.y = 4
    hit.userData = { pick: { kind: 'streetlight', id: sl.id } }
    const light = new THREE.SpotLight('#ffd6a0', 0, 30, 0.85, 0.65, 1.4)
    light.position.set(1.3, 6.7, 0)
    light.target.position.set(1.5, 0, 0)
    const pool = new THREE.Mesh(
      new THREE.PlaneGeometry(14, 14),
      new THREE.MeshBasicMaterial({ map: poolTex, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }),
    )
    pool.rotation.x = -Math.PI / 2
    pool.position.set(1.4, 0.04, 0)
    g.add(pole, arm, head, hit, light, light.target, pool)
    group.add(g)
    return { id: sl.id, group: g, light, lamp, pool }
  })

  /* --- assembly point --- */
  const assembly = new THREE.Group()
  assembly.position.set(...ASSEMBLY_POINT)
  const ringMat = new THREE.MeshBasicMaterial({ color: '#10b981', transparent: true, opacity: 0.35, side: THREE.DoubleSide })
  const ring = new THREE.Mesh(new THREE.RingGeometry(4.2, 4.6, 48), ringMat)
  ring.rotation.x = -Math.PI / 2
  ring.name = 'ring'
  const disc = new THREE.Mesh(new THREE.CircleGeometry(4.2, 48), new THREE.MeshBasicMaterial({ color: '#10b981', transparent: true, opacity: 0.08 }))
  disc.rotation.x = -Math.PI / 2
  disc.position.y = 0.01
  const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeLabelTexture('ASSEMBLY POINT', '#10b981'), depthTest: false }))
  label.scale.set(8, 2, 1)
  label.position.y = 4
  label.name = 'label'
  assembly.add(ring, disc, label)
  group.add(assembly)

  return { group, ground, lawn, grid, signage: sign.mat, streetlights, assembly }
}

/* ------------------------------------------------------------------ heatmap volumes */

export function makeHeatVolume(room: Room) {
  const r = room.rect
  const h = 3.3
  const geo = new THREE.BoxGeometry(r.w - 0.5, h, r.d - 0.5)
  geo.translate(0, h / 2, 0)
  const mat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color('#22d3ee') }, uOpacity: { value: 0 }, uH: { value: h }, uTime: { value: 0 } },
    vertexShader: /* glsl */ `
      varying float vY; varying vec3 vN;
      void main(){ vY = position.y; vN = normal; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uOpacity; uniform float uH; uniform float uTime;
      varying float vY; varying vec3 vN;
      void main(){
        float t = clamp(vY/uH, 0.0, 1.0);
        float a = pow(1.0 - t, 1.6) * 0.75 + 0.06;
        float band = 0.08 * sin(vY*6.0 - uTime*2.0);
        float side = abs(vN.y) > 0.5 ? (vN.y > 0.0 ? 0.15 : 0.9) : 1.0;
        gl_FragColor = vec4(uColor * 1.4, (a + band) * uOpacity * side);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  })
  const mesh = new THREE.Mesh(geo, mat)
  mesh.position.set(r.x + r.w / 2, SLAB + 0.05, r.z + r.d / 2)
  mesh.renderOrder = 5
  return mesh
}


/* ------------------------------------------------------------------ CCTV nodes */

export interface CameraBuild {
  id: string
  group: THREE.Group
  lines: THREE.LineBasicMaterial
  fill: THREE.MeshBasicMaterial
  label: THREE.Sprite
}

export function buildCameraNode(cam: CameraNode): CameraBuild {
  const group = new THREE.Group()
  const origin = new THREE.Vector3(...cam.position)
  const target = new THREE.Vector3(...cam.target)
  group.position.copy(origin)
  group.lookAt(target)
  // Object3D.lookAt points +z toward target for non-cameras.
  const len = Math.min(origin.distanceTo(target) * 1.05, 22)
  const vfov = ((cam.fov / 1.6) * Math.PI) / 180
  const hh = Math.tan(vfov / 2) * len
  const hw = hh * (16 / 9)
  const corners = [
    new THREE.Vector3(-hw, -hh, len),
    new THREE.Vector3(hw, -hh, len),
    new THREE.Vector3(hw, hh, len),
    new THREE.Vector3(-hw, hh, len),
  ]
  const pts: number[] = []
  const o = new THREE.Vector3()
  corners.forEach((c, i) => {
    pts.push(o.x, o.y, o.z, c.x, c.y, c.z)
    const n = corners[(i + 1) % 4]
    pts.push(c.x, c.y, c.z, n.x, n.y, n.z)
  })
  const lineGeo = new THREE.BufferGeometry()
  lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
  const color = cam.status === 'degraded' ? '#f59e0b' : '#22d3ee'
  const lines = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.55, depthWrite: false })
  group.add(new THREE.LineSegments(lineGeo, lines))

  const fillGeo = new THREE.BufferGeometry()
  const fv: number[] = []
  corners.forEach((c, i) => {
    const n = corners[(i + 1) % 4]
    fv.push(0, 0, 0, c.x, c.y, c.z, n.x, n.y, n.z)
  })
  fillGeo.setAttribute('position', new THREE.Float32BufferAttribute(fv, 3))
  fillGeo.computeVertexNormals()
  const fill = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.05, side: THREE.DoubleSide, depthWrite: false })
  const fillMesh = new THREE.Mesh(fillGeo, fill)
  fillMesh.userData = { pick: { kind: 'camera', id: cam.id } }
  group.add(fillMesh)

  const bodyMat = new THREE.MeshStandardMaterial({ color: '#e2e8f0', roughness: 0.4, metalness: 0.3 })
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.4, 0.9), bodyMat)
  body.userData = { pick: { kind: 'camera', id: cam.id } }
  const lens = new THREE.Mesh(
    new THREE.CylinderGeometry(0.14, 0.14, 0.12, 16),
    new THREE.MeshStandardMaterial({ color: '#0f172a', emissive: new THREE.Color(color), emissiveIntensity: 1.5 }),
  )
  lens.rotation.x = Math.PI / 2
  lens.position.z = 0.5
  group.add(body, lens)

  const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeLabelTexture(cam.id, color), depthTest: false, transparent: true }))
  label.scale.set(4.8, 1.2, 1)
  label.position.set(0, 1.0, 0)
  label.renderOrder = 11
  // keep label upright regardless of group orientation
  label.userData = { upright: true }
  group.add(label)
  return { id: cam.id, group, lines, fill, label }
}
