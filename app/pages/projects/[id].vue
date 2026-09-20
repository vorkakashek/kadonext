<script setup lang="ts">
import { homeCaseDetailPath } from '~/utils/homeCases'
import { onNavWaveEnter, onNavWaveLeave } from '~/utils/navWaveHover'

const route = useRoute()
const { t } = useI18n()
const localePath = useLocalePath()
const { scrollRevision } = useMotionRuntime()
const homeCases = useHomeCases()
const projectCaseDetails = await useProjectCaseDetails()
const item = computed(() =>
  homeCases.value.find((caseItem) => caseItem.id === route.params.id),
)
const {
  request: detailTransitionRequest,
  active: detailTransitionActive,
} = useCaseDetailTransition()
const {
  contentVisible: detailContentVisible,
  motionActive: detailMotionActive,
  stageDirectEntry,
  mountPage: mountCaseDetailPage,
  completeEntry: completeCaseDetailEntry,
  unmountPage: unmountCaseDetailPage,
} = useCaseDetailExperience()
const firstScreenEl = ref<HTMLElement | null>(null)
const titleFrameEl = ref<HTMLElement | null>(null)
const titleMotionEl = ref<HTMLElement | null>(null)
const metaFrameEl = ref<HTMLElement | null>(null)
const mediaEnterEl = ref<HTMLElement | null>(null)
const mediaParallaxEl = ref<HTMLElement | null>(null)
const detailContentEl = ref<HTMLElement | null>(null)
const nextProjectContentEl = ref<HTMLElement | null>(null)
const nextItem = computed(() => {
  const currentIndex = homeCases.value.findIndex((caseItem) => caseItem.id === item.value?.id)
  return homeCases.value[(currentIndex + 1) % homeCases.value.length]
})
const projectDetail = computed(() => item.value ? projectCaseDetails.value[item.value.id] : undefined)
const headerMedia = computed(() => projectDetail.value?.headerMedia ?? item.value?.media)

let mediaParallaxCtx: { revert: () => void } | null = null
let headerScrollCtx: { revert: () => void } | null = null
let detailRevealCtx: { revert: () => void } | null = null
let audienceTextFillCtx: { revert: () => void } | null = null
let nextProjectParallaxCtx: { revert: () => void } | null = null
let audienceTextResizeObserver: ResizeObserver | null = null
let caseMediaPreloadObserver: IntersectionObserver | null = null
let caseMediaDecodeObserver: IntersectionObserver | null = null
let audienceTextRebuildTimer = 0
let audienceFontReadyRefreshQueued = false
const audienceTextFillLayouts = new WeakMap<HTMLElement, string>()
let directRevealFrame = 0
let directRevealReadyTimer = 0
let detailPageUnmounted = false
let lastDetailScrollAt = 0
const detailEnhancementTimers: number[] = []
const detailEnhancementIdles: number[] = []
let stopDetailEnhancementWatch: (() => void) | null = null
const mediaDecodeQueue: HTMLImageElement[] = []
const queuedMediaDecodes = new Set<HTMLImageElement>()
let activeMediaDecodes = 0

type NetworkInformationHint = {
  effectiveType?: string
  saveData?: boolean
}

function connectionHint() {
  return (navigator as Navigator & { connection?: NetworkInformationHint }).connection
}

function slowOrMeteredConnection() {
  const connection = connectionHint()
  return Boolean(
    connection?.saveData
    || connection?.effectiveType === 'slow-2g'
    || connection?.effectiveType === '2g'
    || connection?.effectiveType === '3g',
  )
}

function pumpMediaDecodeQueue() {
  const concurrency = slowOrMeteredConnection() ? 1 : 2
  while (activeMediaDecodes < concurrency && mediaDecodeQueue.length) {
    const image = mediaDecodeQueue.shift()
    if (!image) break
    queuedMediaDecodes.delete(image)
    if (!image.isConnected) continue
    activeMediaDecodes += 1
    image.decoding = 'async'
    void image.decode().catch(() => undefined).finally(() => {
      activeMediaDecodes = Math.max(0, activeMediaDecodes - 1)
      pumpMediaDecodeQueue()
    })
  }
}

function queueMediaDecode(image: HTMLImageElement) {
  if (queuedMediaDecodes.has(image)) return
  queuedMediaDecodes.add(image)
  mediaDecodeQueue.push(image)
  pumpMediaDecodeQueue()
}

// A direct request has no fullscreen cover to stage the page underneath. Keep
// its first screen in the entry pose through hydration and the responsive
// header-image decode so none of that geometry is exposed.
const isDirectEntry = !detailTransitionRequest.value && !detailTransitionActive.value
if (isDirectEntry) stageDirectEntry(String(route.params.id))

function releaseDirectEntry() {
  directRevealFrame = requestAnimationFrame(() => {
    directRevealFrame = requestAnimationFrame(() => {
      completeCaseDetailEntry()
    })
  })
}

async function waitForDirectEntryPaint() {
  const image = mediaEnterEl.value?.querySelector('img')
  const imageReady = async () => {
    if (!image) return
    if (!image.complete) {
      await new Promise<void>((resolve) => {
        image.addEventListener('load', () => resolve(), { once: true })
        image.addEventListener('error', () => resolve(), { once: true })
      })
    }
    if (image.naturalWidth > 0) await image.decode().catch(() => undefined)
  }

  // Font loading must not delay the first screen. The reserved responsive
  // geometry keeps the image stable, while font-display handles text fallback.
  const stableAssets = imageReady()
  const timeout = new Promise<void>((resolve) => {
    directRevealReadyTimer = window.setTimeout(resolve, 1400)
  })

  await Promise.race([stableAssets, timeout])
  if (directRevealReadyTimer) window.clearTimeout(directRevealReadyTimer)
  directRevealReadyTimer = 0
}

function setupCaseMediaPreload() {
  const root = detailContentEl.value?.parentElement
  if (!root || !('IntersectionObserver' in window)) return

  caseMediaPreloadObserver?.disconnect()
  caseMediaDecodeObserver?.disconnect()
  const slow = slowOrMeteredConnection()
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches
  // Reading normally moves downward: keep a useful forward runway while the
  // smaller top margin is enough for already cached reverse-scroll media.
  const networkAhead = slow ? 0.65 : finePointer ? 3 : 0.8
  const decodeAhead = slow ? 0.25 : finePointer ? 1.8 : 0.35
  caseMediaPreloadObserver = new IntersectionObserver((entries, observer) => {
    for (const entry of entries) {
      if (!entry.isIntersecting || !(entry.target instanceof HTMLImageElement)) continue
      const image = entry.target
      observer.unobserve(image)
      // Network first. Decode and GPU upload have their own, smaller corridors.
      image.loading = 'eager'
      if ('fetchPriority' in image) image.fetchPriority = 'low'
    }
  }, {
    rootMargin: `${Math.round(window.innerHeight * 0.25)}px 0px ${Math.round(window.innerHeight * networkAhead)}px 0px`,
  })

  caseMediaDecodeObserver = new IntersectionObserver((entries, observer) => {
    for (const entry of entries) {
      if (!entry.isIntersecting || !(entry.target instanceof HTMLImageElement)) continue
      observer.unobserve(entry.target)
      if ('fetchPriority' in entry.target) entry.target.fetchPriority = 'auto'
      queueMediaDecode(entry.target)
    }
  }, {
    rootMargin: `${Math.round(window.innerHeight * 0.15)}px 0px ${Math.round(window.innerHeight * decodeAhead)}px 0px`,
  })

  for (const image of root.querySelectorAll<HTMLImageElement>('img[loading="lazy"]')) {
    if ('fetchPriority' in image) image.fetchPriority = 'low'
    caseMediaPreloadObserver.observe(image)
    caseMediaDecodeObserver.observe(image)
  }
}

async function refreshAudienceScrollPositions() {
  const { ScrollTrigger } = await import('gsap/ScrollTrigger')
  requestAnimationFrame(() => ScrollTrigger.refresh())
}

async function setupMediaParallax() {
  const media = mediaParallaxEl.value
  if (!media || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  const mobileHeaderParallax = window.matchMedia('(max-width: 767.98px)').matches
  const parallaxHeaderMedia = mobileHeaderParallax
    || item.value?.id === 'audience'
    || item.value?.id === 'keys-store'
  const parallaxTravel = mobileHeaderParallax
    ? -16.667
    : item.value?.id === 'keys-store' ? -15 : -55
  const mediaFrame = mediaEnterEl.value ?? media

  mediaParallaxCtx?.revert()
  mediaParallaxCtx = null
  if (!parallaxHeaderMedia) return

  const gsap = (await import('gsap')).default
  const { ScrollTrigger } = await import('gsap/ScrollTrigger')
  gsap.registerPlugin(ScrollTrigger)

  mediaParallaxCtx = gsap.context(() => {
    const scrollTrigger = {
      trigger: mediaFrame,
      start: 'top bottom',
      end: 'bottom top',
      scrub: 0.65,
      invalidateOnRefresh: true,
    }

    gsap.fromTo(
      media,
      { yPercent: 0 },
      {
        // Every mobile case uses the same oversized 4:5 header treatment.
        // Desktop keeps the established Audience/Keys-only behaviour.
        yPercent: parallaxTravel,
        ease: 'none',
        scrollTrigger,
      },
    )
  }, mediaFrame)
}

async function setupHeaderScroll() {
  const scope = firstScreenEl.value
  const titleFrame = titleFrameEl.value
  const title = titleMotionEl.value
  const meta = metaFrameEl.value
  const media = mediaEnterEl.value
  if (
    !scope
    || !titleFrame
    || !title
    || !meta
    || !media
    || window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ) return

  const gsap = (await import('gsap')).default
  const { ScrollTrigger } = await import('gsap/ScrollTrigger')
  gsap.registerPlugin(ScrollTrigger)

  headerScrollCtx?.revert()
  headerScrollCtx = gsap.context(() => {
    const mediaTravel = () => Math.min(window.innerHeight * 0.16, media.offsetHeight * 0.22)

    const timeline = gsap.timeline({
      scrollTrigger: {
        trigger: titleFrame,
        start: 'top top',
        end: 'bottom top',
        scrub: 0.7,
        invalidateOnRefresh: true,
      },
    })

    timeline
      .fromTo(title, { y: 0 }, {
        y: () => titleFrame.clientHeight - mediaTravel() - title.offsetTop + 2,
        ease: 'none',
      }, 0)
      .fromTo(titleFrame, { clipPath: 'inset(0 0 0px 0)' }, {
        clipPath: () => `inset(0 0 ${mediaTravel()}px 0)`,
        ease: 'none',
      }, 0)
      .fromTo(scope, { '--case-header-shift': '0px' }, {
        '--case-header-shift': () => `${-mediaTravel()}px`,
        ease: 'none',
      }, 0)
  }, scope)
}

async function setupDetailReveals() {
  // The closing Audience media sits outside the constrained inner container so
  // it can remain genuinely edge-to-edge. Use the main case element as the
  // reveal scope so full-bleed sections participate in the same motion system.
  const root = detailContentEl.value?.parentElement
  if (!root || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

  const textTargets = Array.from(root.querySelectorAll<HTMLElement>([
    '.case-detail__hero h1',
    '.case-detail__meta',
    '.audience-case > h2',
    '.case-section-intro-copy > h2',
    '.case-section-intro-copy__body > p',
    '.audience-case__copy > p',
    '.audience-case__menu-lead > p',
    '.audience-case__menu-secondary',
    '.audience-case__motion-secondary',
    '.audience-case__statement',
    '.audience-case__lede',
    '.audience-case--final p',
    '.project-story > h2',
    '.project-story__copy > p',
    '.project-story__statement',
    '.case-disclosure',
    '.project-story--final p',
  ].join(','))).filter((target) =>
    // The complete first screen is already staged by the detail entry
    // transition on every case. A second scroll reveal here makes the opening
    // media jump as its parallax begins.
    !target.closest('.case-detail__first-screen'),
  )
  const mediaTargets = Array.from(root.querySelectorAll<HTMLElement>([
    '.case-detail__media',
    '.audience-case__media-pair .audience-case__wave-media',
    '.audience-case__media-wide',
    '.audience-case__menu-lead-media',
    '.audience-case__mosaic-picture',
    '.audience-case__media-full',
    '.audience-case__motion-pair > img',
    '.audience-case__motion-pair .case-autoplay-video',
    '.audience-case__admin-media .audience-case__responsive-picture',
    '.audience-case__closing-media',
    '.project-story__media img',
    '.project-story__media .case-autoplay-video',
    '.project-story__closing-media',
  ].join(','))).filter((target) =>
    !target.closest('.case-detail__first-screen'),
  )
  if (!textTargets.length && !mediaTargets.length) return

  const gsap = (await import('gsap')).default
  const { ScrollTrigger } = await import('gsap/ScrollTrigger')
  gsap.registerPlugin(ScrollTrigger)

  detailRevealCtx?.revert()
  detailRevealCtx = gsap.context(() => {
    const addReveal = (target: HTMLElement, media: boolean) => {
      // The shared media shader must not replace a target while GSAP owns its
      // opacity or transform during the scroll reveal/leave corridor.
      target.dataset.caseReveal = ''
      const enterY = media ? 4 : 7
      const leaveY = media ? -4 : -7
      gsap.fromTo(target,
        media ? {
          autoAlpha: 0,
          yPercent: enterY,
        } : {
          autoAlpha: 0,
          yPercent: enterY,
          scale: 0.975,
          rotationX: 3,
          transformOrigin: '50% 0%',
          transformPerspective: 1000,
        },
        media ? {
          autoAlpha: 1,
          yPercent: 0,
          ease: 'none',
          scrollTrigger: {
            trigger: target,
            start: 'top 96%',
            end: 'top 84%',
            scrub: 0.65,
            invalidateOnRefresh: true,
          },
        } : {
          autoAlpha: 1,
          yPercent: 0,
          scale: 1,
          rotationX: 0,
          ease: 'none',
          scrollTrigger: {
            trigger: target,
            start: 'top 96%',
            end: 'top 84%',
            scrub: 0.65,
            invalidateOnRefresh: true,
          },
        },
      )

      gsap.fromTo(target,
        media ? {
          autoAlpha: 1,
          yPercent: 0,
        } : {
          autoAlpha: 1,
          yPercent: 0,
          scale: 1,
          rotationX: 0,
        },
        media ? {
          autoAlpha: 0,
          yPercent: leaveY,
          ease: 'none',
          immediateRender: false,
          scrollTrigger: {
            trigger: target,
            start: 'bottom 45%',
            end: 'bottom 20%',
            scrub: 0.65,
            invalidateOnRefresh: true,
          },
        } : {
          autoAlpha: 0,
          yPercent: leaveY,
          scale: 0.975,
          rotationX: -3,
          transformOrigin: '50% 100%',
          transformPerspective: 1000,
          ease: 'none',
          immediateRender: false,
          scrollTrigger: {
            trigger: target,
            start: 'bottom 45%',
            end: 'bottom 20%',
            scrub: 0.65,
            invalidateOnRefresh: true,
          },
        },
      )
    }

    textTargets.forEach(target => addReveal(target, false))
    mediaTargets.forEach(target => addReveal(target, true))
  }, root)
}

async function setupAudienceTextFill() {
  const root = detailContentEl.value
  const hosts = Array.from(
    root?.querySelectorAll<HTMLElement>('.case-text-fill') ?? [],
  )
  if (!hosts.length || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

  // Build immediately so a fast scroll cannot outrun the effect while the
  // webfont is still loading. Rebuild once after the final metrics settle.
  if (document.fonts.status !== 'loaded' && !audienceFontReadyRefreshQueued) {
    audienceFontReadyRefreshQueued = true
    void document.fonts.ready.then(() => {
      audienceFontReadyRefreshQueued = false
      if (!detailPageUnmounted && detailContentEl.value === root) void setupAudienceTextFill()
    })
  }

  audienceTextFillCtx?.revert()
  const hostInks = hosts.map((host) => {
    const paragraphs = host.matches('p')
      ? [host as HTMLParagraphElement]
      : Array.from(host.querySelectorAll('p'))
    const inks: HTMLElement[] = []
    for (const paragraph of paragraphs) {
      const text = paragraph.dataset.fillText ?? paragraph.textContent?.trim() ?? ''
      if (!text) continue
      paragraph.dataset.fillText = text
      paragraph.textContent = ''
      const measure = document.createElement('span')
      measure.className = 'audience-fill__measure'
      paragraph.append(measure)
      const words: HTMLSpanElement[] = []
      for (const part of text.split(/\s+/)) {
        const word = document.createElement('span')
        word.textContent = part
        measure.append(word, document.createTextNode(' '))
        words.push(word)
      }

      const lines: string[] = []
      let lineTop = Number.NaN
      let line = ''
      for (const word of words) {
        if (!Number.isNaN(lineTop) && Math.abs(word.offsetTop - lineTop) > 1) {
          lines.push(line.trim())
          line = ''
        }
        lineTop = word.offsetTop
        line += `${word.textContent ?? ''} `
      }
      if (line.trim()) lines.push(line.trim())

      paragraph.textContent = ''
      for (const lineText of lines) {
        const row = document.createElement('span')
        row.className = 'audience-fill__line'
        const ash = document.createElement('span')
        ash.className = 'audience-fill__ash'
        ash.textContent = lineText
        const ink = document.createElement('span')
        ink.className = 'audience-fill__ink'
        ink.textContent = lineText
        ink.setAttribute('aria-hidden', 'true')
        row.append(ash, ink)
        paragraph.append(row)
        inks.push(ink)
      }
    }
    return { host, inks }
  }).filter(({ inks }) => inks.length)
  if (!hostInks.length) return

  const gsap = (await import('gsap')).default
  const { ScrollTrigger } = await import('gsap/ScrollTrigger')
  gsap.registerPlugin(ScrollTrigger)
  audienceTextFillCtx = gsap.context(() => {
    hostInks.forEach(({ host, inks }) => {
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: host,
          start: 'top 82%',
          end: 'bottom 45%',
          // Keep the fill locked to the actual scroll position. A smoothed
          // scrub visibly lagged behind rapid middle-mouse scrolling.
          scrub: true,
        },
      })
      inks.forEach((ink, index) => {
        // One complete row per timeline segment: the next line remains ash
        // until the previous one has finished filling.
        tl.fromTo(ink, { clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0% 0 0)', duration: 1, ease: 'none' }, index)
      })
    })
  }, detailContentEl.value ?? hosts[0])

  const layoutSignature = (host: HTMLElement) => {
    const styles = getComputedStyle(host)
    return [
      host.clientWidth,
      styles.fontFamily,
      styles.fontSize,
      styles.fontWeight,
      styles.letterSpacing,
      styles.lineHeight,
    ].join('|')
  }

  audienceTextResizeObserver ??= new ResizeObserver((entries) => {
    const layoutChanged = entries.some((entry) => {
      const host = entry.target as HTMLElement
      return audienceTextFillLayouts.get(host) !== layoutSignature(host)
    })
    if (!layoutChanged) return
    if (audienceTextRebuildTimer) window.clearTimeout(audienceTextRebuildTimer)
    audienceTextRebuildTimer = window.setTimeout(() => {
      audienceTextRebuildTimer = 0
      void setupAudienceTextFill()
    }, 140)
  })
  audienceTextResizeObserver.disconnect()
  hosts.forEach((host) => {
    audienceTextFillLayouts.set(host, layoutSignature(host))
    audienceTextResizeObserver?.observe(host)
  })

  requestAnimationFrame(() => ScrollTrigger.refresh())
}

async function setupNextProjectParallax() {
  const content = nextProjectContentEl.value
  const block = content?.parentElement
  if (!block || !content || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

  const gsap = (await import('gsap')).default
  const { ScrollTrigger } = await import('gsap/ScrollTrigger')
  gsap.registerPlugin(ScrollTrigger)
  nextProjectParallaxCtx?.revert()
  nextProjectParallaxCtx = gsap.context(() => {
    gsap.fromTo(content, { yPercent: -26 }, {
      yPercent: 4,
      ease: 'none',
      scrollTrigger: {
        trigger: block,
        start: 'top bottom',
        end: 'bottom bottom',
        scrub: 0.75,
      },
    })
  }, block)
}

type KillableGsapContext = {
  revert: () => void
  kill?: (revert?: boolean) => void
}

function disposeContext(context: KillableGsapContext | null) {
  // The route subtree is removed immediately afterwards. Reverting every
  // animated inline style first only adds style/layout work to navigation.
  if (context?.kill) context.kill(false)
  else context?.revert()
}

function cancelDeferredDetailEnhancements() {
  stopDetailEnhancementWatch?.()
  stopDetailEnhancementWatch = null
  for (const timer of detailEnhancementTimers.splice(0)) {
    globalThis.clearTimeout(timer)
  }
  if (typeof window.cancelIdleCallback === 'function') {
    for (const idle of detailEnhancementIdles.splice(0)) {
      window.cancelIdleCallback(idle)
    }
  } else {
    detailEnhancementIdles.length = 0
  }
}

function removeScheduledId(collection: number[], id: number) {
  const index = collection.indexOf(id)
  if (index >= 0) collection.splice(index, 1)
}

function scheduleDetailEnhancement(delay: number, task: () => void | Promise<void>) {
  const timer = globalThis.setTimeout(() => {
    removeScheduledId(detailEnhancementTimers, timer)
    if (detailPageUnmounted || !detailMotionActive.value) return

    let idle = 0
    const run = () => {
      if (idle) removeScheduledId(detailEnhancementIdles, idle)
      if (detailPageUnmounted || !detailMotionActive.value) return
      const quietFor = performance.now() - lastDetailScrollAt
      if (lastDetailScrollAt && quietFor < 240) {
        scheduleDetailEnhancement(Math.ceil(240 - quietFor), task)
        return
      }
      void task()
    }
    if (typeof window.requestIdleCallback === 'function') {
      idle = window.requestIdleCallback(run, { timeout: 1400 })
      detailEnhancementIdles.push(idle)
    } else {
      run()
    }
  }, delay)
  detailEnhancementTimers.push(timer)
}

function scheduleDeferredDetailEnhancements() {
  if (detailPageUnmounted || detailEnhancementTimers.length || detailEnhancementIdles.length) return

  // Keep non-critical work away from the first interactive frames. Scroll
  // reveals are registered with the text fill as soon as entry ends so a fast
  // reader cannot move past their trigger corridor before they exist.
  scheduleDetailEnhancement(1350, setupNextProjectParallax)
  scheduleDetailEnhancement(2400, () => preloadRouteComponents('/'))
}

function deferBelowFoldSetupUntilEntryEnds() {
  const startEnhancements = () => {
    requestAnimationFrame(() => {
      if (detailPageUnmounted || !detailMotionActive.value) return
      // Both appearance systems are scroll-critical: initialize them before
      // the user can move past the first target. Heavier non-critical effects
      // stay deferred.
      void setupDetailReveals()
      void setupAudienceTextFill()
      scheduleDeferredDetailEnhancements()
    })
  }

  if (detailMotionActive.value) {
    startEnhancements()
    return
  }
  stopDetailEnhancementWatch = watch(detailMotionActive, (active) => {
    if (!active) return
    stopDetailEnhancementWatch?.()
    stopDetailEnhancementWatch = null
    startEnhancements()
  })
}

onMounted(() => {
  mountCaseDetailPage(String(route.params.id))
  watch(scrollRevision, () => {
    lastDetailScrollAt = performance.now()
  })
  void nextTick(async () => {
    // Register the network/decode runway before the user can outrun native
    // lazy loading. The observers themselves are cheap; their work remains
    // incremental as media approaches the viewport.
    setupCaseMediaPreload()
    const firstScreenMotionReady = Promise.all([
      setupHeaderScroll(),
      setupMediaParallax(),
    ])
    deferBelowFoldSetupUntilEntryEnds()

    if (isDirectEntry) {
      await Promise.all([firstScreenMotionReady, waitForDirectEntryPaint()])
      if (!detailPageUnmounted) releaseDirectEntry()
    }
  })
})

onBeforeUnmount(() => {
  detailPageUnmounted = true
  unmountCaseDetailPage()
  if (directRevealFrame) cancelAnimationFrame(directRevealFrame)
  if (directRevealReadyTimer) window.clearTimeout(directRevealReadyTimer)
  directRevealReadyTimer = 0
  cancelDeferredDetailEnhancements()
  disposeContext(mediaParallaxCtx)
  mediaParallaxCtx = null
  disposeContext(headerScrollCtx)
  headerScrollCtx = null
  disposeContext(detailRevealCtx)
  detailRevealCtx = null
  disposeContext(audienceTextFillCtx)
  audienceTextFillCtx = null
  disposeContext(nextProjectParallaxCtx)
  nextProjectParallaxCtx = null
  audienceTextResizeObserver?.disconnect()
  audienceTextResizeObserver = null
  caseMediaPreloadObserver?.disconnect()
  caseMediaPreloadObserver = null
  caseMediaDecodeObserver?.disconnect()
  caseMediaDecodeObserver = null
  mediaDecodeQueue.length = 0
  queuedMediaDecodes.clear()
  if (audienceTextRebuildTimer) window.clearTimeout(audienceTextRebuildTimer)
  audienceTextRebuildTimer = 0
})

if (!item.value) {
  throw createError({ statusCode: 404, statusMessage: t('projects.detail.notFound') })
}

</script>

<template>
  <div
    v-if="item"
    class="case-detail-shell"
  >
    <main
      class="case-detail"
      :class="{
        'case-detail--inverse': item.inverse,
        'case-detail--audience': item.id === 'audience',
        'case-detail--baltika': item.id === 'baltika',
        'case-detail--transition-entry': !isDirectEntry,
        'case-detail--entering': !detailContentVisible,
      }"
      :style="{ backgroundColor: item.wash }"
    >
      <CaseScrollTop />
      <div ref="detailContentEl" class="case-detail__inner">
      <div ref="firstScreenEl" class="case-detail__first-screen">
        <section ref="titleFrameEl" class="case-detail__hero">
          <h1 ref="titleMotionEl">
            <span>{{ item.title }},</span>
            <span class="case-detail__summary">{{ (projectDetail?.summary ?? item.blurb).replaceAll('\n', ' ') }}</span>
          </h1>
        </section>

        <section class="case-detail__content">
          <div
            ref="metaFrameEl"
            class="case-detail__meta"
            :class="{ 'case-detail__meta--five-up': item.id === 'schmidt' }"
          >
            <div class="case-detail__meta-motion">
              <div>
                <p class="case-detail__eyebrow">{{ t('projects.detail.client') }}</p>
                <p class="case-detail__tags">{{ item.client }}</p>
              </div>
              <div>
                <p class="case-detail__eyebrow">{{ t('projects.detail.year') }}</p>
                <p class="case-detail__tags">{{ item.year }}</p>
              </div>
              <div>
                <p class="case-detail__eyebrow">{{ t('projects.detail.contribution') }}</p>
                <p class="case-detail__tags case-detail__role-tags">
                  <span v-for="tag in item.roleTags" :key="tag">{{ tag }}</span>
                </p>
              </div>
              <div v-if="item.collaboration">
                <p class="case-detail__eyebrow">{{ t('projects.detail.collaboration') }}</p>
                <p class="case-detail__tags">{{ item.collaboration }}</p>
              </div>
              <div v-if="item.projectUrl">
                <p class="case-detail__eyebrow">{{ t('projects.detail.links') }}</p>
                <a
                  class="case-detail__project-link"
                  :href="item.projectUrl"
                  target="_blank"
                  rel="noopener noreferrer"
                  @mouseenter="onNavWaveEnter"
                  @mouseleave="onNavWaveLeave"
                  @focus="onNavWaveEnter"
                  @blur="onNavWaveLeave"
                >
                  <span class="case-detail__project-label">
                    {{ item.projectLabel ?? item.projectUrl }}
                    <TextLinkWave />
                  </span>
                  <SiteIcon name="arrow-up-right" :size="16" />
                </a>
              </div>
            </div>
          </div>
          <div
            ref="mediaEnterEl"
            class="case-detail__media case-detail__media--mobile-parallax"
            :class="{
              'case-detail__media--audience': item.id === 'audience',
              'case-detail__media--keys': item.id === 'keys-store',
              'case-detail__media--parallax': item.id === 'audience' || item.id === 'keys-store',
              'case-detail__media--video': item.id === 'baltika' && !projectDetail?.headerMedia && item.media.video,
            }"
          >
            <div ref="mediaParallaxEl" class="case-detail__media-parallax">
              <BaltikaScrollFilm
                v-if="item.id === 'baltika' && !projectDetail?.headerMedia && item.media.video"
                :webm="item.media.video.webm"
                :mp4="item.media.video.mp4"
                :mobile-webm="item.media.video.mobileWebm"
                :mobile-mp4="item.media.video.mobileMp4"
                :poster="item.media.video.poster"
                :alt="item.media.alt"
              />
              <picture v-else class="case-detail__picture">
                <source
                  v-if="headerMedia?.mobileAvifSrcset"
                  media="(max-width: 767.98px)"
                  type="image/avif"
                  :srcset="headerMedia.mobileAvifSrcset"
                  sizes="100vw"
                >
                <source
                  v-if="headerMedia?.mobileWebpSrcset"
                  media="(max-width: 767.98px)"
                  type="image/webp"
                  :srcset="headerMedia.mobileWebpSrcset"
                  sizes="100vw"
                >
                <source
                  v-if="headerMedia?.mobileSrc"
                  media="(max-width: 767.98px)"
                  :srcset="headerMedia.mobileSrc"
                >
                <source v-if="headerMedia?.avifSrcset" type="image/avif" :srcset="headerMedia.avifSrcset" sizes="100vw">
                <source v-if="headerMedia?.webpSrcset" type="image/webp" :srcset="headerMedia.webpSrcset" sizes="100vw">
                <img
                  :src="headerMedia?.src"
                  :alt="headerMedia?.alt"
                  :width="headerMedia?.width"
                  :height="headerMedia?.height"
                  class="case-detail__image"
                  loading="eager"
                  fetchpriority="high"
                  decoding="async"
                >
              </picture>
            </div>
          </div>
        </section>
      </div>

        <template v-if="projectDetail">
          <CaseBlockRenderer
            v-for="(block, blockIndex) in projectDetail.blocks"
            :key="block.id"
            :block="block"
            :first="blockIndex === 0"
            @layout-change="refreshAudienceScrollPositions"
          />
        </template>
      </div>

      <CaseClosingMedia
        v-if="projectDetail"
        :media="projectDetail.closing"
        :variant="projectDetail.closingVariant"
      />
    </main>

    <NuxtLink
      v-if="nextItem"
      :to="localePath(homeCaseDetailPath(nextItem))"
      class="case-detail__next"
      :class="{ 'case-detail__next--inverse': nextItem.inverse }"
      :data-page-iris-color="nextItem.wash"
      :style="{ backgroundColor: nextItem.wash }"
    >
      <span ref="nextProjectContentEl" class="case-detail__next-content">
        <span class="case-detail__next-name">{{ nextItem.title }}</span>
        <span class="case-detail__next-link">{{ t('projects.detail.next') }} <SiteIcon name="arrow-right" :size="28" /></span>
      </span>
    </NuxtLink>
  </div>
</template>

<style scoped>
.case-detail {
  position: relative;
  z-index: 1;
  min-height: var(--app-screen);
  color: var(--palette-ink, #0a0a0a);
  /* The native Baltika film and the fixed wave canvas both use multiply.
     Keep their blend backdrop inside this page so swapping to the canvas on
     pointer entry cannot pick up a darker surface from the app shell. */
  isolation: isolate;
}

.case-detail--inverse {
  color: var(--palette-milk, #f5f1e8);
}

.case-detail__inner {
  /* Shared vertical rhythm from every disclosure to the media that follows it. */
  --case-disclosure-media-gap: var(--space-4);
  width: min(var(--layout-content-max), calc(100% - 2 * var(--layout-margin-content)));
  margin: 0 auto;
  padding-bottom: var(--space-section);
}

.case-detail__first-screen {
  --case-header-shift: 0px;
}

.case-detail__hero {
  position: relative;
  display: grid;
  /* Keep the opening mark compact so the case itself starts in the first view. */
  box-sizing: border-box;
  min-height: 60svh;
  align-content: center;
  row-gap: var(--space-3);
  place-items: start;
  padding-block: calc(var(--layout-surface-top) + var(--space-3)) var(--space-3);
  overflow: hidden;
  text-align: left;
  will-change: clip-path;
}

.case-detail__content {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  width: 100%;
  margin: 0 auto;
  padding-top: var(--space-4);
}

.case-detail__meta {
  border-top: 1px solid color-mix(in srgb, currentColor 24%, transparent);
  overflow: hidden;
  translate: 0 var(--case-header-shift);
  will-change: translate;
}

.case-detail__meta-motion {
  display: grid;
  gap: var(--space-3);
  padding-top: var(--space-3);
}

@media (min-width: 768px) {
  .case-detail__hero {
    grid-template-columns: repeat(12, minmax(0, 1fr));
    min-height: calc(60svh + var(--space-4));
    column-gap: var(--layout-gutter);
  }

  .case-detail__hero h1 {
    grid-column: 2 / -2;
  }

  .case-detail__content {
    grid-template-columns: repeat(12, minmax(0, 1fr));
    column-gap: var(--layout-gutter);
    padding-top: 0;
  }

  .case-detail__meta {
    grid-column: 2 / -2;
  }

  .case-detail__meta-motion {
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: var(--layout-gutter);
  }

  .case-detail__meta--five-up .case-detail__meta-motion {
    grid-template-columns: repeat(5, minmax(0, 1fr));
  }

  .case-detail__media {
    grid-column: 1 / -1;
  }

  .case-detail--baltika .case-detail__media {
    grid-column: 1 / -1;
  }

}

.case-detail__eyebrow,
.case-detail__tags {
  margin: 0;
  font-size: var(--type-nav);
  letter-spacing: -0.02em;
}

.case-detail__project-link {
  display: inline-flex;
  align-items: center;
  gap: calc(var(--space-1) / 2);
  margin-top: var(--space-1);
  color: inherit;
  font-size: var(--type-nav);
  font-weight: 500;
  text-decoration: none;
}

.case-detail__project-link > svg {
  transform: translateY(-2px);
}

.case-detail__project-label {
  position: relative;
  display: inline-block;
  padding-bottom: 0.36em;
}

.case-detail__eyebrow {
  opacity: 0.6;
}

.case-detail__tags {
  margin-top: var(--space-1);
  font-weight: 500;
}

.case-detail__role-tags {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0;
  line-height: 1.1;
}

.case-detail__role-tags span {
  font-weight: 500;
  white-space: nowrap;
}

h1 {
  width: 100%;
  margin: 0;
  font-size: var(--type-case-title);
  font-weight: 400;
  letter-spacing: -0.05em;
  line-height: 0.95;
  transition: opacity 2.5s cubic-bezier(0.22, 1, 0.36, 1);
}

.case-detail__summary {
  display: block;
}

@media (max-width: 767.98px) {
  .case-detail__inner {
    padding-bottom: 0;
  }

  .case-detail--audience .case-detail__media--audience {
    aspect-ratio: 4 / 5;
  }

  .case-detail__first-screen {
    box-sizing: border-box;
    display: flex;
    min-height: var(--app-screen);
    flex-direction: column;
    padding-bottom: 0;
  }

  .case-detail__hero {
    min-height: 0;
    row-gap: var(--space-2);
    padding-block: calc(var(--layout-surface-top) + var(--space-2)) var(--space-5);
  }

  .case-detail__content {
    display: flex;
    min-height: 0;
    flex: 1;
    flex-direction: column;
    gap: 0;
    padding-top: 0;
  }

  .case-detail__meta {
    padding-top: 0;
  }

  .case-detail__meta-motion {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    column-gap: var(--layout-gutter);
    row-gap: var(--space-1);
    padding-top: var(--space-2);
  }

  .case-detail__tags {
    margin-top: 0;
  }

  .case-detail__image {
    aspect-ratio: auto;
  }
}

.case-detail__media {
  margin-top: var(--space-4);
  margin-bottom: var(--space-case-media-runway);
  translate: 0 var(--case-header-shift);
  will-change: translate;
}

.case-detail__media--video {
  margin-bottom: var(--space-case-video-runway);
}

.case-detail__media-parallax {
  will-change: transform;
}

.case-detail__picture {
  display: contents;
}

.case-detail__image {
  display: block;
  width: 100%;
  aspect-ratio: 16 / 9;
  object-fit: cover;
}

.case-detail__media--parallax .case-detail__image {
  width: 100%;
  height: 100%;
  aspect-ratio: auto;
  object-fit: cover;
}

/* The parallax cases keep a full image behind the shortened frame. The inner
   element preserves enough raster height for the scroll travel. */
.case-detail__media--parallax {
  aspect-ratio: 16 / 9;
  margin-bottom: var(--space-case-audience-runway);
  overflow: hidden;
}

.case-detail__media--parallax .case-detail__media-parallax {
  height: 222.222%;
}

/* The Keys Store source is already landscape. A smaller overscan preserves
   substantially more of its composition while leaving room for the parallax. */
.case-detail__media--keys .case-detail__media-parallax {
  height: 125%;
}

@media (min-width: 768px) {
  .case-detail__media,
  .case-detail__media--video,
  .case-detail__media--audience {
    margin-bottom: 0;
  }
}

@media (max-width: 767.98px) {
  .case-detail__media {
    margin-top: var(--space-3);
    margin-bottom: 0;
  }

  .case-detail__media--mobile-parallax {
    aspect-ratio: 4 / 5;
    overflow: hidden;
  }

  .case-detail__media--mobile-parallax .case-detail__media-parallax {
    height: 120%;
  }

  .case-detail__media--mobile-parallax .case-detail__image {
    width: 100%;
    height: 100%;
    aspect-ratio: auto;
    object-fit: cover;
  }
}

.case-detail__meta,
.case-detail__media {
  transition:
    opacity 1.6s cubic-bezier(0.22, 1, 0.36, 1),
    transform 1.6s cubic-bezier(0.22, 1, 0.36, 1);
}

.case-detail--entering h1,
.case-detail--entering .case-detail__meta,
.case-detail--entering .case-detail__media {
  opacity: 0;
}

.case-detail--entering .case-detail__meta,
.case-detail--entering .case-detail__media {
  transform: translateY(2rem);
}

.case-detail:not(.case-detail--entering) .case-detail__meta {
  transition-delay: 0.2s;
}

.case-detail:not(.case-detail--entering) .case-detail__media {
  transition-delay: 0.48s;
}

.case-detail__next {
  position: relative;
  z-index: 1;
  display: flex;
  box-sizing: border-box;
  height: 20svh;
  min-height: 20svh;
  align-items: flex-end;
  justify-content: space-between;
  margin-top: 0;
  padding: var(--space-4) var(--layout-margin-content);
  color: var(--palette-ink, #0a0a0a);
  text-decoration: none;
  overflow: hidden;
}

.case-detail__next--inverse { color: var(--palette-milk, #f5f1e8); }

.case-detail__next-content {
  display: flex;
  width: 100%;
  align-items: flex-end;
  justify-content: space-between;
  will-change: transform;
}

.case-detail__next-name {
  max-width: 68%;
  color: color-mix(in srgb, currentColor 30%, transparent);
  font-size: clamp(3rem, 8vw, 9rem);
  font-weight: 400;
  letter-spacing: -0.07em;
  line-height: 0.78;
}

.case-detail__next-link {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  padding-bottom: 0.35rem;
  font-size: var(--type-nav);
}

.case-detail__next-link svg {
  transition: transform 260ms ease;
}

.case-detail__next:hover .case-detail__next-link svg,
.case-detail__next:focus-visible .case-detail__next-link svg {
  transform: translateX(0.4rem);
}

:deep(.audience-fill__line) {
  position: relative;
  display: inline-block;
}

:deep(.audience-fill__line) {
  display: block;
  white-space: nowrap;
}

:deep(.audience-fill__ash) {
  color: color-mix(in srgb, currentColor 30%, transparent);
}

:deep(.audience-fill__ink) {
  position: absolute;
  /* The final display type uses a tight line-height. Extend the clipped ink
     layer downward for descenders such as «у» and «р», while keeping its text
     baseline aligned with the ash layer. */
  inset: 0;
  height: calc(100% + 0.2em);
  color: currentColor;
  will-change: clip-path;
}

@media (max-width: 767.98px) {
  .case-detail__next { height: 20svh; min-height: 20svh; margin-top: 0; flex-direction: column; align-items: flex-start; justify-content: flex-end; gap: var(--space-2); padding-block: var(--space-2); }
  .case-detail__next-content { flex-direction: column; align-items: flex-start; gap: var(--space-3); }
  .case-detail__next-name { max-width: 100%; font-size: clamp(3rem, 13vw, 5rem); }
}

@media (prefers-reduced-motion: reduce) {
  h1,
  .case-detail__meta,
  .case-detail__media {
    transition: none;
  }

  .case-detail__media:not(.case-detail__media--audience) {
    margin-bottom: 0;
  }
}
</style>
