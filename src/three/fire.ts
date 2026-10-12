import * as THREE from 'three'
import { ASSEMBLY_POINT, SLAB } from '../data/layout'
import type { PlanRect } from '../types'
import { makeGlowTexture } from './textures'

const SMOKE = 240
const EVACUEES = 46

/** Room 345 smoke incident: pulsing room volume, rising smoke, glowing egress spline and evacuee flow. */
export class FireSystem {
  readonly group = new THREE.Group()
  readonly roomGroup = new THREE.Group()
  readonly curve: THREE.CatmullRomCurve3
  private tubeMat: THREE.ShaderMaterial
  private roomMat: THREE.MeshBasicMaterial
  private alarmLight = new THREE.PointLight('#f43f5e', 0, 30, 1.5)
  private smoke: THREE.Points
  private smokePos: Float32Array
  private smokeLife: Float32Array
  private evac: THREE.InstancedMesh
  private evacT: Float32Array
  private origin: THREE.Vector3
  active = false
  evacuating = false
  private t = 0

  constructor(room: PlanRect) {
    this.group.name = 'fire'
    this.group.visible = false
    this.roomGroup.visible = false
    const cx = room.x + room.w / 2
    const cz = room.z + room.d / 2
    this.origin = new THREE.Vector3(cx, 0, cz)

    // Room volume (attached to the F2 floor group by the engine)
    this.roomMat = new THREE.MeshBasicMaterial({ color: '#f43f5e', transparent: true, opacity: 0.25, depthWrite: false, blending: THREE.AdditiveBlending })
    const vol = new THREE.Mesh(new THREE.BoxGeometry(room.w - 0.4, 3.2, room.d - 0.4), this.roomMat)
    vol.position.set(cx, SLAB + 1.6, cz)
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(room.w - 0.2, 3.3, room.d - 0.2)),
      new THREE.LineBasicMaterial({ color: '#fb7185' }),
    )
    edges.position.copy(vol.position)
    this.alarmLight.position.set(cx, 2.6, cz)
    this.roomGroup.add(vol, edges, this.alarmLight)

    // Egress spline: room 345 → corridor → east stair core → lobby → portico → assembly point.
    const y2 = 4 + SLAB + 0.4
    const pts: [number, number, number][] = [
      [cx, y2, cz],
      [cx, y2, 7.4],
      [cx + 3, y2, 7.6],
      [44, y2, 7.6],
      [49.9, y2, 6],
      [51.2, y2, 1.5],
      [51.2, 2.4, -2.5],
      [50.4, 0.75, -6.5],
      [50.6, 0.75, -14],
      [58, 0.75, -18],
      [62.8, 0.75, -18],
      [68, 0.6, -18],
      [72.4, -0.1, -17],
      [75, -0.95, -12],
      [74, -0.95, 8],
      [ASSEMBLY_POINT[0], ASSEMBLY_POINT[1] + 0.4, ASSEMBLY_POINT[2]],
    ]
    this.curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)), false, 'catmullrom', 0.2)
    const length = this.curve.getLength()
    this.tubeMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uLen: { value: length }, uReveal: { value: 0 } },
      vertexShader: /* glsl */ `
        varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: /* glsl */ `
        uniform float uTime; uniform float uLen; uniform float uReveal; varying vec2 vUv;
        void main(){
          if (vUv.x > uReveal) discard;
          float s = fract(vUv.x * uLen / 2.2 - uTime * 1.6);
          float chevron = smoothstep(0.0, 0.25, s) * (1.0 - smoothstep(0.45, 0.6, s));
          vec3 base = vec3(0.06, 0.73, 0.4);
          vec3 col = base * (1.4 + chevron * 2.2);
          gl_FragColor = vec4(col, 0.55 + chevron * 0.45);
        }`,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    })
    const tube = new THREE.Mesh(new THREE.TubeGeometry(this.curve, 420, 0.28, 10, false), this.tubeMat)
    tube.renderOrder = 20
    this.group.add(tube)

    // Smoke particles
    this.smokePos = new Float32Array(SMOKE * 3)
    this.smokeLife = new Float32Array(SMOKE)
    for (let i = 0; i < SMOKE; i++) this.respawnSmoke(i, Math.random())
    const sg = new THREE.BufferGeometry()
    sg.setAttribute('position', new THREE.BufferAttribute(this.smokePos, 3))
    this.smoke = new THREE.Points(
      sg,
      new THREE.PointsMaterial({
        size: 7,
        map: makeGlowTexture('rgba(120,120,130,0.9)', 64),
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
        color: '#9ca3af',
      }),
    )
    this.smoke.frustumCulled = false
    this.group.add(this.smoke)

    // Evacuees (dots moving along the spline)
    this.evac = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.32, 10, 8),
      new THREE.MeshBasicMaterial({ color: '#86efac', depthTest: false, transparent: true }),
      EVACUEES,
    )
    this.evac.renderOrder = 21
    this.evacT = new Float32Array(EVACUEES)
    for (let i = 0; i < EVACUEES; i++) this.evacT[i] = -i * 0.035
    this.group.add(this.evac)
  }

  private respawnSmoke(i: number, life = 0) {
    const o = i * 3
    this.smokePos[o] = this.origin.x + (Math.random() - 0.5) * 8
    this.smokePos[o + 1] = 6 + Math.random() * 2
    this.smokePos[o + 2] = this.origin.z + (Math.random() - 0.5) * 5
    this.smokeLife[i] = life
  }

  start() {
    this.active = true
    this.evacuating = false
    this.t = 0
    this.group.visible = true
    this.roomGroup.visible = true
    for (let i = 0; i < EVACUEES; i++) this.evacT[i] = -i * 0.035
    this.tubeMat.uniforms.uReveal.value = 0
  }

  beginEvacuation() {
    this.evacuating = true
  }

  stop() {
    this.active = false
    this.evacuating = false
    this.group.visible = false
    this.roomGroup.visible = false
    this.alarmLight.intensity = 0
  }

  update(dt: number, time: number, floorOffsetY: number) {
    if (!this.active) return
    this.t += dt
    const pulse = 0.5 + 0.5 * Math.sin(time * 7)
    this.roomMat.opacity = 0.15 + pulse * 0.3
    this.alarmLight.intensity = 40 + pulse * 120
    this.tubeMat.uniforms.uTime.value = time
    if (this.evacuating) this.tubeMat.uniforms.uReveal.value = Math.min(1, this.tubeMat.uniforms.uReveal.value + dt * 0.6)

    // smoke rises from room 345 through the roof plane
    const p = this.smokePos
    for (let i = 0; i < SMOKE; i++) {
      this.smokeLife[i] += dt * 0.22
      if (this.smokeLife[i] > 1) this.respawnSmoke(i)
      const o = i * 3
      p[o + 1] = 6 + floorOffsetY + this.smokeLife[i] * 34
      p[o] += dt * (1.6 + Math.sin(time + i) * 0.6)
      p[o + 2] += dt * Math.cos(time * 0.7 + i) * 0.6
    }
    this.smoke.geometry.attributes.position.needsUpdate = true

    // evacuee flow
    const m = new THREE.Matrix4()
    const v = new THREE.Vector3()
    for (let i = 0; i < EVACUEES; i++) {
      if (this.evacuating) this.evacT[i] += dt * 0.075
      const t = this.evacT[i]
      if (t < 0 || !this.evacuating) {
        v.copy(this.curve.getPointAt(0)).add(new THREE.Vector3(((i * 37) % 9) - 4, 0, ((i * 13) % 6) - 3))
      } else if (t >= 1) {
        const a = i * 2.39996
        const r = 1.2 + (i % 5) * 0.55
        v.set(ASSEMBLY_POINT[0] + Math.cos(a) * r, ASSEMBLY_POINT[1] + 0.35, ASSEMBLY_POINT[2] + Math.sin(a) * r)
      } else {
        v.copy(this.curve.getPointAt(t))
        v.y += 0.15
      }
      m.makeTranslation(v.x, v.y, v.z)
      this.evac.setMatrixAt(i, m)
    }
    this.evac.instanceMatrix.needsUpdate = true
  }
}
