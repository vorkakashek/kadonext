import * as THREE from 'three'

/** Cheap value noise for a blobby “liquid” morph target. */
function hash3(x: number, y: number, z: number) {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453
  return s - Math.floor(s)
}

function noise3(x: number, y: number, z: number) {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const zi = Math.floor(z)
  const xf = x - xi
  const yf = y - yi
  const zf = z - zi
  const u = xf * xf * (3 - 2 * xf)
  const v = yf * yf * (3 - 2 * yf)
  const w = zf * zf * (3 - 2 * zf)

  const n000 = hash3(xi, yi, zi)
  const n100 = hash3(xi + 1, yi, zi)
  const n010 = hash3(xi, yi + 1, zi)
  const n110 = hash3(xi + 1, yi + 1, zi)
  const n001 = hash3(xi, yi, zi + 1)
  const n101 = hash3(xi + 1, yi, zi + 1)
  const n011 = hash3(xi, yi + 1, zi + 1)
  const n111 = hash3(xi + 1, yi + 1, zi + 1)

  const x00 = n000 * (1 - u) + n100 * u
  const x10 = n010 * (1 - u) + n110 * u
  const x01 = n001 * (1 - u) + n101 * u
  const x11 = n011 * (1 - u) + n111 * u
  const y0 = x00 * (1 - v) + x10 * v
  const y1 = x01 * (1 - v) + x11 * v
  return y0 * (1 - w) + y1 * w
}

function projectToCube(x: number, y: number, z: number, concave = 0.22) {
  const ax = Math.abs(x)
  const ay = Math.abs(y)
  const az = Math.abs(z)
  const max = Math.max(ax, ay, az) || 1
  let cx = x / max
  let cy = y / max
  let cz = z / max

  // Pull face centers inward for the “unusual cube” look
  const faceX = 1 - Math.min(Math.abs(cy), Math.abs(cz))
  const faceY = 1 - Math.min(Math.abs(cx), Math.abs(cz))
  const faceZ = 1 - Math.min(Math.abs(cx), Math.abs(cy))
  const pull =
    Math.max(ax, ay, az) === ax
      ? faceX * faceX
      : Math.max(ax, ay, az) === ay
        ? faceY * faceY
        : faceZ * faceZ

  const s = 1 - concave * pull
  return new THREE.Vector3(cx * s, cy * s, cz * s)
}

function projectToLiquid(x: number, y: number, z: number) {
  const len = Math.hypot(x, y, z) || 1
  const nx = x / len
  const ny = y / len
  const nz = z / len

  // Metaball-ish: primary body + secondary lobe
  const n =
    noise3(nx * 2.4, ny * 2.4, nz * 2.4) * 0.55 +
    noise3(nx * 5.1 + 10, ny * 5.1, nz * 5.1) * 0.25

  const lobe = Math.exp(-((nx - 0.55) ** 2 + (ny + 0.2) ** 2 + nz ** 2) * 3.2)
  const radius = 0.78 + n * 0.28 + lobe * 0.42

  return new THREE.Vector3(nx * radius, ny * radius, nz * radius)
}

/**
 * One shared topology (sphere) with morph targets:
 * 0 = concave cube, 1 = liquid blob. Base positions = sphere.
 * All targets normalized to the same bounding radius so nothing clips harder than others.
 */
export function createHeroMorphGeometry(segments = 96) {
  const geometry = new THREE.SphereGeometry(1, segments, segments)
  const position = geometry.attributes.position as THREE.BufferAttribute
  const count = position.count

  const sphere = new Float32Array(count * 3)
  const cube = new Float32Array(count * 3)
  const liquid = new Float32Array(count * 3)
  const v = new THREE.Vector3()

  for (let i = 0; i < count; i++) {
    v.fromBufferAttribute(position, i)
    const len = v.length() || 1
    v.multiplyScalar(1 / len)

    sphere[i * 3] = v.x
    sphere[i * 3 + 1] = v.y
    sphere[i * 3 + 2] = v.z

    const c = projectToCube(v.x, v.y, v.z)
    cube[i * 3] = c.x
    cube[i * 3 + 1] = c.y
    cube[i * 3 + 2] = c.z

    const l = projectToLiquid(v.x, v.y, v.z)
    liquid[i * 3] = l.x
    liquid[i * 3 + 1] = l.y
    liquid[i * 3 + 2] = l.z
  }

  normalizePositionsToRadius(sphere, 1)
  normalizePositionsToRadius(cube, 1)
  normalizePositionsToRadius(liquid, 1)

  geometry.setAttribute('position', new THREE.Float32BufferAttribute(sphere, 3))
  geometry.morphAttributes.position = [
    new THREE.Float32BufferAttribute(cube, 3),
    new THREE.Float32BufferAttribute(liquid, 3),
  ]
  geometry.computeVertexNormals()

  return geometry
}

function normalizePositionsToRadius(positions: Float32Array, radius: number) {
  let maxLen = 0
  for (let i = 0; i < positions.length; i += 3) {
    const len = Math.hypot(positions[i]!, positions[i + 1]!, positions[i + 2]!)
    if (len > maxLen) maxLen = len
  }
  if (maxLen < 1e-6) return
  const scale = radius / maxLen
  for (let i = 0; i < positions.length; i++) positions[i] = positions[i]! * scale
}

/** Morph weights for sphere / cube / liquid (sum of cube+liquid influences vs base). */
export type HeroMorphShape = 'sphere' | 'cube' | 'liquid'

export function morphWeightsFor(shape: HeroMorphShape): [number, number] {
  switch (shape) {
    case 'cube':
      return [1, 0]
    case 'liquid':
      return [0, 1]
    default:
      return [0, 0]
  }
}
