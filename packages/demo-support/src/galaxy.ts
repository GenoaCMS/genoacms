import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'

/**
 * The Milky Way the demos draw, and the stage a dynamic component reaches it through.
 *
 * The application owns the scene, the renderer and the animation loop. A component authored in the
 * CMS receives the stage through `passthrough`, builds objects once with the application's `THREE`,
 * and hands them over with `add`. Per-frame motion is declared on the object (`userData.spin`) and
 * performed here, outside the component's guarded code.
 *
 * One scene unit is 1,000 light-years.
 */

/** What a dynamic component is given to draw into the galaxy with. */
interface GalaxyStage {
  /** A point on the ship's route: 0 is the Sun, 1 is Sagittarius A*. */
  routePoint: (progress: number) => THREE.Vector3
  /** The direction of travel at a point on the route. */
  routeTangent: (progress: number) => THREE.Vector3
  /** A text label facing the camera, scaled to scene units. */
  label: (text: string, color?: string) => THREE.Sprite
  /** A soft round texture for glows and sprites. */
  glow: () => THREE.Texture
  /** Shows the object while `owner` is on the page, and drops it once `owner` is collected. */
  add: (object: THREE.Object3D, owner: Node) => void
  /** Draws the galaxy into a canvas until the returned function is called. */
  mount: (canvas: HTMLCanvasElement) => () => void
}

const SUN_RADIUS = 26
const SUN_ANGLE = Math.PI * 0.55
const ARM_PITCH = Math.tan((12 * Math.PI) / 180)
const STAR_COUNT = 52_000

const seeded = (seed: number): (() => number) => {
  let state = seed
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state)
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296
  }
}

const gaussian = (random: () => number): number =>
  Math.sqrt(-2 * Math.log(random() + 1e-9)) * Math.cos(2 * Math.PI * random())

interface Arm { offset: number, weight: number }

/** Perseus and Scutum–Centaurus carry most stars; Sagittarius and Norma are the minor pair. */
const ARMS: readonly Arm[] = [
  { offset: 0, weight: 1 },
  { offset: Math.PI / 2, weight: 0.55 },
  { offset: Math.PI, weight: 1 },
  { offset: (3 * Math.PI) / 2, weight: 0.55 }
]

const CORE = new THREE.Color('#ffd9a3')
const ARM_BLUE = new THREE.Color('#a9c8ff')
const NEBULA = new THREE.Color('#ff7eb3')

const bulgeStar = (random: () => number, at: THREE.Vector3, color: THREE.Color): void => {
  const barAngle = SUN_ANGLE + (27 * Math.PI) / 180
  const along = gaussian(random) * 7
  const across = gaussian(random) * 2.6
  at.set(
    Math.cos(barAngle) * along - Math.sin(barAngle) * across,
    gaussian(random) * 1.4,
    Math.sin(barAngle) * along + Math.cos(barAngle) * across
  )
  color.copy(CORE).multiplyScalar(0.75 + random() * 0.5)
}

const armStar = (random: () => number, at: THREE.Vector3, color: THREE.Color): void => {
  const total = ARMS.reduce((sum, arm) => sum + arm.weight, 0)
  let pick = random() * total
  const arm = ARMS.find(candidate => (pick -= candidate.weight) < 0) ?? ARMS[0]
  const theta = random() * 2.6 * Math.PI
  const radius = 8 * Math.exp(ARM_PITCH * theta)
  if (radius > 52) return bulgeStar(random, at, color)
  const angle = theta + arm.offset + SUN_ANGLE
  const spread = 0.45 + radius * 0.04
  at.set(
    Math.cos(angle) * radius + gaussian(random) * spread,
    gaussian(random) * (0.35 + radius * 0.008),
    Math.sin(angle) * radius + gaussian(random) * spread
  )
  const warmth = Math.max(0, 1 - radius / 22)
  color.copy(ARM_BLUE).lerp(CORE, warmth).multiplyScalar(0.55 + random() * 0.6)
  if (random() < 0.025) color.copy(NEBULA)
}

const discStar = (random: () => number, at: THREE.Vector3, color: THREE.Color): void => {
  const radius = Math.abs(gaussian(random)) * 18 + 4
  const angle = random() * Math.PI * 2
  at.set(Math.cos(angle) * radius, gaussian(random) * 0.6, Math.sin(angle) * radius)
  color.copy(ARM_BLUE).lerp(CORE, 0.4).multiplyScalar(0.25 + random() * 0.3)
}

const starfield = (texture: THREE.Texture): THREE.Points => {
  const random = seeded(2027)
  const positions = new Float32Array(STAR_COUNT * 3)
  const colors = new Float32Array(STAR_COUNT * 3)
  const at = new THREE.Vector3()
  const color = new THREE.Color()
  for (let index = 0; index < STAR_COUNT; index++) {
    const kind = random()
    if (kind < 0.2) bulgeStar(random, at, color)
    else if (kind < 0.85) armStar(random, at, color)
    else discStar(random, at, color)
    at.toArray(positions, index * 3)
    color.toArray(colors, index * 3)
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  return new THREE.Points(geometry, new THREE.PointsMaterial({
    size: 0.42, map: texture, vertexColors: true, transparent: true,
    depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true
  }))
}

const glowTexture = (): THREE.Texture => {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 64
  const context = canvas.getContext('2d') as CanvasRenderingContext2D
  const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32)
  gradient.addColorStop(0, 'rgba(255,255,255,1)')
  gradient.addColorStop(0.25, 'rgba(255,255,255,.55)')
  gradient.addColorStop(1, 'rgba(255,255,255,0)')
  context.fillStyle = gradient
  context.fillRect(0, 0, 64, 64)
  return new THREE.CanvasTexture(canvas)
}

const textSprite = (text: string, color: string): THREE.Sprite => {
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d') as CanvasRenderingContext2D
  const font = '600 44px Inter, system-ui, sans-serif'
  context.font = font
  canvas.width = Math.ceil(context.measureText(text).width) + 24
  canvas.height = 64
  context.font = font
  context.fillStyle = color
  context.textBaseline = 'middle'
  context.fillText(text, 12, 34)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, depthTest: false }))
  sprite.scale.set((canvas.width / canvas.height) * 1.6, 1.6, 1)
  sprite.center.set(0, 0.5)
  return sprite
}

const glowSprite = (texture: THREE.Texture, color: string, size: number): THREE.Sprite => {
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: texture, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
  }))
  sprite.scale.setScalar(size)
  return sprite
}

const blackHole = (texture: THREE.Texture): THREE.Group => {
  const group = new THREE.Group()
  group.add(glowSprite(texture, '#ffb36b', 9))
  const disk = new THREE.Mesh(
    new THREE.RingGeometry(0.7, 2.2, 96),
    new THREE.MeshBasicMaterial({ color: '#ff9a3c', side: THREE.DoubleSide, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false })
  )
  disk.rotation.x = -Math.PI / 2.3
  disk.userData.spin = 0.6
  group.add(disk)
  group.add(new THREE.Mesh(new THREE.SphereGeometry(0.62, 32, 16), new THREE.MeshBasicMaterial({ color: '#000000' })))
  return group
}

const routeCurve = (): THREE.CatmullRomCurve3 => {
  const points = Array.from({ length: 9 }, (_, index) => {
    const progress = index / 8
    const radius = SUN_RADIUS * Math.pow(1 - progress, 0.9) + progress * 1.4
    const angle = SUN_ANGLE - progress * 1.15
    return new THREE.Vector3(Math.cos(angle) * radius, 0.6 * Math.sin(progress * Math.PI), Math.sin(angle) * radius)
  })
  return new THREE.CatmullRomCurve3(points)
}

const routeTube = (curve: THREE.CatmullRomCurve3): THREE.Mesh =>
  new THREE.Mesh(
    new THREE.TubeGeometry(curve, 240, 0.07, 8, false),
    new THREE.MeshBasicMaterial({ color: '#ffb547', transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false })
  )

interface Tracked { object: THREE.Object3D, owner: WeakRef<Node> }

const createGalaxyStage = (): GalaxyStage => {
  const scene = new THREE.Scene()
  const curve = routeCurve()
  const tracked = new Set<Tracked>()
  let texture: THREE.Texture | undefined
  const glow = (): THREE.Texture => (texture ??= glowTexture())

  const furnish = (): void => {
    if (scene.userData.furnished === true) return
    scene.userData.furnished = true
    scene.add(starfield(glow()), routeTube(curve), blackHole(glow()))
    const sun = curve.getPointAt(0)
    const sunGlow = glowSprite(glow(), '#fff1b8', 2.4)
    sunGlow.position.copy(sun)
    const sunLabel = textSprite('Sun · you are here', '#fff1b8')
    sunLabel.position.copy(sun).add(new THREE.Vector3(1.2, 0.6, 0))
    const coreLabel = textSprite('Sagittarius A*', '#ffcf8a')
    coreLabel.position.set(2.6, 1.4, 0)
    scene.add(sunGlow, sunLabel, coreLabel)
  }

  const forget = (entry: Tracked): void => {
    scene.remove(entry.object)
    tracked.delete(entry)
  }

  const step = (delta: number): void => {
    for (const entry of tracked) {
      const owner = entry.owner.deref()
      if (owner === undefined) forget(entry)
      else entry.object.visible = owner.isConnected
    }
    scene.traverse(object => {
      const spin = object.userData.spin
      if (typeof spin === 'number') object.rotation.z += spin * delta
    })
  }

  const rendererFor = (canvas: HTMLCanvasElement): THREE.WebGLRenderer | null => {
    try {
      return new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
    } catch {
      return null
    }
  }

  const mount = (canvas: HTMLCanvasElement): (() => void) => {
    const renderer = rendererFor(canvas)
    if (renderer === null) {
      canvas.dataset.unavailable = ''
      return () => {}
    }
    return animate(renderer, canvas)
  }

  const animate = (renderer: THREE.WebGLRenderer, canvas: HTMLCanvasElement): (() => void) => {
    furnish()
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 400)
    camera.position.set(0, 42, 58)
    const controls = new OrbitControls(camera, canvas)
    Object.assign(controls, { enableDamping: true, enableZoom: false, enablePan: false, autoRotate: true, autoRotateSpeed: 0.35, maxPolarAngle: Math.PI * 0.47 })
    const resize = (): void => {
      const { clientWidth: width, clientHeight: height } = canvas
      if (width === 0 || height === 0) return
      renderer.setSize(width, height, false)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
    }
    const observer = new ResizeObserver(resize)
    observer.observe(canvas)
    let visible = true
    const watcher = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting })
    watcher.observe(canvas)
    const clock = new THREE.Clock()
    renderer.setAnimationLoop(() => {
      const delta = clock.getDelta()
      if (!visible) return
      step(delta)
      controls.update()
      renderer.render(scene, camera)
    })
    return () => {
      renderer.setAnimationLoop(null)
      observer.disconnect()
      watcher.disconnect()
      controls.dispose()
      renderer.dispose()
    }
  }

  return Object.freeze({
    routePoint: (progress: number) => curve.getPointAt(THREE.MathUtils.clamp(progress, 0, 1)),
    routeTangent: (progress: number) => curve.getTangentAt(THREE.MathUtils.clamp(progress, 0, 1)),
    label: (text: string, color = '#e8ecf8') => textSprite(text, color),
    glow,
    add: (object: THREE.Object3D, owner: Node) => {
      object.visible = owner.isConnected
      scene.add(object)
      tracked.add({ object, owner: new WeakRef(owner) })
    },
    mount
  })
}

export { createGalaxyStage }
export type { GalaxyStage }
