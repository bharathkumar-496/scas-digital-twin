import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { CAMERAS, STREETLIGHTS } from '../data/campus'
import { FLOOR_HEIGHT, SLAB } from '../data/layout'
import { ISO_POSE } from '../data/tour'
import { heatValue, ramp } from '../lib/metrics'
import { nightFactor, smoothstep, sunPosition } from '../lib/sun'
import { actions, store, type AppState } from '../state/store'
import type { CameraPose, FloorFilter, FloorId, Room, Selection } from '../types'
import {
  buildCameraNode,
  buildFloor,
  buildRoof,
  buildSite,
  makeHeatVolume,
  type CameraBuild,
  type FloorBuild,
  type RoofBuild,
  type SiteBuild,
} from './building'
import { FireSystem } from './fire'
import { drawBadge, makeBadgeTexture, makeSweepTexture } from './textures'
import { WeatherSystem } from './weather'

const FLOORS: FloorId[] = ['F1', 'F2', 'F3']
const EXPLODE_GAP = 9
const CLICK_TOLERANCE_SQ = 25

interface Badge {
  sprite: THREE.Sprite
  sweep: THREE.Sprite
  canvas: HTMLCanvasElement
  tex: THREE.CanvasTexture
  key: string
}

interface Fly {
  fromPos: THREE.Vector3
  toPos: THREE.Vector3
  fromTarget: THREE.Vector3
  toTarget: THREE.Vector3
  t: number
  dur: number
}

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
const col = (hex: string) => new THREE.Color(hex)

const SKY = {
  dark: {
    dayTop: col('#0b1830'), dayHor: col('#23405f'),
    goldTop: col('#161b38'), goldHor: col('#9a5428'),
    nightTop: col('#05070a'), nightHor: col('#0b0f16'),
    ground: col('#0b1017'), lawn: col('#10291b'), grid: 0.5,
  },
  light: {
    dayTop: col('#a9afe9'), dayHor: col('#e7e8fb'),
    goldTop: col('#9ea2d6'), goldHor: col('#f4c6a0'),
    nightTop: col('#161a33'), nightHor: col('#2b3058'),
    ground: col('#c9cce6'), lawn: col('#9cc9aa'), grid: 0.25,
  },
}

export class Engine {
  private container: HTMLElement
  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private persp: THREE.PerspectiveCamera
  private ortho: THREE.OrthographicCamera
  private camera: THREE.Camera
  private controls!: OrbitControls
  private composer: EffectComposer
  private renderPass: RenderPass
  private bloom: UnrealBloomPass
  private clock = new THREE.Timer()
  private raf = 0
  private disposed = false

  private sun = new THREE.DirectionalLight('#fff4e6', 3)
  private moon = new THREE.DirectionalLight('#9db6ff', 0.3)
  private hemi = new THREE.HemisphereLight('#bcd7ff', '#1b1f24', 0.8)
  private sky: THREE.Mesh
  private skyU: Record<string, THREE.IUniform>

  private floors: FloorBuild[] = []
  private roof: RoofBuild
  private site: SiteBuild
  private cams = new Map<string, CameraBuild>()
  private badges = new Map<string, Badge>()
  private heat = new Map<string, THREE.Mesh>()
  private sensors: THREE.Group[] = []
  private sweepMat: THREE.SpriteMaterial
  private weather = new WeatherSystem()
  private fire: FireSystem
  private selectionOutline: THREE.LineSegments | null = null

  private explode = 0
  private fly: Fly | null = null
  private prev: AppState
  private unsub: () => void
  private pointerDown: { x: number; y: number } | null = null
  private raycaster = new THREE.Raycaster()
  private ndc = new THREE.Vector2()
  private hoverPending: PointerEvent | null = null
  private frames = 0
  private fpsTime = 0
  private ro: ResizeObserver

  constructor(container: HTMLElement) {
    this.container = container
    const w = container.clientWidth
    const h = container.clientHeight

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.setSize(w, h)
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFShadowMap
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.0
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    container.appendChild(this.renderer.domElement)
    this.renderer.domElement.style.touchAction = 'none'

    const pmrem = new THREE.PMREMGenerator(this.renderer)
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    this.scene.environmentIntensity = 0.5
    pmrem.dispose()

    this.persp = new THREE.PerspectiveCamera(36, w / h, 0.5, 2000)
    this.persp.position.set(...ISO_POSE.position)
    const aspect = w / h
    this.ortho = new THREE.OrthographicCamera(-90 * aspect, 90 * aspect, 90, -90, 0.5, 2000)
    this.ortho.position.set(4, 300, 0.01)
    this.ortho.up.set(0, 0, -1)
    this.camera = this.persp
    this.makeControls()

    // Sky dome
    this.skyU = {
      uTop: { value: new THREE.Color() },
      uHor: { value: new THREE.Color() },
      uFlash: { value: 0 },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uSunCol: { value: new THREE.Color('#ffd9a0') },
      uSunVis: { value: 1 },
    }
    this.sky = new THREE.Mesh(
      new THREE.SphereGeometry(900, 32, 16),
      new THREE.ShaderMaterial({
        uniforms: this.skyU,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        vertexShader: /* glsl */ `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
        fragmentShader: /* glsl */ `
          uniform vec3 uTop; uniform vec3 uHor; uniform float uFlash; uniform vec3 uSunDir; uniform vec3 uSunCol; uniform float uSunVis;
          varying vec3 vDir;
          void main(){
            float h = clamp(vDir.y, -0.2, 1.0);
            vec3 c = mix(uHor, uTop, smoothstep(-0.02, 0.55, h));
            float s = max(dot(normalize(vDir), normalize(uSunDir)), 0.0);
            c += uSunCol * (pow(s, 600.0) * 2.5 + pow(s, 12.0) * 0.25) * uSunVis;
            c += vec3(0.75, 0.82, 1.0) * uFlash * 0.85;
            gl_FragColor = vec4(c, 1.0);
          }`,
      }),
    )
    this.sky.renderOrder = -10
    this.scene.add(this.sky)
    this.scene.fog = new THREE.Fog('#0b0f16', 240, 700)

    // Lights
    this.sun.castShadow = true
    this.sun.shadow.mapSize.set(2048, 2048)
    const sc = this.sun.shadow.camera
    sc.left = -115
    sc.right = 115
    sc.top = 90
    sc.bottom = -90
    sc.near = 10
    sc.far = 450
    this.sun.shadow.bias = -0.0004
    this.sun.shadow.normalBias = 0.04
    this.sun.target.position.set(0, 0, 0)
    this.moon.position.set(-60, 120, 80)
    this.scene.add(this.sun, this.sun.target, this.moon, this.hemi)

    // Building
    const s = store.get()
    FLOORS.forEach((id, i) => {
      const rooms = s.rooms.filter((r) => r.floor === id)
      const f = buildFloor(i, id, rooms)
      f.group.position.y = i * FLOOR_HEIGHT
      this.floors.push(f)
      this.scene.add(f.group)
      rooms.forEach((room) => {
        const hv = makeHeatVolume(room)
        hv.visible = false
        f.heatLayer.add(hv)
        this.heat.set(room.id, hv)
      })
      this.sensors.push(this.makeSensors(rooms))
      f.solid.add(this.sensors[i])
    })
    this.roof = buildRoof()
    this.roof.group.position.y = 3 * FLOOR_HEIGHT
    this.scene.add(this.roof.group)
    this.site = buildSite(STREETLIGHTS)
    this.scene.add(this.site.group)

    // Badges
    this.sweepMat = new THREE.SpriteMaterial({ map: makeSweepTexture(), transparent: true, depthTest: false, depthWrite: false })
    for (const room of s.rooms) {
      const f = this.floors[FLOORS.indexOf(room.floor)]
      const { canvas, tex } = makeBadgeTexture(room)
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false }))
      const cx = room.rect.x + room.rect.w / 2
      const cz = room.rect.z + room.rect.d / 2
      sprite.position.set(cx, 3.0, cz)
      sprite.scale.set(3.4, 3.4, 1)
      sprite.renderOrder = 12
      sprite.userData = { pick: { kind: 'room', id: room.id } }
      const sweep = new THREE.Sprite(this.sweepMat)
      sweep.position.copy(sprite.position)
      sweep.scale.set(3.4, 3.4, 1)
      sweep.renderOrder = 13
      sweep.visible = room.status === 'in-session'
      f.badgeLayer.add(sprite, sweep)
      this.badges.set(room.id, { sprite, sweep, canvas, tex, key: '' })
    }

    // CCTV
    for (const cam of CAMERAS) {
      const cb = buildCameraNode(cam)
      this.cams.set(cam.id, cb)
      if (cam.floor === 'SITE') this.scene.add(cb.group)
      else this.floors[FLOORS.indexOf(cam.floor)].cameraLayer.add(cb.group)
    }

    // Effects
    this.scene.add(this.weather.group)
    const r345 = s.rooms.find((r) => r.number === 345)!
    this.fire = new FireSystem(r345.rect)
    this.scene.add(this.fire.group)
    this.floors[1].group.add(this.fire.roomGroup)

    // Post-processing
    this.composer = new EffectComposer(this.renderer)
    this.renderPass = new RenderPass(this.scene, this.camera)
    this.bloom = new UnrealBloomPass(new THREE.Vector2(w / 2, h / 2), 0.5, 0.45, 1.6)
    this.composer.addPass(this.renderPass)
    this.composer.addPass(this.bloom)
    this.composer.addPass(new OutputPass())

    // Interaction
    const el = this.renderer.domElement
    el.addEventListener('pointerdown', this.onPointerDown)
    el.addEventListener('pointerup', this.onPointerUp)
    el.addEventListener('pointermove', this.onPointerMove)
    el.addEventListener('pointerleave', this.onPointerLeave)

    this.ro = new ResizeObserver(() => this.resize())
    this.ro.observe(container)

    this.prev = s
    this.applyAll(s)
    this.unsub = store.subscribe(() => this.sync())
    this.loop()
  }

  /* ---------------------------------------------------------------- setup helpers */

  private makeControls() {
    this.controls?.dispose()
    const c = new OrbitControls(this.camera, this.renderer.domElement)
    c.enableDamping = true
    c.dampingFactor = 0.08
    c.target.set(...ISO_POSE.target)
    if (this.camera === this.ortho) {
      c.enableRotate = false
      c.screenSpacePanning = true
      c.minZoom = 0.4
      c.maxZoom = 6
    } else {
      c.maxPolarAngle = Math.PI * 0.49
      c.minDistance = 8
      c.maxDistance = 480
    }
    this.controls = c
  }

  private makeSensors(rooms: Room[]) {
    const g = new THREE.Group()
    const geo = new THREE.CylinderGeometry(0.22, 0.22, 0.1, 12)
    const mat = new THREE.MeshBasicMaterial({ color: '#34d399' })
    const im = new THREE.InstancedMesh(geo, mat, rooms.length)
    rooms.forEach((r, i) => im.setMatrixAt(i, new THREE.Matrix4().makeTranslation(r.rect.x + r.rect.w - 0.8, 3.45, r.rect.z + 0.8)))
    g.add(im)
    return g
  }

  private resize() {
    const w = this.container.clientWidth
    const h = this.container.clientHeight
    if (!w || !h) return
    this.renderer.setSize(w, h)
    this.composer.setSize(w, h)
    this.bloom.resolution.set(w / 2, h / 2)
    this.persp.aspect = w / h
    this.persp.updateProjectionMatrix()
    const a = w / h
    this.ortho.left = -90 * a
    this.ortho.right = 90 * a
    this.ortho.updateProjectionMatrix()
  }

  /* ---------------------------------------------------------------- state sync */

  private applyAll(s: AppState) {
    this.applyTheme(s)
    this.applyFloorFilter(s.floor)
    this.applyLayers(s)
    this.applyHeat(s)
    this.refreshBadges(s)
    this.applySelection(s.selection)
    this.weather.weather = s.weather
  }

  private sync() {
    const s = store.get()
    const p = this.prev
    this.prev = s
    if (s.theme !== p.theme) this.applyTheme(s)
    if (s.floor !== p.floor) this.applyFloorFilter(s.floor)
    if (s.layers !== p.layers || s.floor !== p.floor) this.applyLayers(s)
    if (s.heatmap !== p.heatmap || s.rooms !== p.rooms || s.layers !== p.layers) this.applyHeat(s)
    if (s.selection !== p.selection || s.alerts !== p.alerts || s.rooms !== p.rooms) this.refreshBadges(s)
    if (s.selection !== p.selection) this.applySelection(s.selection)
    if (s.hover !== p.hover || s.selection !== p.selection) this.applySolarHighlight(s)
    if (s.weather !== p.weather) this.weather.weather = s.weather
    if (s.cameraMode !== p.cameraMode) this.setCameraMode(s.cameraMode)
    if (s.fire.phase !== p.fire.phase) {
      if (s.fire.phase === 'alarm') this.fire.start()
      else if (s.fire.phase === 'evacuating') this.fire.beginEvacuation()
      else if (s.fire.phase === 'idle') this.fire.stop()
    }
    if (s.flyRequest && s.flyRequest !== p.flyRequest) this.handleFly(s.flyRequest)
  }

  private applyTheme(s: AppState) {
    const t = SKY[s.theme]
    this.site.ground.color.copy(t.ground)
    this.site.lawn.color.copy(t.lawn)
    ;(this.site.grid.material as THREE.LineBasicMaterial).opacity = t.grid
  }

  private applyFloorFilter(filter: FloorFilter) {
    this.floors.forEach((f) => {
      const active = filter === 'ALL' || filter === f.id
      f.solid.visible = active
      f.ghost.visible = !active
      f.heatLayer.visible = active
      f.cameraLayer.visible = active
    })
    const roofActive = filter === 'ALL' || filter === 'F3'
    this.roof.solid.visible = filter === 'ALL'
    this.roof.ghost.visible = !roofActive || filter === 'F3'
  }

  private applyLayers(s: AppState) {
    const L = s.layers
    this.floors.forEach((f) => {
      const active = s.floor === 'ALL' || s.floor === f.id
      f.badgeLayer.visible = L.rooms && active
      f.cameraLayer.visible = L.cctv && active
    })
    this.sensors.forEach((g) => (g.visible = L.sensors))
    this.cams.forEach((c, id) => {
      if (CAMERAS.find((x) => x.id === id)?.floor === 'SITE') c.group.visible = L.cctv
    })
    this.roof.strings.forEach((im) => (im.visible = L.solar))
    this.site.streetlights.forEach((sl) => (sl.group.visible = L.streetlights))
  }

  private applyHeat(s: AppState) {
    const on = s.heatmap !== 'off'
    for (const room of s.rooms) {
      const mesh = this.heat.get(room.id)
      if (!mesh) continue
      mesh.visible = on
      if (!on) continue
      const [r, g, b] = ramp(heatValue(room, s.heatmap))
      const u = (mesh.material as THREE.ShaderMaterial).uniforms
      u.uColor.value.setRGB(r, g, b)
      u.uOpacity.value = 0.85
    }
  }

  private refreshBadges(s: AppState) {
    const alertRooms = new Set(
      s.alerts.filter((a) => !a.acknowledged && a.focus?.kind === 'room').map((a) => (a.focus as { id: string }).id),
    )
    if (s.fire.phase !== 'idle') alertRooms.add('R345')
    for (const room of s.rooms) {
      const b = this.badges.get(room.id)
      if (!b) continue
      const selected = s.selection?.kind === 'room' && s.selection.id === room.id
      const alert = alertRooms.has(room.id)
      const key = `${selected}|${alert}|${room.status}|${room.occupancy}`
      if (key === b.key) continue
      b.key = key
      drawBadge(b.canvas, room, selected, alert)
      b.tex.needsUpdate = true
      const k = selected ? 4.6 : 3.4
      b.sprite.scale.set(k, k, 1)
      b.sweep.scale.set(k, k, 1)
    }
  }

  private applySelection(sel: Selection) {
    if (this.selectionOutline) {
      this.selectionOutline.parent?.remove(this.selectionOutline)
      this.selectionOutline.geometry.dispose()
      this.selectionOutline = null
    }
    this.cams.forEach((c) => {
      const on = sel?.kind === 'camera' && sel.id === c.id
      c.lines.opacity = on ? 1 : 0.5
      c.fill.opacity = on ? 0.16 : 0.04
    })
    if (sel?.kind === 'room') {
      const room = store.get().rooms.find((r) => r.id === sel.id)
      if (!room) return
      const f = this.floors[FLOORS.indexOf(room.floor)]
      const r = room.rect
      const geo = new THREE.EdgesGeometry(new THREE.BoxGeometry(r.w - 0.1, 3.4, r.d - 0.1))
      const line = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: '#67e8f9', transparent: true, opacity: 1 }))
      line.position.set(r.x + r.w / 2, SLAB + 1.7, r.z + r.d / 2)
      line.renderOrder = 8
      f.group.add(line)
      this.selectionOutline = line
    }
  }

  private applySolarHighlight(s: AppState) {
    this.roof.stringMats.forEach((mat, id) => {
      const sel = s.selection?.kind === 'solar' && s.selection.id === id
      const hov = s.hover?.kind === 'solar' && s.hover.id === id
      mat.emissiveIntensity = sel ? 0.45 : hov ? 0.22 : 0
      mat.emissive.set(id === 'D' && sel ? '#f59e0b' : '#22d3ee')
    })
  }

  private setCameraMode(mode: AppState['cameraMode']) {
    const target = this.controls.target.clone()
    this.camera = mode === 'ortho' ? this.ortho : this.persp
    if (mode === 'ortho') {
      this.ortho.position.set(target.x, 300, target.z + 0.01)
      this.ortho.zoom = 1
      this.ortho.updateProjectionMatrix()
    }
    this.renderPass.camera = this.camera
    this.makeControls()
    this.controls.target.copy(target)
    if (mode === 'ortho') this.controls.target.y = 0
    this.fly = null
  }

  /* ---------------------------------------------------------------- camera flights */

  private worldOf(sel: NonNullable<Selection>): CameraPose | null {
    const v = new THREE.Vector3()
    if (sel.kind === 'room') {
      const room = store.get().rooms.find((r) => r.id === sel.id)
      if (!room) return null
      const r = room.rect
      const fy = FLOORS.indexOf(room.floor)
      v.set(r.x + r.w / 2, 1.5 + fy * FLOOR_HEIGHT + store.get().explode * fy * EXPLODE_GAP, r.z + r.d / 2)
      const out = new THREE.Vector3(v.x * 0.35, 0, v.z === 0 ? 1 : Math.sign(v.z)).normalize()
      return { position: [v.x + out.x * 20, v.y + 24, v.z + out.z * 24], target: [v.x, v.y, v.z] }
    }
    if (sel.kind === 'camera') {
      const cb = this.cams.get(sel.id)
      const cam = CAMERAS.find((c) => c.id === sel.id)
      if (!cb || !cam) return null
      cb.group.getWorldPosition(v)
      const dir = new THREE.Vector3(0, 0, 1).applyQuaternion(cb.group.getWorldQuaternion(new THREE.Quaternion()))
      const pos = v.clone().addScaledVector(dir, -14).add(new THREE.Vector3(0, 9, 0))
      const tgt = v.clone().addScaledVector(dir, 6)
      return { position: pos.toArray() as [number, number, number], target: tgt.toArray() as [number, number, number] }
    }
    if (sel.kind === 'solar') {
      const c = this.roof.stringCenters.get(sel.id)
      if (!c) return null
      v.copy(c)
      this.roof.group.localToWorld(v)
      return { position: [v.x + 8, v.y + 24, v.z + (v.z < 0 ? 34 : 30)], target: [v.x, v.y, v.z] }
    }
    const sl = this.site.streetlights.find((x) => x.id === sel.id)
    if (!sl) return null
    sl.group.getWorldPosition(v)
    return { position: [v.x + 16, v.y + 12, v.z + 18], target: [v.x, v.y + 3, v.z] }
  }

  private handleFly(req: NonNullable<AppState['flyRequest']>) {
    let pose: CameraPose | null = null
    if (req.pose) pose = req.pose
    else if (req.selection) pose = this.worldOf(req.selection)
    else if (req.preset === 'iso' || req.preset === 'reset') pose = ISO_POSE
    else if (req.preset === 'zoom-in' || req.preset === 'zoom-out') {
      const k = req.preset === 'zoom-in' ? 0.72 : 1.38
      if (this.camera === this.ortho) {
        this.ortho.zoom = THREE.MathUtils.clamp(this.ortho.zoom / k, 0.4, 6)
        this.ortho.updateProjectionMatrix()
        return
      }
      const t = this.controls.target.clone()
      const off = this.persp.position.clone().sub(t).multiplyScalar(k)
      const len = THREE.MathUtils.clamp(off.length(), 10, 340)
      off.setLength(len)
      pose = { position: t.clone().add(off).toArray() as [number, number, number], target: t.toArray() as [number, number, number] }
    }
    if (!pose) return
    if (this.camera === this.ortho) {
      const [tx, , tz] = pose.target
      this.fly = {
        fromPos: this.ortho.position.clone(),
        toPos: new THREE.Vector3(tx, 300, tz + 0.01),
        fromTarget: this.controls.target.clone(),
        toTarget: new THREE.Vector3(tx, 0, tz),
        t: 0,
        dur: 1.0,
      }
      return
    }
    const toPos = new THREE.Vector3(...pose.position)
    const dist = this.persp.position.distanceTo(toPos)
    this.fly = {
      fromPos: this.persp.position.clone(),
      toPos,
      fromTarget: this.controls.target.clone(),
      toTarget: new THREE.Vector3(...pose.target),
      t: 0,
      dur: THREE.MathUtils.clamp(0.9 + dist / 140, 1.0, 2.2),
    }
  }

  /* ---------------------------------------------------------------- interaction */

  private pick(e: PointerEvent): Selection {
    const rect = this.renderer.domElement.getBoundingClientRect()
    this.ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1)
    this.raycaster.setFromCamera(this.ndc, this.camera)
    // Badges render on top of everything (depthTest off), so they win before geometry.
    const badgeHits = this.raycaster.intersectObjects(this.floors.map((f) => f.badgeLayer), true)
    for (const h of badgeHits) if (isShown(h.object) && h.object.userData.pick) return h.object.userData.pick as Selection
    const hits = this.raycaster.intersectObjects(this.scene.children, true)
    for (const h of hits) {
      if (!isShown(h.object)) continue
      const pick = h.object.userData.pick as Selection | undefined
      if (pick) return pick
      // opaque structure blocks picks behind it (glass and helpers do not)
      const m = (h.object as THREE.Mesh).material as THREE.Material | undefined
      if (m && !m.transparent && (h.object as THREE.Mesh).isMesh && h.object.name !== '') return null
    }
    return null
  }

  private onPointerDown = (e: PointerEvent) => {
    this.pointerDown = { x: e.clientX, y: e.clientY }
    if (this.fly) this.fly = null
  }

  private onPointerUp = (e: PointerEvent) => {
    const d = this.pointerDown
    this.pointerDown = null
    if (!d) return
    const dx = e.clientX - d.x
    const dy = e.clientY - d.y
    // Raycaster precision: ignore drags/pans (Δx² + Δy² ≥ 25 px²)
    if (dx * dx + dy * dy >= CLICK_TOLERANCE_SQ) return
    const sel = this.pick(e)
    if (sel?.kind === 'room') actions.select(sel, false)
    else actions.select(sel, !!sel)
  }

  private onPointerMove = (e: PointerEvent) => {
    this.hoverPending = e
  }

  private onPointerLeave = () => {
    this.hoverPending = null
    if (store.get().hover) store.set({ hover: null })
  }

  private processHover() {
    const e = this.hoverPending
    if (!e || this.pointerDown) return
    this.hoverPending = null
    const sel = this.pick(e)
    this.renderer.domElement.style.cursor = sel ? 'pointer' : 'grab'
    const cur = store.get().hover
    if (cur?.kind !== sel?.kind || cur?.id !== sel?.id) store.set({ hover: sel })
  }

  /* ---------------------------------------------------------------- frame loop */

  private updateEnvironment(s: AppState, dt: number) {
    const sun = sunPosition(s.time)
    const night = nightFactor(sun.elevation)
    const day = 1 - night
    const gold = sun.elevation > -4 ? 1 - smoothstep(4, 22, sun.elevation) : 0
    const t = SKY[s.theme]
    const cover = this.weather.cover
    const flash = this.weather.flash

    const top = t.dayTop.clone().lerp(t.goldTop, gold * day).lerp(t.nightTop, night)
    const hor = t.dayHor.clone().lerp(t.goldHor, gold * day * 0.85).lerp(t.nightHor, night)
    const grey = s.theme === 'dark' ? col('#1f2733') : col('#b7bccb')
    top.lerp(grey, cover * 0.55 * day)
    hor.lerp(grey, cover * 0.6 * day)
    this.skyU.uTop.value.copy(top)
    this.skyU.uHor.value.copy(hor)
    this.skyU.uFlash.value = flash
    this.skyU.uSunDir.value.set(...sun.dir)
    this.skyU.uSunVis.value = (1 - cover) * smoothstep(-3, 2, sun.elevation)
    this.skyU.uSunCol.value.set('#ffffff').lerp(col('#ff9a4a'), gold)
    ;(this.scene.fog as THREE.Fog).color.copy(hor)

    const sunUp = smoothstep(-2, 8, sun.elevation)
    this.sun.position.set(sun.dir[0] * 180, Math.max(sun.dir[1], 0.04) * 180, sun.dir[2] * 180)
    this.sun.intensity = 2.3 * sunUp * this.weather.sunDimming
    this.sun.color.set('#fff6ea').lerp(col('#ffa45c'), gold)
    this.sun.castShadow = sunUp > 0.05
    this.moon.intensity = 0.45 * night
    this.hemi.intensity = 0.3 + day * 0.6 + flash * 1.5
    this.hemi.color.set(s.theme === 'dark' ? '#b9d4ff' : '#dfe3ff').lerp(col('#4a5a8a'), night)
    this.hemi.groundColor.set(s.theme === 'dark' ? '#1c2026' : '#8d90a8')
    this.scene.environmentIntensity = 0.12 + day * 0.28
    this.renderer.toneMappingExposure = 1.0 - night * 0.08

    // interior glow & signage
    for (const f of this.floors) {
      f.mats.glass.emissiveIntensity = night * 1.1
      f.mats.glass.opacity = 0.55 - night * 0.2
      f.mats.screen.emissiveIntensity = 0.35 + night * 0.9
    }
    this.site.signage.emissiveIntensity = 1.2 + night * 2.4

    // streetlights
    const lamps = smoothstep(0.35, 0.8, night)
    for (const sl of this.site.streetlights) {
      sl.light.intensity = lamps * 380
      sl.lamp.emissiveIntensity = lamps * 4
      ;(sl.pool.material as THREE.MeshBasicMaterial).opacity = lamps * 0.55
    }
    this.weather.update(dt, this.clock.getElapsed())
  }

  private loop = () => {
    if (this.disposed) return
    this.raf = requestAnimationFrame(this.loop)
    this.clock.update()
    const rawDt = this.clock.getDelta()
    const dt = Math.min(rawDt, 0.1)
    const time = this.clock.getElapsed()
    const s = store.get()

    // smooth floor explosion (lerp)
    this.explode += (s.explode - this.explode) * Math.min(1, dt * 6)
    this.floors.forEach((f, i) => (f.group.position.y = i * FLOOR_HEIGHT + this.explode * i * EXPLODE_GAP))
    this.roof.group.position.y = 3 * FLOOR_HEIGHT + this.explode * (2 * EXPLODE_GAP + 4)

    this.sweepMat.rotation = -time * 1.6
    this.heat.forEach((m) => ((m.material as THREE.ShaderMaterial).uniforms.uTime.value = time))
    if (this.selectionOutline) (this.selectionOutline.material as THREE.LineBasicMaterial).opacity = 0.6 + 0.4 * Math.sin(time * 4)
    const ring = this.site.assembly.getObjectByName('ring') as THREE.Mesh
    const ringMat = ring.material as THREE.MeshBasicMaterial
    ringMat.opacity = this.fire.active ? 0.5 + 0.4 * Math.sin(time * 5) : 0.3
    ring.scale.setScalar(this.fire.active ? 1 + 0.05 * Math.sin(time * 5) : 1)
    this.fire.update(dt, time, this.explode * EXPLODE_GAP)

    this.updateEnvironment(s, dt)
    this.processHover()

    if (this.fly) {
      this.fly.t += dt / this.fly.dur
      const k = ease(Math.min(1, this.fly.t))
      const cam = this.camera as THREE.PerspectiveCamera
      cam.position.lerpVectors(this.fly.fromPos, this.fly.toPos, k)
      this.controls.target.lerpVectors(this.fly.fromTarget, this.fly.toTarget, k)
      if (this.fly.t >= 1) this.fly = null
    }
    this.controls.update()
    this.composer.render()

    this.frames++
    this.fpsTime += rawDt
    if (this.fpsTime >= 0.5) {
      const fps = Math.round(this.frames / this.fpsTime)
      this.frames = 0
      this.fpsTime = 0
      if (fps !== s.fps) store.set({ fps })
    }
  }

  dispose() {
    this.disposed = true
    cancelAnimationFrame(this.raf)
    this.unsub()
    this.ro.disconnect()
    const el = this.renderer.domElement
    el.removeEventListener('pointerdown', this.onPointerDown)
    el.removeEventListener('pointerup', this.onPointerUp)
    el.removeEventListener('pointermove', this.onPointerMove)
    el.removeEventListener('pointerleave', this.onPointerLeave)
    this.controls.dispose()
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh
      m.geometry?.dispose()
      const mat = m.material as THREE.Material | THREE.Material[] | undefined
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose())
      else mat?.dispose()
    })
    this.composer.dispose()
    this.renderer.dispose()
    el.remove()
  }
}

function isShown(o: THREE.Object3D | null): boolean {
  while (o) {
    if (!o.visible) return false
    o = o.parent
  }
  return true
}
