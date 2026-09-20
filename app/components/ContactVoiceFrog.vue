<script setup lang="ts">
const props = withDefaults(defineProps<{
  level?: number
  active?: boolean
  celebrating?: boolean
  entering?: boolean
  flightFrame?: boolean
}>(), {
  level: 0,
  active: false,
  celebrating: false,
  entering: false,
  flightFrame: false,
})

// Use the recorder's perceptual level; ignore quiet room noise.
const celebrationTalking = ref(false)
const openness = computed(() => celebrationTalking.value
  ? 0.72
  : props.active
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
// Keep the celebration expression friendly: blink/squint only in flight,
// then reveal the original wide-open eyes before the frog starts talking.
const lidHeight = computed(() => props.entering
  ? 66
  : props.celebrating
    ? 0
    : mouthRows.value * 33)
const glyphPaths = [
  'M-33-33H0V0H33V33H0V0H-33Z',
  'M-33-33H33V-11H-11V33H-33Z',
  'M-33-33H11V-11H33V33H-11V11H-33ZM-11-11V11H11V-11Z',
] as const
type VoiceGlyph = { id: number; shape: number; y: number; dx: number; dy: number; born: number }
const glyphs = ref<VoiceGlyph[]>([])
let glyphId = 0
let lastEmission = -Infinity
let celebrationGlyphTimer = 0

const CELEBRATION_GLYPH_MS = 380

function emitGlyph(force = false) {
  const now = performance.now()
  glyphs.value = glyphs.value.filter(glyph => now - glyph.born < 850)
  if ((!force && (openness.value < 0.3 || now - lastEmission < 240)) || glyphs.value.length >= 4) return
  lastEmission = now
  const id = glyphId++
  glyphs.value.push({
    id, shape: id % glyphPaths.length, born: now,
    y: Math.min(730, mouth.value.bottom - 33),
    dx: (id % 2 ? 1 : -1) * (180 + (id % 3) * 66),
    dy: -330 - (id % 3) * 44,
  })
}

function stopCelebration() {
  if (celebrationGlyphTimer) window.clearTimeout(celebrationGlyphTimer)
  celebrationGlyphTimer = 0
  celebrationTalking.value = false
}

function scheduleCelebrationGlyph() {
  celebrationGlyphTimer = window.setTimeout(() => {
    celebrationGlyphTimer = 0
    if (!props.celebrating || document.hidden || !celebrationTalking.value) return
    emitGlyph(true)
    scheduleCelebrationGlyph()
  }, CELEBRATION_GLYPH_MS)
}

function startCelebration() {
  if (!import.meta.client || document.hidden || props.entering) return
  stopCelebration()
  clearGlyphs()
  celebrationTalking.value = true
  emitGlyph(true)
  scheduleCelebrationGlyph()
}

// Reuse microphone updates instead of adding an animation ticker or timer.
watch(() => [props.level, props.active] as const, () => {
  if (!import.meta.client) return
  if (!props.active || document.hidden) { clearGlyphs(); return }
  emitGlyph()
})
watch(() => [props.celebrating, props.entering] as const, ([celebrating, entering]) => {
  stopCelebration()
  clearGlyphs()
  if (celebrating && !entering) startCelebration()
})
function removeGlyph(id: number) { glyphs.value = glyphs.value.filter(glyph => glyph.id !== id) }
function clearGlyphs() { glyphs.value = []; lastEmission = -Infinity }
function onVisibilityChange() {
  if (document.hidden) {
    stopCelebration()
    clearGlyphs()
  } else if (props.celebrating && !props.entering) {
    startCelebration()
  }
}
onMounted(() => {
  document.addEventListener('visibilitychange', onVisibilityChange)
  if (props.celebrating && !props.entering) startCelebration()
})
onBeforeUnmount(() => {
  document.removeEventListener('visibilitychange', onVisibilityChange)
  stopCelebration()
  clearGlyphs()
})
</script>

<template>
  <svg class="voice-frog" :class="{ 'is-celebrating': celebrating, 'is-talking': celebrationTalking }" viewBox="127 356 1005 571" fill="none" aria-hidden="true" focusable="false">
    <defs>
      <clipPath :id="eyeClipId">
        <path d="M359 397H519V532H485V568H323V434H359Z M743 397H905V434H940V568H777V532H743Z" />
      </clipPath>
    </defs>
    <g v-if="flightFrame" class="voice-frog__jump-legs" shape-rendering="crispEdges">
      <path d="M360 760H520V850H553V1015H520V1048H454V1015H421V850H360Z" fill="#343c48" />
      <path d="M397 760H487V866H520V982H487V1015H454V982H454V866H397Z" fill="#7daf57" />
      <path d="M734 760H894V850H861V1015H828V1048H762V1015H729V850H734Z" fill="#343c48" />
      <path d="M767 760H857V866H824V982H800V1015H767V982H734V866H767Z" fill="#7daf57" />
    </g>
    <image href="/images/contact/voice-frog-rounded.webp" width="1254" height="1254" />
    <g v-if="lidHeight > 0" class="voice-frog__lids" :clip-path="`url(#${eyeClipId})`" shape-rendering="crispEdges">
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
.voice-frog__jump-legs {
  opacity: 1;
}
.voice-frog.is-talking .voice-frog__mouth {
  transform-box: fill-box;
  transform-origin: center top;
  animation: voice-frog-talk-mouth 0.36s steps(1, end) infinite;
}
@keyframes voice-frog-glyph {
  0% { opacity: 0; transform: translate(0, 0) scale(0.65); }
  15% { opacity: 0.8; }
  65% { opacity: 0.65; }
  100% { opacity: 0; transform: translate(var(--drift-x), var(--drift-y)) scale(1); }
}
@keyframes voice-frog-talk-mouth {
  0%, 100% { transform: scaleY(0.36); }
  50% { transform: scaleY(1); }
}
@media (prefers-reduced-motion: reduce) {
  .voice-frog__mouth, .voice-frog__lids, .voice-frog__particle, .voice-frog__jump-legs { display: none; }
  .voice-frog__glyph { animation: none; }
}
</style>
