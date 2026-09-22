<script setup lang="ts">
import { homeCaseDetailPath, type HomeCase } from '~/utils/homeCases'
import { warmCaseDetailRoute } from '~/utils/caseDetailRouteWarmup'

const { openCaseDetail } = useCaseDetailTransition()
const { t } = useI18n()
const localePath = useLocalePath()
const homeCases = useHomeCases()
const projectsCatalogTitle = computed(() => t('projects.catalog.title'))
const { pageIrisLive } = usePageCanvas()
const projectsCatalogEl = ref<HTMLElement | null>(null)
const projectsHeaderEl = ref<HTMLElement | null>(null)
const projectsSurfaceEl = ref<HTMLElement | null>(null)
const projectsGridEl = ref<HTMLElement | null>(null)

let catalogRevealCtx: { revert: () => void } | null = null
let initialRevealTimelines: Array<{ play: () => unknown }> = []
let initialRevealPlayed = false

const pageRevealReady = computed(() => (
  !pageIrisLive.value
))

function playInitialCardReveal() {
  if (!pageRevealReady.value || initialRevealPlayed || !initialRevealTimelines.length) return
  initialRevealPlayed = true
  requestAnimationFrame(() => {
    initialRevealTimelines.forEach(timeline => timeline.play())
  })
}

watch(pageRevealReady, (ready) => {
  if (ready) playInitialCardReveal()
}, { flush: 'post' })

async function setupCatalogRevealMotion() {
  const catalog = projectsCatalogEl.value
  const header = projectsHeaderEl.value
  const surface = projectsSurfaceEl.value
  const grid = projectsGridEl.value
  if (!catalog || !header || !surface || !grid) return

  const [{ default: gsap }, { ScrollTrigger }] = await Promise.all([
    import('gsap'),
    import('gsap/ScrollTrigger'),
  ])
  if (!grid.isConnected) return

  gsap.registerPlugin(ScrollTrigger)
  catalogRevealCtx?.revert()
  initialRevealTimelines = []
  initialRevealPlayed = false
  catalogRevealCtx = gsap.context(() => {
    const cards = Array.from(grid.querySelectorAll<HTMLElement>('.projects-card'))
    const headerTitleChars = Array.from(header.querySelectorAll<HTMLElement>('.projects-catalog__title-char'))
    const headerDetails = Array.from(header.querySelectorAll<HTMLElement>('.projects-catalog__header-motion'))
    const reduced = prefersReducedMotion()
    const firstRowCount = window.matchMedia('(min-width: 768px)').matches
      ? Math.min(3, cards.length)
      : Math.min(1, cards.length)

    if (reduced) {
      gsap.set([...headerTitleChars, ...headerDetails], { clearProps: 'transform' })
    } else {
      gsap.set([...headerTitleChars, ...headerDetails], { yPercent: 115 })
      const headerTimeline = gsap.timeline({
        paused: true,
        defaults: { ease: 'power3.out' },
      })
      if (headerTitleChars.length) {
        headerTimeline.to(headerTitleChars, {
          yPercent: 0,
          duration: 1.1,
          stagger: 0.055,
          ease: 'power4.out',
        }, 0)
      }
      if (headerDetails.length) {
        headerTimeline.to(headerDetails, {
          yPercent: 0,
          duration: 0.82,
          stagger: 0.04,
        }, 0.24)
      }
      initialRevealTimelines.push(headerTimeline)
    }

    cards.forEach((card, index) => {
      const image = card.querySelector<HTMLImageElement>('.projects-card__cover img')
      const titleChars = Array.from(card.querySelectorAll<HTMLElement>('.projects-card__title-char'))
      const details = Array.from(card.querySelectorAll<HTMLElement>('.projects-card__detail-motion'))
      if (!image) return

      if (reduced) {
        gsap.set(image, { clearProps: 'clip-path' })
        gsap.set([...titleChars, ...details], { clearProps: 'transform' })
        return
      }

      gsap.set(image, { clipPath: 'inset(0 100% 0 0)' })
      gsap.set([...titleChars, ...details], { yPercent: 115 })

      const initialRow = index < firstRowCount
      const tl = gsap.timeline({
        paused: initialRow,
        delay: initialRow ? index * 0.08 : 0,
        defaults: { ease: 'power3.out' },
        ...(!initialRow
          ? {
              scrollTrigger: {
                trigger: card,
                start: 'top 88%',
                toggleActions: 'play none none reverse',
              },
            }
          : {}),
      })

      if (initialRow) initialRevealTimelines.push(tl)

      tl.to(image, {
        clipPath: 'inset(0 0% 0 0)',
        duration: 0.75,
        ease: 'power2.out',
      }, 0)
      if (titleChars.length) {
        tl.to(titleChars, {
          yPercent: 0,
          duration: 1.1,
          stagger: 0.055,
          ease: 'power4.out',
        }, 0.08)
      }
      if (details.length) {
        tl.to(details, {
          yPercent: 0,
          duration: 0.82,
          stagger: 0.04,
        }, 0.24)
      }
    })

    if (!reduced) {
      const surfaceParallaxDistance = () => Math.min(
        header.offsetHeight * (window.matchMedia('(max-width: 767px)').matches ? 1.35 : 1.05),
        document.documentElement.clientHeight * (window.matchMedia('(max-width: 767px)').matches ? 0.58 : 0.48),
      ) * 1.1
      const parallaxTimeline = gsap.timeline({
        scrollTrigger: {
          trigger: catalog,
          start: 'top top',
          end: () => `+=${Math.max(header.offsetHeight * 1.35, document.documentElement.clientHeight * 0.7)}`,
          scrub: 0.7,
          invalidateOnRefresh: true,
        },
      })
      parallaxTimeline
        .to(surface, {
          y: () => -surfaceParallaxDistance(),
          ease: 'none',
        }, 0)
    }
  }, grid)

  playInitialCardReveal()
  requestAnimationFrame(() => ScrollTrigger.refresh())
}

type ProjectCardMotion = {
  image: HTMLImageElement
  rect: DOMRect
  x: number
  y: number
  scale: number
  targetX: number
  targetY: number
  targetScale: number
  positionBlend: number
  hovering: boolean
  frame: number
  lastFrameAt: number
}

const projectCardMotions = new Map<HTMLElement, ProjectCardMotion>()
const PROJECT_CARD_HOVER_SCALE = 1.075
const PROJECT_CARD_ZOOM_IN_MS = 400
const PROJECT_CARD_POSITION_BLEND_IN_MS = 1800

function projectCardMotionEnabled(event: PointerEvent) {
  return event.pointerType !== 'touch'
    && window.matchMedia('(hover: hover) and (pointer: fine)').matches
    && !prefersReducedMotion()
}

function animateProjectCard(card: HTMLElement, motion: ProjectCardMotion, now: number) {
  const positionEase = 0.07
  const elapsed = motion.lastFrameAt > 0
    ? Math.min(now - motion.lastFrameAt, 50)
    : 1000 / 60
  motion.lastFrameAt = now
  if (motion.hovering) {
    motion.positionBlend = Math.min(1, motion.positionBlend + elapsed / PROJECT_CARD_POSITION_BLEND_IN_MS)
  }
  const positionBlend = motion.positionBlend * motion.positionBlend * (3 - 2 * motion.positionBlend)
  const effectiveTargetX = motion.targetX * positionBlend
  const effectiveTargetY = motion.targetY * positionBlend
  motion.x += (effectiveTargetX - motion.x) * positionEase
  motion.y += (effectiveTargetY - motion.y) * positionEase
  if (motion.targetScale > motion.scale) {
    const linearStep = (PROJECT_CARD_HOVER_SCALE - 1) * elapsed / PROJECT_CARD_ZOOM_IN_MS
    motion.scale = Math.min(motion.targetScale, motion.scale + linearStep)
  } else {
    motion.scale += (motion.targetScale - motion.scale) * 0.085
  }

  motion.image.style.transform = `translate3d(${motion.x.toFixed(3)}%, ${motion.y.toFixed(3)}%, 0) scale(${motion.scale.toFixed(4)})`

  const settled = Math.abs(effectiveTargetX - motion.x) < 0.01
    && Math.abs(effectiveTargetY - motion.y) < 0.01
    && Math.abs(motion.targetScale - motion.scale) < 0.0005

  if (settled) {
    motion.x = effectiveTargetX
    motion.y = effectiveTargetY
    motion.scale = motion.targetScale
    motion.frame = 0
    motion.lastFrameAt = 0
    if (motion.targetScale === 1) {
      motion.image.style.removeProperty('transform')
      motion.image.style.removeProperty('will-change')
      projectCardMotions.delete(card)
    }
    return
  }

  motion.frame = requestAnimationFrame(now => animateProjectCard(card, motion, now))
}

function scheduleProjectCardMotion(card: HTMLElement, motion: ProjectCardMotion) {
  if (motion.frame) return
  motion.image.style.willChange = 'transform'
  motion.lastFrameAt = 0
  motion.frame = requestAnimationFrame(now => animateProjectCard(card, motion, now))
}

function updateProjectCardMotion(event: PointerEvent, entering = false) {
  if (!projectCardMotionEnabled(event)) return
  const card = event.currentTarget as HTMLElement | null
  if (!card) return

  let motion = projectCardMotions.get(card)
  if (!motion) {
    const cover = card.querySelector<HTMLElement>('.projects-card__cover')
    const image = cover?.querySelector<HTMLImageElement>('img')
    if (!cover || !image) return
    motion = {
      image,
      rect: cover.getBoundingClientRect(),
      x: 0,
      y: 0,
      scale: 1,
      targetX: 0,
      targetY: 0,
      targetScale: PROJECT_CARD_HOVER_SCALE,
      positionBlend: 0,
      hovering: true,
      frame: 0,
      lastFrameAt: 0,
    }
    projectCardMotions.set(card, motion)
  }

  if (entering) {
    motion.positionBlend = 0
    motion.hovering = true
  }

  const halfWidth = Math.max(motion.rect.width * 0.5, 1)
  const halfHeight = Math.max(motion.rect.height * 0.5, 1)
  const normalizedX = Math.max(-1, Math.min(1, (event.clientX - motion.rect.left - halfWidth) / halfWidth))
  const normalizedY = Math.max(-1, Math.min(1, (event.clientY - motion.rect.top - halfHeight) / halfHeight))
  motion.targetX = normalizedX * -2.88
  motion.targetY = normalizedY * -2.88
  motion.targetScale = PROJECT_CARD_HOVER_SCALE
  scheduleProjectCardMotion(card, motion)
}

function onProjectCardPointerEnter(item: HomeCase, event: PointerEvent) {
  warmCaseDetail(item)
  updateProjectCardMotion(event, true)
}

function onProjectCardPointerLeave(event: PointerEvent) {
  const card = event.currentTarget as HTMLElement | null
  const motion = card ? projectCardMotions.get(card) : undefined
  if (!card || !motion) return
  motion.targetX = 0
  motion.targetY = 0
  motion.targetScale = 1
  motion.hovering = false
  scheduleProjectCardMotion(card, motion)
}

function warmCaseDetail(item: HomeCase) {
  void warmCaseDetailRoute(localePath(homeCaseDetailPath(item)))
}

onMounted(() => {
  // Reaching the project catalog is already a strong navigation signal. Warm
  // the shared detail route immediately; all cards resolve through [id].vue.
  const firstCase = homeCases.value[0]
  if (firstCase) warmCaseDetail(firstCase)
  void setupCatalogRevealMotion()
})

onUnmounted(() => {
  catalogRevealCtx?.revert()
  catalogRevealCtx = null
  initialRevealTimelines = []
  initialRevealPlayed = false
  projectCardMotions.forEach((motion) => {
    if (motion.frame) cancelAnimationFrame(motion.frame)
    motion.image.style.removeProperty('transform')
    motion.image.style.removeProperty('will-change')
  })
  projectCardMotions.clear()
})

function openCase(item: HomeCase, event: MouseEvent) {
  const card = event.currentTarget as HTMLElement | null
  const cover = card?.querySelector<HTMLElement>('[data-case-cover]')
  const rect = cover?.getBoundingClientRect()
  if (!rect || rect.width < 2 || rect.height < 2) return
  const paintedImage = cover?.querySelector<HTMLImageElement>('img')
  const imageRect = paintedImage?.getBoundingClientRect()
  const imageFilter = paintedImage ? getComputedStyle(paintedImage).filter : undefined

  // Pointer leave fires as soon as the fixed transition layer takes ownership.
  // Freeze the source image first so its catalog-only hover loop cannot move
  // between the geometry snapshot above and the proxy's first painted frame.
  const cardMotion = card ? projectCardMotions.get(card) : undefined
  if (cardMotion?.frame) {
    cancelAnimationFrame(cardMotion.frame)
    cardMotion.frame = 0
    cardMotion.lastFrameAt = 0
  }
  event.preventDefault()
  openCaseDetail({
    to: localePath(homeCaseDetailPath(item)), origin: 'projects', src: item.media.src,
    proxySrc: paintedImage?.currentSrc || undefined,
    webpSrcset: item.media.webpSrcset, avifSrcset: item.media.avifSrcset,
    mobileSrc: item.media.mobileSrc,
    mobileWebpSrcset: item.media.mobileWebpSrcset,
    mobileAvifSrcset: item.media.mobileAvifSrcset,
    alt: item.media.alt, wash: item.wash,
    rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
    imageRect: imageRect
      ? { top: imageRect.top, left: imageRect.left, width: imageRect.width, height: imageRect.height }
      : undefined,
    imageFilter,
  })
}
</script>

<template>
  <main ref="projectsCatalogEl" class="projects-catalog">
    <div class="projects-catalog__inner">
      <header ref="projectsHeaderEl" class="projects-catalog__header">
        <h1 class="projects-catalog__title" :aria-label="projectsCatalogTitle">
          <span class="sr-only">{{ projectsCatalogTitle }}</span>
          <span
            v-for="(char, index) in projectsCatalogTitle"
            :key="`${char}-${index}`"
            class="projects-catalog__title-char"
            aria-hidden="true"
          >{{ char }}</span>
        </h1>
        <p class="projects-catalog__count" :aria-label="String(homeCases.length)">
          <span class="projects-catalog__header-motion" aria-hidden="true">{{ homeCases.length }}</span>
        </p>
      </header>
    </div>
    <div ref="projectsSurfaceEl" class="projects-catalog__surface">
      <ul ref="projectsGridEl" class="projects-catalog__grid">
        <li v-for="(item, index) in homeCases" :key="item.id">
          <a
            :href="localePath(homeCaseDetailPath(item))"
            class="projects-card"
            @pointerenter="onProjectCardPointerEnter(item, $event)"
            @pointermove="updateProjectCardMotion"
            @pointerleave="onProjectCardPointerLeave"
            @focus="warmCaseDetail(item)"
            @pointerdown="warmCaseDetail(item)"
            @click="openCase(item, $event)"
          >
            <div class="projects-card__cover" :data-case-cover="item.media.src">
              <picture>
                <source v-if="item.media.mobileAvifSrcset" media="(max-width: 767.98px)" type="image/avif" :srcset="item.media.mobileAvifSrcset" sizes="100vw">
                <source v-if="item.media.mobileWebpSrcset" media="(max-width: 767.98px)" type="image/webp" :srcset="item.media.mobileWebpSrcset" sizes="100vw">
                <source v-if="item.media.mobileSrc" media="(max-width: 767.98px)" :srcset="item.media.mobileSrc">
                <source v-if="item.media.avifSrcset" type="image/avif" :srcset="item.media.avifSrcset" sizes="(max-width: 767px) 100vw, 33vw">
                <source v-if="item.media.webpSrcset" type="image/webp" :srcset="item.media.webpSrcset" sizes="(max-width: 767px) 100vw, 33vw">
                <img
                  :src="item.media.src"
                  :alt="item.media.alt"
                  :width="item.media.width"
                  :height="item.media.height"
                  :loading="index === 0 ? 'eager' : 'lazy'"
                  :fetchpriority="index === 0 ? 'high' : 'auto'"
                  decoding="async"
                >
              </picture>
            </div>
            <div class="projects-card__meta">
              <span class="projects-card__detail-mask">
                <span class="projects-card__number projects-card__detail-motion">{{ String(index + 1).padStart(3, '0') }}</span>
              </span>
              <span class="projects-card__title" :aria-label="item.title">
                <span class="sr-only">{{ item.title }}</span>
                <span
                  v-for="(char, titleIndex) in item.title"
                  :key="`${char}-${titleIndex}`"
                  class="projects-card__title-mask"
                  aria-hidden="true"
                ><span class="projects-card__title-char">{{ char === ' ' ? '\u00a0' : char }}</span></span>
              </span>
              <span class="projects-card__detail-mask projects-card__year-mask">
                <span class="projects-card__year projects-card__detail-motion">{{ item.year }}</span>
              </span>
            </div>
          </a>
        </li>
      </ul>
    </div>
  </main>
</template>

<style scoped>
.projects-catalog { min-height: var(--app-screen); padding-top: calc(var(--layout-surface-top) + var(--space-section)); background-color: var(--semantic-bg-surface); }
.projects-catalog__inner { width: min(var(--layout-content-max), calc(100% - 2 * var(--layout-margin-content))); margin: 0 auto; }
.projects-catalog__header { position: relative; z-index: 1; display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); gap: var(--layout-gutter); align-items: start; }
.projects-catalog__title, .projects-catalog__count { margin: 0; font-weight: 400; line-height: .8; }
.projects-catalog__title { grid-column: 1 / span 10; overflow: hidden; margin-bottom: -.16em; padding-bottom: .16em; font-size: var(--type-catalog-title); letter-spacing: -.065em; text-transform: lowercase; white-space: nowrap; }
.projects-catalog__title-char, .projects-catalog__header-motion { display: inline-block; will-change: transform; }
.projects-catalog__count { grid-column: 12; justify-self: end; overflow: hidden; font-size: var(--type-case-title); font-variant-numeric: tabular-nums; letter-spacing: -.06em; transform: translateY(.035em); }
@supports (text-box-trim: trim-both) { .projects-catalog__title { margin-bottom: 0; padding-bottom: 0; text-box-trim: trim-both; text-box-edge: cap text; } .projects-catalog__count { text-box-trim: trim-both; text-box-edge: cap alphabetic; transform: none; } }
.projects-catalog__surface { position: relative; z-index: 2; width: 100%; margin-top: var(--space-4); padding-bottom: var(--space-section); background-color: var(--semantic-bg-page); }
.projects-catalog__surface::after { position: absolute; top: 100%; right: 0; left: 0; z-index: 0; height: 60svh; background-color: inherit; content: ''; pointer-events: none; }
.projects-catalog__grid { --projects-grid-gap: clamp(1rem, 3vw, 3rem); position: relative; z-index: 2; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); column-gap: var(--projects-grid-gap); row-gap: calc(var(--projects-grid-gap) * 2); width: min(var(--layout-content-max), calc(100% - 2 * var(--layout-margin-content))); margin: 0 auto; padding: var(--layout-margin-content) 0; list-style: none; }
.projects-card { display: block; color: inherit; text-decoration: none; }
.projects-card__cover { height: clamp(18rem, 42vw, 42rem); overflow: hidden; }
.projects-card__cover picture { display: contents; }
.projects-card__cover img { display: block; width: 100%; height: 100%; object-fit: cover; }
.projects-card__meta { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: start; padding-top: var(--space-3); }
.projects-card__detail-mask, .projects-card__title-mask { display: inline-block; overflow: hidden; vertical-align: bottom; }
.projects-card__detail-mask:first-child { margin-top: .12em; transform: translateY(-4px); }
.projects-card__number { display: inline-block; padding: calc(.28em + 2px) .52em .22em; border-radius: .28rem; background-color: var(--palette-forest); color: var(--palette-milk); font-size: calc(var(--type-nav) * .7); line-height: 1; }
.projects-card__title { margin-left: calc(var(--layout-gutter) / 4); font-size: var(--type-lead); letter-spacing: -.04em; line-height: 1; }
.projects-card__title-char, .projects-card__year { display: inline-block; }
.projects-card__year-mask { margin-left: var(--layout-gutter); }
.projects-card__year { font-size: var(--type-body); }
@supports (text-box-trim: trim-start) { .projects-card__title { text-box-trim: trim-start; text-box-edge: cap alphabetic; } .projects-card__detail-mask:first-child { margin-top: 0; } }
@media (hover: hover) and (pointer: fine) { .projects-card__cover img { filter: grayscale(.68) sepia(.3) saturate(.68) contrast(.94) brightness(1.02); transition: filter .9s cubic-bezier(.22, 1, .36, 1); } .projects-card:hover .projects-card__cover img, .projects-card:focus-visible .projects-card__cover img { filter: none; } }
@media not all { .projects-card__cover img { transition: none; } }
@media (max-width: 767px) { .projects-catalog__header { grid-template-columns: minmax(0, 1fr) auto; gap: var(--space-2); } .projects-catalog__title { grid-column: 1; } .projects-catalog__count { grid-column: 2; } .projects-catalog__grid { grid-template-columns: 1fr; } .projects-card__cover { height: 68vw; } }
</style>
