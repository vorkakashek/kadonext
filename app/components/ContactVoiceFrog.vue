<script setup lang="ts">
const props = defineProps<{ level: number; active: boolean }>()

// Use the recorder's perceptual level; ignore quiet room noise.
const openness = computed(() => props.active
  ? Math.min(1, Math.max(0, (props.level - 0.12) / 0.5))
  : 0)

// Whole pixel rows keep the mouth consistent with the selected illustration.
const mouthRows = computed(() => openness.value > 0.08
  ? Math.ceil(openness.value * 4)
  : 0)
const mouth = computed(() => {
  const width = 198 + mouthRows.value * 66
  return { left: 627 - width / 2, right: 627 + width / 2, bottom: 590 + mouthRows.value * 66 }
})
const mouthPath = computed(() => {
  const { left, right, bottom } = mouth.value
  return `M${left + 99} 557H${right - 99}V590H${right - 33}V623H${right}V${bottom - 33}H${right - 33}V${bottom}H${left + 33}V${bottom - 33}H${left}V623H${left + 33}V590H${left + 99}Z`
})
const tonguePath = computed(() => {
  const { left, right, bottom } = mouth.value
  return `M${left + 99} ${bottom - 66}H${right - 99}V${bottom - 33}H${right - 66}V${bottom}H${left + 66}V${bottom - 33}H${left + 99}Z`
})

const eyeClipId = `voice-frog-eyes-${useId()}`
const lidHeight = computed(() => mouthRows.value * 33)
const glyphPaths = [
  'M-33-33H0V0H33V33H0V0H-33Z',
  'M-33-33H33V-11H-11V33H-33Z',
  'M-33-33H11V-11H33V33H-11V11H-33ZM-11-11V11H11V-11Z',
] as const
type VoiceGlyph = { id: number; shape: number; y: number; dx: number; dy: number; born: number }
const glyphs = ref<VoiceGlyph[]>([])
let glyphId = 0
let lastEmission = -Infinity

// Reuse microphone updates instead of adding an animation ticker or timer.
watch(() => [props.level, props.active] as const, () => {
  if (!import.meta.client) return
  if (!props.active || document.hidden) { clearGlyphs(); return }
  const now = performance.now()
  glyphs.value = glyphs.value.filter(glyph => now - glyph.born < 850)
  if (openness.value < 0.3 || now - lastEmission < 240 || glyphs.value.length >= 4) return
  lastEmission = now
  const id = glyphId++
  glyphs.value.push({
    id, shape: id % glyphPaths.length, born: now,
    y: Math.min(730, mouth.value.bottom - 33),
    dx: (id % 2 ? 1 : -1) * (180 + (id % 3) * 66),
    dy: -330 - (id % 3) * 44,
  })
})
function removeGlyph(id: number) { glyphs.value = glyphs.value.filter(glyph => glyph.id !== id) }
function clearGlyphs() { glyphs.value = []; lastEmission = -Infinity }
function onVisibilityChange() { if (document.hidden) clearGlyphs() }
onMounted(() => document.addEventListener('visibilitychange', onVisibilityChange))
onBeforeUnmount(() => { document.removeEventListener('visibilitychange', onVisibilityChange); clearGlyphs() })
</script>

<template>
  <svg class="voice-frog" viewBox="127 356 1005 571" fill="none" aria-hidden="true" focusable="false">
    <defs>
      <clipPath :id="eyeClipId">
        <path d="M359 397H519V532H485V568H323V434H359Z M743 397H905V434H940V568H777V532H743Z" />
      </clipPath>
    </defs>
    <image href="/images/contact/voice-frog-rounded.webp" width="1254" height="1254" />
    <g v-if="mouthRows" class="voice-frog__lids" :clip-path="`url(#${eyeClipId})`" shape-rendering="crispEdges">
      <rect x="323" y="397" width="617" :height="lidHeight" fill="#7daf57" />
      <rect x="323" :y="397 + lidHeight - 11" width="617" height="11" fill="#343c48" />
    </g>
    <g v-if="mouthRows" class="voice-frog__mouth" shape-rendering="crispEdges">
      <rect x="542" y="555" width="170" height="104" fill="#7daf57" />
      <path :d="mouthPath" fill="#343c48" />
      <path v-if="mouthRows > 1" :d="tonguePath" fill="#ff8b91" />
    </g>
    <g v-for="glyph in glyphs" :key="glyph.id" :transform="`translate(627 ${glyph.y})`" class="voice-frog__particle">
      <g class="voice-frog__glyph" :style="{ '--drift-x': `${glyph.dx}px`, '--drift-y': `${glyph.dy}px` }" @animationend="removeGlyph(glyph.id)">
        <path :d="glyphPaths[glyph.shape]" fill-rule="evenodd" shape-rendering="crispEdges" />
      </g>
    </g>
  </svg>
</template>

<style scoped>
/* Match the timer's visible numeral height, without transparent image margins. */
.voice-frog { display: block; width: auto; height: 0.75em; height: 1cap; aspect-ratio: 1005 / 571; flex: none; overflow: visible; pointer-events: none; }
.voice-frog__glyph { fill: #343c48; opacity: 0; animation: voice-frog-glyph 0.85s ease-out both; }
@keyframes voice-frog-glyph {
  0% { opacity: 0; transform: translate(0, 0) scale(0.65); }
  15% { opacity: 0.8; }
  65% { opacity: 0.65; }
  100% { opacity: 0; transform: translate(var(--drift-x), var(--drift-y)) scale(1); }
}
@media (prefers-reduced-motion: reduce) {
  .voice-frog__mouth, .voice-frog__lids, .voice-frog__particle { display: none; }
  .voice-frog__glyph { animation: none; }
}
</style>
