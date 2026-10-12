import * as THREE from 'three'
import { ENVELOPE, GROUND_Y } from '../data/layout'
import type { Weather } from '../types'
import { makeCloudTexture } from './textures'

const RAIN_COUNT = 9000
const AREA = 220
const TOP = 90

/** Clouds, rain streaks, ground ripples and storm lightning. */
export class WeatherSystem {
  readonly group = new THREE.Group()
  private clouds: THREE.Sprite[] = []
  private cloudMat: THREE.SpriteMaterial
  private rain: THREE.LineSegments
  private rainPos: Float32Array
  private rainSpeed: Float32Array
  private ripples: THREE.InstancedMesh
  private rippleMat: THREE.ShaderMaterial
  private bolt: THREE.Line
  private boltMat: THREE.LineBasicMaterial
  readonly flashLight = new THREE.DirectionalLight('#dbeafe', 0)
  private cloudCover = 0
  private rainAmount = 0
  private nextStrike = 4
  private strikeT = -1
  flash = 0
  weather: Weather = 'clear'

  constructor() {
    this.group.name = 'weather'
    this.cloudMat = new THREE.SpriteMaterial({ map: makeCloudTexture(), transparent: true, opacity: 0, depthWrite: false, color: '#cbd5e1' })
    for (let i = 0; i < 22; i++) {
      const s = new THREE.Sprite(this.cloudMat)
      const r = 40 + Math.random() * 140
      const a = Math.random() * Math.PI * 2
      s.position.set(Math.cos(a) * r, 46 + Math.random() * 22, Math.sin(a) * r)
      const k = 60 + Math.random() * 60
      s.scale.set(k, k * 0.55, 1)
      this.clouds.push(s)
      this.group.add(s)
    }

    this.rainPos = new Float32Array(RAIN_COUNT * 6)
    this.rainSpeed = new Float32Array(RAIN_COUNT)
    for (let i = 0; i < RAIN_COUNT; i++) {
      const x = (Math.random() - 0.5) * AREA
      const y = GROUND_Y + Math.random() * TOP
      const z = (Math.random() - 0.5) * AREA
      this.rainPos.set([x, y, z, x, y + 1.2, z], i * 6)
      this.rainSpeed[i] = 0.8 + Math.random() * 0.4
    }
    const rg = new THREE.BufferGeometry()
    rg.setAttribute('position', new THREE.BufferAttribute(this.rainPos, 3))
    this.rain = new THREE.LineSegments(
      rg,
      new THREE.LineBasicMaterial({ color: '#a5c8ff', transparent: true, opacity: 0.38, depthWrite: false }),
    )
    this.rain.frustumCulled = false
    this.rain.visible = false
    this.group.add(this.rain)

    // Ground ripples (instanced rings, animated in the shader)
    const ringGeo = new THREE.RingGeometry(0.15, 0.24, 20)
    ringGeo.rotateX(-Math.PI / 2)
    const n = 260
    const phase = new Float32Array(n)
    this.rippleMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uAmount: { value: 0 } },
      vertexShader: /* glsl */ `
        attribute float aPhase; uniform float uTime; varying float vT;
        void main(){
          float t = fract(uTime*0.9 + aPhase); vT = t;
          vec3 p = position * (1.0 + t*7.0);
          gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(p,1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform float uAmount; varying float vT;
        void main(){ gl_FragColor = vec4(0.55,0.7,0.95, (1.0-vT)*0.45*uAmount); }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    this.ripples = new THREE.InstancedMesh(ringGeo, this.rippleMat, n)
    const m = new THREE.Matrix4()
    for (let i = 0; i < n; i++) {
      let x = 0
      let z = 0
      do {
        x = (Math.random() - 0.5) * 170
        z = (Math.random() - 0.5) * 110
      } while (x > ENVELOPE.minX - 2 && x < ENVELOPE.maxX + 12 && z > ENVELOPE.minZ - 2 && z < ENVELOPE.maxZ + 2)
      m.makeTranslation(x, GROUND_Y + 0.03, z)
      this.ripples.setMatrixAt(i, m)
      phase[i] = Math.random()
    }
    ringGeo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phase, 1))
    this.ripples.visible = false
    this.group.add(this.ripples)

    this.boltMat = new THREE.LineBasicMaterial({ color: '#e0f2fe', transparent: true, opacity: 0 })
    this.bolt = new THREE.Line(new THREE.BufferGeometry(), this.boltMat)
    this.group.add(this.bolt)
    this.flashLight.position.set(-40, 120, 30)
    this.group.add(this.flashLight)
  }

  private regenerateBolt() {
    const pts: THREE.Vector3[] = []
    const x0 = (Math.random() - 0.5) * 240
    const z0 = -80 - Math.random() * 80
    let p = new THREE.Vector3(x0, 90, z0)
    pts.push(p.clone())
    while (p.y > GROUND_Y) {
      p = p.clone().add(new THREE.Vector3((Math.random() - 0.5) * 7, -4 - Math.random() * 5, (Math.random() - 0.5) * 4))
      pts.push(p)
    }
    this.bolt.geometry.dispose()
    this.bolt.geometry = new THREE.BufferGeometry().setFromPoints(pts)
  }

  update(dt: number, time: number) {
    const w = this.weather
    const coverTarget = w === 'clear' ? 0 : w === 'cloudy' ? 0.55 : w === 'rain' ? 0.8 : 0.95
    const rainTarget = w === 'rain' ? 0.65 : w === 'storm' ? 1 : 0
    this.cloudCover += (coverTarget - this.cloudCover) * Math.min(1, dt * 1.5)
    this.rainAmount += (rainTarget - this.rainAmount) * Math.min(1, dt * 2)

    this.cloudMat.opacity = this.cloudCover * 0.85
    this.cloudMat.color.set(w === 'storm' ? '#64748b' : w === 'rain' ? '#94a3b8' : '#e2e8f0')
    const drift = dt * (w === 'storm' ? 6 : 2)
    for (const c of this.clouds) {
      c.position.x += drift
      if (c.position.x > 200) c.position.x = -200
    }

    const raining = this.rainAmount > 0.02
    this.rain.visible = raining
    this.ripples.visible = raining
    this.rippleMat.uniforms.uTime.value = time
    this.rippleMat.uniforms.uAmount.value = this.rainAmount
    if (raining) {
      ;(this.rain.material as THREE.LineBasicMaterial).opacity = 0.55 * this.rainAmount
      const speed = (w === 'storm' ? 78 : 55) * dt
      const wind = w === 'storm' ? 0.35 : 0.08
      const visible = Math.floor(RAIN_COUNT * this.rainAmount)
      const p = this.rainPos
      for (let i = 0; i < RAIN_COUNT; i++) {
        const o = i * 6
        if (i >= visible) {
          p[o + 1] = p[o + 4] = -999
          continue
        }
        const d = speed * this.rainSpeed[i]
        let y = p[o + 1] - d
        let x = p[o] + d * wind
        if (y < GROUND_Y) {
          y = GROUND_Y + TOP * (0.7 + Math.random() * 0.3)
          x = (Math.random() - 0.5) * AREA
          p[o + 2] = p[o + 5] = (Math.random() - 0.5) * AREA
        }
        p[o] = x
        p[o + 1] = y
        p[o + 3] = x - 1.6 * wind
        p[o + 4] = y + 1.6
      }
      this.rain.geometry.attributes.position.needsUpdate = true
    }

    // Lightning
    if (w === 'storm') {
      this.nextStrike -= dt
      if (this.nextStrike <= 0) {
        this.strikeT = 0
        this.regenerateBolt()
        this.nextStrike = 3 + Math.random() * 6
      }
    }
    if (this.strikeT >= 0) {
      this.strikeT += dt
      const t = this.strikeT
      const pulse = Math.max(0, 1 - t / 0.09) + (t > 0.14 ? Math.max(0, 1 - (t - 0.14) / 0.12) * 0.8 : 0)
      this.flash = pulse
      this.boltMat.opacity = pulse
      if (t > 0.5) {
        this.strikeT = -1
        this.flash = 0
        this.boltMat.opacity = 0
      }
    }
    this.flashLight.intensity = this.flash * 6
  }

  /** 0–1 multiplier for the sun under cloud cover. */
  get sunDimming() {
    return 1 - this.cloudCover * 0.75
  }
  get cover() {
    return this.cloudCover
  }
}
