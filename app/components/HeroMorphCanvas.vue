<script setup lang="ts">
/**
 * Shelf prototype (parked): one mesh morphing cube ↔ sphere ↔ liquid.
 * Not mounted in HomeHero while HeroSwarmCanvas is active — keep for a possible return.
 * Single matte material — no material switching yet.
 */
import * as THREE from 'three'
import {
  createHeroMorphGeometry,
  morphWeightsFor,
  type HeroMorphShape,
} from '~/utils/heroMorphGeometry'

const canvasHost = ref<HTMLElement | null>(null)

const CYCLE = ['cube', 'sphere', 'liquid'] as const satisfies readonly HeroMorphShape[]
const HOLD_MS = 1400
const MORPH_MS = 1600

let renderer: THREE.WebGLRenderer | null = null
let animationId = 0
let resizeObserver: ResizeObserver | null = null
let geometry: THREE.BufferGeometry | null = null
let material: THREE.Material | null = null

onMounted(() => {
  const host = canvasHost.value
  if (!host) return


  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 40)
  const cameraOffset = new THREE.Vector3(1.55, 0.95, 2.15)
  camera.position.copy(cameraOffset)
  camera.lookAt(0, 0, 0)

  renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance',
  })
  renderer.setClearColor(0x000000, 0)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  host.appendChild(renderer.domElement)

  geometry = createHeroMorphGeometry(96)
  material = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#2a2a28'),
    roughness: 0.72,
    metalness: 0.08,
    flatShading: false,
  })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.morphTargetInfluences = [1, 0] // start as concave cube
  scene.add(mesh)

  const key = new THREE.DirectionalLight(0xffffff, 2.1)
  key.position.set(3.2, 4.5, 2.4)
  scene.add(key)

  const fill = new THREE.DirectionalLight(0xffffff, 0.55)
  fill.position.set(-2.8, 0.6, -1.5)
  scene.add(fill)

  scene.add(new THREE.AmbientLight(0xffffff, 0.35))

  /** Fit unit-radius morph so every shape stays fully inside the canvas. */
  const frameObject = () => {
    const { clientWidth: w, clientHeight: h } = host
    if (w < 2 || h < 2 || !renderer) return

    renderer.setSize(w, h, false)
    camera.aspect = w / h

    const radius = 1
    const padding = 1.28
    const fov = THREE.MathUtils.degToRad(camera.fov)
    const fitHeight = radius * padding / Math.sin(fov / 2)
    const fitWidth = fitHeight / camera.aspect
    const distance = Math.max(fitHeight, fitWidth)

    camera.position.copy(cameraOffset).setLength(distance)
    camera.near = distance / 100
    camera.far = distance * 100
    camera.lookAt(0, 0, 0)
    camera.updateProjectionMatrix()
  }

  frameObject()
  resizeObserver = new ResizeObserver(frameObject)
  resizeObserver.observe(host)

  let shapeIndex = 0
  let fromWeights = morphWeightsFor(CYCLE[0]!)
  let toWeights = morphWeightsFor(CYCLE[0]!)
  let phase: 'hold' | 'morph' = 'hold'
  let phaseStart = performance.now()

  const easeInOut = (t: number) =>
    t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2

  const tick = (now: number) => {
    animationId = requestAnimationFrame(tick)
    if (!renderer) return

    mesh.rotation.y = now * 0.00018
    mesh.rotation.x = Math.sin(now * 0.00011) * 0.12

    if (mesh.morphTargetInfluences) {
      const elapsed = now - phaseStart

      if (phase === 'hold') {
        if (elapsed >= HOLD_MS) {
          phase = 'morph'
          phaseStart = now
          fromWeights = morphWeightsFor(CYCLE[shapeIndex]!)
          shapeIndex = (shapeIndex + 1) % CYCLE.length
          toWeights = morphWeightsFor(CYCLE[shapeIndex]!)
        }
      } else {
        const t = Math.min(1, elapsed / MORPH_MS)
        const e = easeInOut(t)
        mesh.morphTargetInfluences[0] =
          fromWeights[0] + (toWeights[0] - fromWeights[0]) * e
        mesh.morphTargetInfluences[1] =
          fromWeights[1] + (toWeights[1] - fromWeights[1]) * e

        if (t >= 1) {
          phase = 'hold'
          phaseStart = now
        }
      }
    }

    renderer.render(scene, camera)
  }

  animationId = requestAnimationFrame(tick)
})

onUnmounted(() => {
  cancelAnimationFrame(animationId)
  resizeObserver?.disconnect()
  geometry?.dispose()
  material?.dispose()
  if (renderer) {
    renderer.dispose()
    renderer.domElement.remove()
    renderer = null
  }
})
</script>

<template>
  <div
    ref="canvasHost"
    class="hero-morph size-full"
    aria-hidden="true"
  />
</template>

<style scoped>
.hero-morph :deep(canvas) {
  display: block;
  width: 100%;
  height: 100%;
}
</style>
