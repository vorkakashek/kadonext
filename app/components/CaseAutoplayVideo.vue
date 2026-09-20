<script setup lang="ts">
const props = defineProps<{
  src: string
  mobileSrc?: string
  alt: string
  poster?: string
  mobilePoster?: string
  width?: number
  height?: number
}>()

const videoEl = ref<HTMLVideoElement | null>(null)
const rootEl = ref<HTMLElement | null>(null)
const reducedMotion = ref(false)
const responsivePosterVisible = ref(!!props.poster && !!props.mobilePoster)
const useMobileSource = ref(false)
const activeSrc = computed(() => useMobileSource.value && props.mobileSrc ? props.mobileSrc : props.src)
const { motionActive } = useCaseDetailExperience()

let motionQuery: MediaQueryList | null = null
let sourceQuery: MediaQueryList | null = null
let observer: IntersectionObserver | null = null
let inView = false

function syncPlayback() {
  const video = videoEl.value
  if (!video) return

  if (reducedMotion.value || !motionActive.value || !inView) {
    video.pause()
    return
  }

  void video.play().catch(() => {
    // Browsers may decline muted autoplay despite the required attributes.
  })
}

function syncMotionPreference() {
  reducedMotion.value = motionQuery?.matches ?? false
  syncPlayback()
}

function hideResponsivePoster() {
  responsivePosterVisible.value = false
}

async function syncVideoSource() {
  const nextUseMobileSource = !!sourceQuery?.matches && !!props.mobileSrc
  if (useMobileSource.value === nextUseMobileSource) return

  useMobileSource.value = nextUseMobileSource
  responsivePosterVisible.value = !!props.poster && !!props.mobilePoster
  await nextTick()
  videoEl.value?.load()
  syncPlayback()
}

onMounted(() => {
  // Keep the hydration render identical to SSR. The server cannot know the
  // viewport width, so responsive source selection starts after hydration.
  sourceQuery = window.matchMedia('(max-width: 767.98px)')
  sourceQuery.addEventListener('change', syncVideoSource)
  void syncVideoSource()

  motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
  motionQuery.addEventListener('change', syncMotionPreference)

  observer = new IntersectionObserver(([entry]) => {
    inView = entry?.isIntersecting ?? false
    syncPlayback()
  }, { threshold: 0.15 })
  if (rootEl.value) observer.observe(rootEl.value)

  syncMotionPreference()
})

watch(motionActive, syncPlayback)

onBeforeUnmount(() => {
  motionQuery?.removeEventListener('change', syncMotionPreference)
  sourceQuery?.removeEventListener('change', syncVideoSource)
  observer?.disconnect()
})
</script>

<template>
  <figure ref="rootEl" class="case-autoplay-video">
    <picture
      v-if="poster && mobilePoster && responsivePosterVisible"
      class="case-autoplay-video__poster"
    >
      <source :srcset="mobilePoster" type="image/webp" media="(max-width: 767.98px)">
      <img :src="poster" alt="" aria-hidden="true" :width="width" :height="height" decoding="async">
    </picture>
    <video
      :key="activeSrc"
      ref="videoEl"
      :poster="mobilePoster ? undefined : poster"
      preload="metadata"
      muted
      loop
      playsinline
      aria-hidden="true"
      @playing="hideResponsivePoster"
      :src="activeSrc"
    />
    <figcaption class="sr-only">{{ alt }}</figcaption>
  </figure>
</template>

<style scoped>
.case-autoplay-video {
  position: relative;
  margin: 0;
}

.case-autoplay-video__poster {
  position: absolute;
  z-index: 1;
  inset: 0;
}

.case-autoplay-video__poster img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.case-autoplay-video video {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
</style>
