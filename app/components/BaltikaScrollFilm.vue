<script setup lang="ts">
defineProps<{
  webm: string
  mp4: string
  mobileWebm?: string
  mobileMp4?: string
  poster: string
  alt: string
}>()

const sectionEl = ref<HTMLElement | null>(null)
const videoEl = ref<HTMLVideoElement | null>(null)
const reducedMotion = ref(false)

let motionQuery: MediaQueryList | null = null
let observer: IntersectionObserver | null = null
let inView = false

function syncPlayback() {
  const video = videoEl.value
  if (!video) return

  if (reducedMotion.value || document.hidden || !inView) {
    video.pause()
    return
  }

  void video.play().catch(() => {
    // Autoplay can be declined by a browser despite muted/playsinline.
  })
}

function syncMotionPreference() {
  reducedMotion.value = motionQuery?.matches ?? false
  syncPlayback()
}

function onVisibilityChange() {
  syncPlayback()
}

onMounted(() => {
  motionQuery = reducedMotionMediaQuery()
  motionQuery.addEventListener('change', syncMotionPreference)

  observer = new IntersectionObserver(
    ([entry]) => {
      if (!entry) return
      inView = entry.isIntersecting
      syncPlayback()
    },
    { threshold: 0.15 },
  )
  if (sectionEl.value) observer.observe(sectionEl.value)

  document.addEventListener('visibilitychange', onVisibilityChange)
  syncMotionPreference()
})

onBeforeUnmount(() => {
  motionQuery?.removeEventListener('change', syncMotionPreference)
  observer?.disconnect()
  document.removeEventListener('visibilitychange', onVisibilityChange)
})
</script>

<template>
  <section ref="sectionEl" class="baltika-scroll-film">
    <video
      ref="videoEl"
      class="baltika-scroll-film__video"
      :poster="poster"
      preload="metadata"
      muted
      loop
      playsinline
      aria-hidden="true"
      data-wave-blend="multiply"
    >
      <source
        v-if="mobileWebm"
        media="(max-width: 767.98px)"
        :src="mobileWebm"
        type="video/webm"
      >
      <source
        v-if="mobileMp4"
        media="(max-width: 767.98px)"
        :src="mobileMp4"
        type="video/mp4"
      >
      <source :src="webm" type="video/webm">
      <source :src="mp4" type="video/mp4">
    </video>
    <span class="baltika-scroll-film__wash" aria-hidden="true" />
    <p class="sr-only">{{ alt }}</p>
  </section>
</template>

<style scoped>
.baltika-scroll-film {
  position: relative;
  margin: 0;
}

.baltika-scroll-film__video {
  display: block;
  width: min(100%, 68rem);
  margin-inline: auto;
  aspect-ratio: 1;
  object-fit: cover;
}

/* Some browsers promote native video to a separate plane and skip the
   element's own blend mode until the WebGL hover layer takes over. A regular
   DOM layer applies the same multiply treatment from the first frame. */
.baltika-scroll-film__wash {
  position: absolute;
  top: 0;
  left: 50%;
  display: block;
  width: min(100%, 68rem);
  height: auto;
  aspect-ratio: 1;
  pointer-events: none;
  background: var(--palette-milk, #f5f1e8);
  mix-blend-mode: multiply;
  transform: translateX(-50%);
}

/* The canvas already uses the video's multiply mode. Keeping the DOM wash
   below it would multiply the page twice while the ripple is active. */
.baltika-scroll-film__video.case-wave-media-active + .baltika-scroll-film__wash {
  display: none;
}

</style>
