/// <reference lib="webworker" />

import {
  Camera,
  Mesh,
  Program,
  Renderer,
  Sphere,
  Texture,
  Transform,
  Vec3,
  type OGLRenderingContext,
} from 'ogl'

type MatcapKind = 'whiteMatte' | 'whiteSoft' | 'whiteFrosted' | 'blackGloss' | 'blackMatte'
type InitMessage = {
  type: 'init'
  canvas: OffscreenCanvas
  width: number
  height: number
  pixelRatio: number
  textures: Record<MatcapKind, string>
}
type WorkerMessage = InitMessage
  | { type: 'resize'; width: number; height: number; pixelRatio: number }
  | { type: 'active'; active: boolean }
  | { type: 'motion'; pitch: number; roll: number }
  | { type: 'dispose' }
type Ball = {
  mesh: Mesh
  angle: number
  phase: number
  position: Vec3
  velocity: Vec3
  seat: Vec3
}

const VERTEX_SHADER = /* glsl */ `
  attribute vec3 position;
  attribute vec3 normal;
  uniform mat4 modelViewMatrix;
  uniform mat4 projectionMatrix;
  uniform mat3 normalMatrix;
  varying vec3 vViewPosition;
  varying vec3 vViewNormal;
  void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vViewPosition = -mvPosition.xyz;
    vViewNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * mvPosition;
  }
`
const FRAGMENT_SHADER = /* glsl */ `
  precision mediump float;
  uniform sampler2D tMatcap;
  varying vec3 vViewPosition;
  varying vec3 vViewNormal;
  void main() {
    vec3 viewDir = normalize(vViewPosition);
    vec3 x = normalize(vec3(viewDir.z, 0.0, -viewDir.x));
    vec3 y = cross(viewDir, x);
    vec3 normal = normalize(vViewNormal);
    vec2 uv = vec2(dot(x, normal), dot(y, normal)) * 0.495 + 0.5;
    // The WebP matcaps already contain display-ready sRGB values. OGL does not
    // insert Three's decode/encode colour-management pair, so applying another
    // gamma curve here washes out the ink finishes and clips the white ones.
    gl_FragColor = texture2D(tMatcap, uv);
  }
`

const BALL_COUNT = 9
const CAMERA_Z = 8.82
const SPIRAL_TURNS = 2.75
const LITE_DEPTH_MAX_RATIO = 1.5
const GYRO_DEPTH_RESPONSE = 0.32
const LITE_DAMPING = 0.972
const FRAME_MS = 1000 / 60
let renderer: Renderer | null = null
let gl: OGLRenderingContext | null = null
let scene: Transform | null = null
let orbit: Transform | null = null
let camera: Camera | null = null
let geometry: Sphere | null = null
let programs: Program[] = []
let balls: Ball[] = []
let textures: Array<{ texture: Texture; bitmap: ImageBitmap }> = []
let active = true
let frameId = 0
let lastFrame = 0
let width = 1
let height = 1
let pixelRatio = 1
let radius = 0.45
let ringRadius = 1.8
let tiltPhase = 0
let targetRoll = 0
let targetPitch = 0
let roll = 0
let pitch = 0
let physicsRestRoll = 0
let physicsRestPitch = 0
let disposed = false
const temp = new Vec3()
const push = new Vec3()
const local = new Vec3()
const camRight = new Vec3(1, 0, 0)
const camUp = new Vec3(0, 1, 0)
const camForward = new Vec3(0, 0, -1)
const hapticPairs = new Set<number>()
const hapticAlive = new Set<number>()

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}
function lerpStops(x: number, stops: number[], values: number[]) {
  if (x <= stops[0]!) return values[0]!
  const last = stops.length - 1
  if (x >= stops[last]!) return values[last]!
  for (let i = 0; i < last; i++) {
    if (x <= stops[i + 1]!) {
      const p = (x - stops[i]!) / (stops[i + 1]! - stops[i]!)
      return values[i]! + (values[i + 1]! - values[i]!) * p
    }
  }
  return values[last]!
}
function pointOnOrbit(ball: Ball, out: Vec3) {
  const tube = ringRadius * 0.3
  const phase = ball.angle * SPIRAL_TURNS + ball.phase
  const major = ringRadius + tube * Math.cos(phase)
  local
    .set(major * Math.cos(ball.angle), major * Math.sin(ball.angle), tube * Math.sin(phase))
    .applyQuaternion(orbit!.quaternion)
  out.copy(local)
}
function flattenSeatToScreenPlane(seat: Vec3) {
  const depthMax = ringRadius * LITE_DEPTH_MAX_RATIO
  const screenX = seat.dot(camRight)
  const screenY = seat.dot(camUp)
  const depth = clamp(seat.dot(camForward), -depthMax, depthMax)
  seat
    .copy(camRight)
    .scale(screenX)
    .add(push.copy(camUp).scale(screenY))
    .add(push.copy(camForward).scale(depth))
  return depth
}
function seatBalls(reset: boolean) {
  for (const ball of balls) {
    pointOnOrbit(ball, ball.seat)
    const seatDepth = flattenSeatToScreenPlane(ball.seat)
    if (!reset) continue
    const scatter = 1.42 + (ball.angle % 0.35)
    const screenX = ball.seat.dot(camRight) * scatter
    const screenY = ball.seat.dot(camUp) * scatter
    ball.position
      .copy(camRight)
      .scale(screenX)
      .add(push.copy(camUp).scale(screenY))
      .add(push.copy(camForward).scale(seatDepth))
    ball.velocity.set(0, 0, 0)
    ball.mesh.position.copy(ball.position)
  }
}
function layout() {
  if (!renderer || !camera) return
  renderer.dpr = Math.min(pixelRatio, 1)
  renderer.setSize(Math.max(1, width), Math.max(1, height))
  camera.perspective({ aspect: width / Math.max(1, height) })
  const fromW = lerpStops(width, [390, 768, 1280], [90, 118, 156])
  const fromH = lerpStops(height, [667, 800, 900, 1080], [96, 118, 142, 176])
  const aspect = width / Math.max(height, 1)
  const hWeight = Math.min(0.46, Math.max(0.16, (aspect - 0.48) / 2.4))
  const diameterPx = Math.max(72, Math.min(
    (fromW * (1 - hWeight) + fromH * hWeight) * 1.2,
    height * 0.16,
    width * 0.28,
  ))
  radius = diameterPx * 0.5 * (2 * Math.tan(40 * Math.PI / 360) * CAMERA_Z) / Math.max(height, 1)
  ringRadius = radius * lerpStops(Math.sqrt(width * height), [560, 780, 1100], [4.2, 5, 6.1]) * 0.84
  for (const ball of balls) ball.mesh.scale.set(radius)
  seatBalls(true)
}
async function loadTexture(context: OGLRenderingContext, url: string) {
  const response = await fetch(url, { credentials: 'omit' })
  if (!response.ok) throw new Error(`Matcap request failed: ${response.status}`)
  const bitmap = await createImageBitmap(await response.blob())
  const texture = new Texture(context, {
    image: bitmap as unknown as HTMLCanvasElement,
    generateMipmaps: true,
    flipY: true,
  })
  textures.push({ texture, bitmap })
  return texture
}
function scheduleFrame() {
  if (!active || disposed || frameId) return
  frameId = self.requestAnimationFrame(renderFrame)
}
function renderFrame(now: number) {
  frameId = 0
  if (!active || disposed || !renderer || !scene || !camera || !orbit) return
  const dt = Math.min(32, lastFrame ? now - lastFrame : 16.67)
  lastFrame = now
  const blend = 1 - Math.exp(-dt / 180)
  roll += (targetRoll - roll) * blend
  pitch += (targetPitch - pitch) * blend
  const physicsReleaseBlend = 1 - Math.exp(-dt / 500)
  physicsRestRoll += (roll - physicsRestRoll) * physicsReleaseBlend
  physicsRestPitch += (pitch - physicsRestPitch) * physicsReleaseBlend
  const physicsRoll = roll - physicsRestRoll
  const physicsPitch = pitch - physicsRestPitch
  tiltPhase += 0.000018 * dt
  orbit.rotation.set(
    -0.62 + Math.sin(tiltPhase) * 0.22,
    0.78 + tiltPhase * 0.35,
    0.18 + Math.cos(tiltPhase * 0.7) * 0.12,
  )
  hapticAlive.clear()
  for (let i = 0; i < balls.length; i++) {
    const ball = balls[i]!
    ball.angle += 0.0001792 * dt
    pointOnOrbit(ball, ball.seat)
    const seatDepth = flattenSeatToScreenPlane(ball.seat)

    // The accepted Three.js scene performs all mobile motion in camera-space
    // XY and restores the helix depth separately. Keeping OGL positions in the
    // tilted orbit's local axes made a vertical device tip travel into Z.
    const positionX = ball.position.dot(camRight)
    const positionY = ball.position.dot(camUp)
    ball.position
      .copy(camRight)
      .scale(positionX)
      .add(push.copy(camUp).scale(positionY))
      .add(push.copy(camForward).scale(seatDepth))
    const velocityX = ball.velocity.dot(camRight)
    const velocityY = ball.velocity.dot(camUp)
    ball.velocity
      .copy(camRight)
      .scale(velocityX)
      .add(push.copy(camUp).scale(velocityY))

    push.sub(ball.seat, ball.position)
    const pullX = push.dot(camRight)
    const pullY = push.dot(camUp)
    push
      .copy(camRight)
      .scale(pullX)
      .add(temp.copy(camUp).scale(pullY))
      .scale(0.00006 * dt)
    ball.velocity.add(push)
    const depthResponse = 1
      + clamp(-seatDepth / Math.max(ringRadius * LITE_DEPTH_MAX_RATIO, 0.001), -1, 1)
      * GYRO_DEPTH_RESPONSE
    ball.velocity
      .add(push.copy(camRight).scale(-physicsRoll * depthResponse * 0.0011 * dt))
      .add(push.copy(camUp).scale(-physicsPitch * depthResponse * 0.0011 * dt))
    for (let j = i + 1; j < balls.length; j++) {
      const other = balls[j]!
      temp.sub(ball.position, other.position)
      const separationX = temp.dot(camRight)
      const separationY = temp.dot(camUp)
      temp
        .copy(camRight)
        .scale(separationX)
        .add(push.copy(camUp).scale(separationY))
      const distance = temp.len()
      const minimum = radius * 2.04
      if (distance > 0.0001 && distance < minimum) {
        const overlap = (minimum - distance) / minimum
        const pairKey = (i << 8) | j
        if (overlap >= 0.1) {
          hapticAlive.add(pairKey)
          if (!hapticPairs.has(pairKey)) {
            self.postMessage({ type: 'haptic-contact', pairKey, overlap })
          }
        }
        temp.normalize().scale((minimum - distance) / minimum * 0.018 * dt)
        ball.velocity.add(temp)
        other.velocity.sub(temp)
      }
    }
    // Preserve the former 60 Hz damping while making it time-based. This keeps
    // the worker responsive at 90/120 Hz instead of over-damping every extra
    // display frame and looking as though it were running at a lower cadence.
    ball.velocity.scale(Math.pow(LITE_DAMPING, dt / FRAME_MS))
    const nextVelocityX = ball.velocity.dot(camRight)
    const nextVelocityY = ball.velocity.dot(camUp)
    const speed = Math.hypot(nextVelocityX, nextVelocityY)
    const speedScale = speed > 0.22 ? 0.22 / speed : 1
    ball.velocity
      .copy(camRight)
      .scale(nextVelocityX * speedScale)
      .add(push.copy(camUp).scale(nextVelocityY * speedScale))
    ball.position.add(ball.velocity)
    const wallX = ringRadius * 2.15
    const wallY = ringRadius * 2.35
    let screenX = ball.position.dot(camRight)
    let screenY = ball.position.dot(camUp)
    let screenVelocityX = ball.velocity.dot(camRight)
    let screenVelocityY = ball.velocity.dot(camUp)
    const maxX = Math.max(0.2, wallX - radius)
    const maxY = Math.max(0.2, wallY - radius)
    if (Math.abs(screenX) > maxX) {
      const pairKey = (i << 8) | (BALL_COUNT + 0)
      const overlap = clamp(Math.abs(screenVelocityX) / 0.22, 0, 1)
      if (overlap >= 0.1) {
        hapticAlive.add(pairKey)
        if (!hapticPairs.has(pairKey)) {
          self.postMessage({ type: 'haptic-contact', pairKey, overlap })
        }
      }
      screenX = Math.sign(screenX) * maxX
      screenVelocityX *= -0.62
    }
    if (Math.abs(screenY) > maxY) {
      const pairKey = (i << 8) | (BALL_COUNT + 1)
      const overlap = clamp(Math.abs(screenVelocityY) / 0.22, 0, 1)
      if (overlap >= 0.1) {
        hapticAlive.add(pairKey)
        if (!hapticPairs.has(pairKey)) {
          self.postMessage({ type: 'haptic-contact', pairKey, overlap })
        }
      }
      screenY = Math.sign(screenY) * maxY
      screenVelocityY *= -0.62
    }
    ball.position
      .copy(camRight)
      .scale(screenX)
      .add(push.copy(camUp).scale(screenY))
      .add(push.copy(camForward).scale(seatDepth))
    ball.velocity
      .copy(camRight)
      .scale(screenVelocityX)
      .add(push.copy(camUp).scale(screenVelocityY))
    ball.mesh.position.copy(ball.position)
  }
  for (const pairKey of hapticPairs) {
    if (hapticAlive.has(pairKey)) continue
    hapticPairs.delete(pairKey)
    self.postMessage({ type: 'haptic-release', pairKey })
  }
  for (const pairKey of hapticAlive) hapticPairs.add(pairKey)
  renderer.render({ scene, camera, sort: true, frustumCull: false })
  scheduleFrame()
}
async function init(message: InitMessage) {
  width = Math.max(1, message.width)
  height = Math.max(1, message.height)
  pixelRatio = Math.max(1, message.pixelRatio)
  renderer = new Renderer({
    canvas: message.canvas as unknown as HTMLCanvasElement,
    width,
    height,
    dpr: Math.min(pixelRatio, 1),
    antialias: true,
    alpha: true,
    depth: true,
    stencil: false,
    premultipliedAlpha: true,
    preserveDrawingBuffer: false,
    powerPreference: 'default',
  })
  gl = renderer.gl
  scene = new Transform()
  orbit = new Transform()
  // Three's accepted mobile composition uses explicit XYZ Euler order. OGL's
  // default is YXZ, which noticeably changes the apparent centre/tilt.
  orbit.rotation.reorder('XYZ')
  orbit.setParent(scene)
  camera = new Camera(gl, { fov: 40, near: 0.1, far: 50, aspect: width / height })
  camera.position.set(0, 0.12, CAMERA_Z)
  camera.lookAt([0, 0, 0])
  camera.updateMatrixWorld()
  camRight.set(camera.worldMatrix[0]!, camera.worldMatrix[1]!, camera.worldMatrix[2]!).normalize()
  camUp.set(camera.worldMatrix[4]!, camera.worldMatrix[5]!, camera.worldMatrix[6]!).normalize()
  camForward
    .set(camera.worldMatrix[8]!, camera.worldMatrix[9]!, camera.worldMatrix[10]!)
    .normalize()
    .scale(-1)
  gl.clearColor(0, 0, 0, 0)
  self.postMessage({ type: 'booted' })
  const maps = await Promise.all(Object.entries(message.textures).map(async ([kind, url]) => (
    [kind as MatcapKind, await loadTexture(gl!, url)] as const
  )))
  if (disposed || !gl || !orbit) return
  const byKind = Object.fromEntries(maps) as Record<MatcapKind, Texture>
  const plan: MatcapKind[] = [
    'blackGloss', 'whiteFrosted', 'whiteSoft', 'whiteMatte', 'whiteFrosted',
    'blackGloss', 'blackMatte', 'blackGloss', 'blackMatte',
  ]
  geometry = new Sphere(gl, { radius: 1, widthSegments: 36, heightSegments: 36 })
  const programByKind = new Map<MatcapKind, Program>()
  balls = plan.map((kind, index) => {
    let program = programByKind.get(kind)
    if (!program) {
      program = new Program(gl!, {
        vertex: VERTEX_SHADER,
        fragment: FRAGMENT_SHADER,
        uniforms: { tMatcap: { value: byKind[kind] } },
        transparent: true,
        depthTest: true,
        depthWrite: true,
        cullFace: gl!.BACK,
      })
      programByKind.set(kind, program)
      programs.push(program)
    }
    const mesh = new Mesh(gl!, { geometry: geometry!, program })
    // The Three.js mobile balls live in world space. The orbit quaternion only
    // shapes their seats; parenting physics meshes to it rotates screen Y into
    // depth and breaks the device-tilt contract.
    mesh.setParent(scene!)
    return {
      mesh,
      angle: index / BALL_COUNT * Math.PI * 2,
      phase: index / BALL_COUNT * Math.PI * 2 * SPIRAL_TURNS,
      position: new Vec3(),
      velocity: new Vec3(),
      seat: new Vec3(),
    }
  })
  layout()
  renderer.render({ scene, camera, sort: true, frustumCull: false })
  self.postMessage({ type: 'lit' })
  scheduleFrame()
}
function dispose() {
  disposed = true
  active = false
  if (frameId) self.cancelAnimationFrame(frameId)
  frameId = 0
  balls = []
  geometry?.remove()
  geometry = null
  for (const program of programs) program.remove()
  programs = []
  for (const entry of textures) {
    gl?.deleteTexture(entry.texture.texture)
    entry.bitmap.close()
  }
  textures = []
  gl?.getExtension('WEBGL_lose_context')?.loseContext()
  renderer = null
  gl = null
  scene = null
  orbit = null
  camera = null
}
self.onmessage = (event: MessageEvent<WorkerMessage>) => {
  const message = event.data
  if (message.type === 'init') {
    void init(message).catch(error => self.postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : String(error),
    }))
    return
  }
  if (message.type === 'resize') {
    width = Math.max(1, message.width)
    height = Math.max(1, message.height)
    pixelRatio = Math.max(1, message.pixelRatio)
    layout()
    scheduleFrame()
    return
  }
  if (message.type === 'active') {
    active = message.active
    if (!active && frameId) {
      self.cancelAnimationFrame(frameId)
      frameId = 0
    } else scheduleFrame()
    return
  }
  if (message.type === 'motion') {
    targetPitch = clamp(message.pitch, -1, 1)
    targetRoll = clamp(message.roll, -1, 1)
    return
  }
  dispose()
  self.close()
}

export {}
