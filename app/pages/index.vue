<script setup lang="ts">
import { heroToKadoPlan } from '~/utils/flowSurfaceMorph'

// The home route owns the expensive WebGL and ScrollTrigger scene. Preserve it
// across case-detail hops so route replacement only moves the existing subtree
// instead of disposing and rebuilding the whole experience on the main thread.
definePageMeta({ keepalive: true })

interface HeroExpose { surfaceSlot: HTMLElement | null }
interface KadoExpose {
  surfaceTarget: HTMLElement | null
  stoneEl: HTMLElement | null
  termTarget: HTMLElement | null
  kadoWord: HTMLElement | null
  bodyFocusEl: HTMLElement | null
}
interface CasesExpose { rootEl: HTMLElement | null; mediaEl: HTMLElement | null }
interface FormatsExpose { rootEl: HTMLElement | null; surfaceEl: HTMLElement | null }
interface AboutExpose {
  rootEl: HTMLElement | null
  surfaceEl: HTMLElement | null
  titleEl: HTMLElement | null
  contentEndEl: HTMLElement | null
}
interface ContactExpose {
  rootEl: HTMLElement | null
  surfaceEl: HTMLElement | null
  fieldsEl: HTMLElement | null
}

const hero = useTemplateRef<HeroExpose>('hero')
const kado = useTemplateRef<KadoExpose>('kado')
const cases = useTemplateRef<CasesExpose>('cases')
const formats = useTemplateRef<FormatsExpose>('formats')
const about = useTemplateRef<AboutExpose>('about')
const contact = useTemplateRef<ContactExpose>('contact')
const surfaceReady = ref(false)
const homeSurfaceReady = useState<boolean>('home-surface-ready', () => false)
const homeIntroGate = useHomeIntroGate()

function onSurfaceReady() {
  surfaceReady.value = true
  homeSurfaceReady.value = true
  homeIntroGate.markSurfaceReady()
}

const fromEl = computed(() => hero.value?.surfaceSlot ?? null)
const toEl = computed(() => kado.value?.surfaceTarget ?? null)
const stoneEl = computed(() => kado.value?.stoneEl ?? null)
const termEl = computed(() => kado.value?.termTarget ?? null)
const wordEl = computed(() => kado.value?.kadoWord ?? null)
const bodyEl = computed(() => kado.value?.bodyFocusEl ?? null)
const caseSectionEl = computed(() => cases.value?.rootEl ?? null)
const caseMediaEl = computed(() => cases.value?.mediaEl ?? null)
const formatsSectionEl = computed(() => formats.value?.rootEl ?? null)
const formatsSurfaceEl = computed(() => formats.value?.surfaceEl ?? null)
const aboutSectionEl = computed(() => about.value?.rootEl ?? null)
const aboutSurfaceEl = computed(() => about.value?.surfaceEl ?? null)
const aboutTitleEl = computed(() => about.value?.titleEl ?? null)
const aboutEndEl = computed(() => about.value?.contentEndEl ?? null)
const contactSectionEl = computed(() => contact.value?.rootEl ?? null)
const contactSurfaceEl = computed(() => contact.value?.surfaceEl ?? null)
const contactFieldsEl = computed(() => contact.value?.fieldsEl ?? null)

/**
 * Yield one frame so router paint commits, then mount the surface.
 * GSAP is pre-warmed on idle elsewhere — avoids import jank here.
 */
const mountSurface = ref(false)

onMounted(() => {
  requestAnimationFrame(() => {
    mountSurface.value = true
  })
})
</script>

<template>
  <!-- Flow Surface sits under the page content and travels through the case slot. -->
  <div class="relative isolate bg-sand text-ink">
    <div
      id="home-cases-bg-host"
      class="pointer-events-none absolute inset-0 z-[1] overflow-x-clip"
      aria-hidden="true"
    />
    <HomeIntroSurface
      :target-el="fromEl"
      :surface-ready="surfaceReady"
    />
    <LazyFlowSurfaceHost
      v-if="mountSurface"
      :from-el="fromEl"
      :to-el="toEl"
      :stone-el="stoneEl"
      :term-el="termEl"
      :word-el="wordEl"
      :body-el="bodyEl"
      :case-section-el="caseSectionEl"
      :case-media-el="caseMediaEl"
      :formats-section-el="formatsSectionEl"
      :formats-surface-el="formatsSurfaceEl"
      :about-section-el="aboutSectionEl"
      :about-surface-el="aboutSurfaceEl"
      :about-title-el="aboutTitleEl"
      :about-end-el="aboutEndEl"
      :contact-section-el="contactSectionEl"
      :contact-surface-el="contactSurfaceEl"
      :contact-fields-el="contactFieldsEl"
      :plan="heroToKadoPlan"
      @ready="onSurfaceReady"
    />
    <main class="home-page pointer-events-none relative">
      <HomeHero ref="hero" :surface-ready="surfaceReady" />
      <HomeKado ref="kado" />
      <HomeCases ref="cases" />
      <HomeFormats ref="formats" :surface-ready="surfaceReady" />
      <HomeAbout ref="about" :surface-ready="surfaceReady" />
      <HomeContact ref="contact" :surface-ready="surfaceReady" />
      <HomeFooter />
    </main>
  </div>
</template>

<style scoped>
.home-page :deep(h2) {
  text-transform: lowercase;
}

</style>
