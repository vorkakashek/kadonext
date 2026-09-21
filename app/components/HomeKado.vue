<script setup lang="ts">
/**
 * Home — «Кадо́ — путь цветов.»
 * Grid: empty col 1 & 12 · photo cols 2–6 · text cols 7–11.
 * Body: line-by-line ash→ink fill on scroll (1.5× type).
 * Mobile surface waypoints: stone → term → Kado word → center square
 * (square hop starts when Kado hits top 20%).
 */
const BRAND_PATTERN = /^kado\b/i
const { t } = useI18n()
const bodyText = computed(() => t('home.kado.body'))
/** Scroll lag for the whole fill timeline. */
const FILL_SCRUB = 1.1
/** Gap between line starts (= line duration so N+1 waits until N finishes). */
const FILL_LINE_STAGGER = 1
const section = ref<HTMLElement | null>(null)
const stoneColumnEl = ref<HTMLElement | null>(null)
const bodyParallaxEl = ref<HTMLElement | null>(null)
/** Stone morph target (desktop end + mobile waypoint 1). */
const surfaceTarget = ref<HTMLElement | null>(null)
/** Rock image — scroll marker «top 10%». */
const stoneEl = ref<HTMLElement | null>(null)
/** Title + phonetic block — mobile waypoint after stone. */
const termTarget = ref<HTMLElement | null>(null)
/** First word “Kado” — mobile waypoint with pad (set after line-fill build). */
const kadoWord = ref<HTMLElement | null>(null)
const topFocusEl = ref<HTMLElement | null>(null)
const bodyFocusEl = ref<HTMLElement | null>(null)
const bodyEl = ref<HTMLElement | null>(null)

const { canvasMotionPaused, open: pageCanvasOpen, busy: pageCanvasBusy, surfaceOn, heroGlRevealBusy } = usePageCanvas()
const heroIntroSettled = useState('home-hero-intro-settled', () => false)

defineExpose({
  section,
  surfaceTarget,
  stoneEl,
  termTarget,
  kadoWord,
  bodyFocusEl,
})

useViewportFocusRefs([stoneEl], {
  blur: 16,
  delay: 0.14,
  duration: 0.75,
  stagger: 0.1,
})

let fillCtx: { revert: () => void } | null = null
let levitateCtx: { revert: () => void } | null = null
let levitationSetupBusy = false
let parallaxMatchMedia: gsap.MatchMedia | null = null
let gsapMod: typeof import('gsap').default | null = null
let stMod: typeof import('gsap/ScrollTrigger').ScrollTrigger | null = null
let resizeObserver: ResizeObserver | null = null
let rebuildTimer = 0
let componentUnmounted = false
let localeFillRebuildPending = false

async function waitForHeroIntro(maxMs = 4200) {
  if (heroIntroSettled.value) return
  await new Promise<void>((resolve) => {
    let done = false
    let stop = () => {}
    const finish = () => {
      if (done) return
      done = true
      stop()
      window.clearTimeout(safety)
      resolve()
    }
    stop = watch(heroIntroSettled, (settled) => {
      if (settled) finish()
    })
    const safety = window.setTimeout(() => {
      heroIntroSettled.value = true
      finish()
    }, maxMs)
  })
}

async function waitForEnhancementIdle() {
  await new Promise<void>((resolve) => {
    if (typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(() => resolve(), { timeout: 900 })
    } else {
      window.setTimeout(resolve, 120)
    }
  })
}

/** Measure word tops → wrap each visual line (ash base + ink clip L→R). */
function buildLineFill(host: HTMLElement): HTMLElement[] {
  host.textContent = ''
  // Keep previous word el until the new brand node exists — nulling it rebuilt the
  // whole Flow Surface corridor and could hide hero on first paint.
  const measure = document.createElement('span')
  measure.style.whiteSpace = 'normal'
  host.appendChild(measure)

  const parts = bodyText.value.split(/(\s+)/).filter((p) => p.length)
  const wordSpans: HTMLSpanElement[] = []
  for (const part of parts) {
    const span = document.createElement('span')
    span.textContent = part
    measure.appendChild(span)
    wordSpans.push(span)
  }

  const lines: string[] = []
  let buf = ''
  let lineTop = Number.NaN
  for (const span of wordSpans) {
    const top = span.offsetTop
    if (!Number.isNaN(lineTop) && Math.abs(top - lineTop) > 1) {
      lines.push(buf)
      buf = ''
    }
    lineTop = top
    buf += span.textContent ?? ''
  }
  if (buf) lines.push(buf)

  host.textContent = ''
  const inkEls: HTMLElement[] = []
  for (let i = 0; i < lines.length; i++) {
    let lineText = lines[i]!
    const row = document.createElement('span')
    row.className = 'kado-body__line'

    const brandMatch = i === 0 ? BRAND_PATTERN.exec(lineText) : null
    if (brandMatch) {
      const brand = brandMatch[0]
      const wrap = document.createElement('span')
      wrap.className = 'kado-brand'
      const pin = document.createElement('span')
      pin.className = 'kado-surface-pin kado-surface-pin--pad'
      pin.setAttribute('data-flow-pin', 'word')
      pin.setAttribute('aria-hidden', 'true')
      const label = document.createElement('span')
      label.className = 'kado-brand__text'
      label.textContent = brand
      wrap.append(pin, label)
      row.appendChild(wrap)
      kadoWord.value = wrap
      lineText = lineText.slice(brand.length).replace(/^\s+/, '')
      // Explicit space node — leading space inside the next span can collapse.
      if (lineText.length) row.appendChild(document.createTextNode(' '))
    }

    if (lineText.length) {
      const run = document.createElement('span')
      run.className = 'kado-body__run'

      const ash = document.createElement('span')
      ash.className = 'kado-body__ash'
      ash.textContent = lineText

      const ink = document.createElement('span')
      ink.className = 'kado-body__ink'
      ink.setAttribute('aria-hidden', 'true')
      ink.textContent = lineText
      ink.style.clipPath = 'inset(0 100% 0 0)'

      run.append(ash, ink)
      row.appendChild(run)
      inkEls.push(ink)
    }

    host.appendChild(row)
  }
  return inkEls
}

/** Ignore scrollbar / chrome jitter — only real column reflow should rebuild lines. */
const MIN_REBUILD_WIDTH_DELTA = 48

function hostFillIntact() {
  const host = bodyEl.value
  return !!host?.querySelector('.kado-body__ink')
}

async function setupLineFill(force = false) {
  if (!force && canvasMotionPaused()) return
  if (!force && fillCtx && hostFillIntact()) {
    try {
      stMod?.update()
    } catch {
      /* ignore */
    }
    return
  }

  fillCtx?.revert()
  fillCtx = null

  const host = bodyEl.value
  const trigger = bodyFocusEl.value
  if (!host || !trigger) return

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    host.textContent = bodyText.value
    host.style.color = 'var(--palette-ink)'
    kadoWord.value = null
    return
  }

  const inks = buildLineFill(host)
  if (!inks.length) return

  if (!gsapMod || !stMod) {
    gsapMod = (await import('gsap')).default
    const st = await import('gsap/ScrollTrigger')
    stMod = st.ScrollTrigger
    gsapMod.registerPlugin(stMod)
  }
  const gsap = gsapMod

  fillCtx = gsap.context(() => {
    const tl = gsap.timeline({
      scrollTrigger: {
        trigger,
        start: 'top 85%',
        end: 'bottom 40%',
        scrub: FILL_SCRUB,
        invalidateOnRefresh: false,
      },
    })
    inks.forEach((ink, i) => {
      tl.fromTo(
        ink,
        { clipPath: 'inset(0px 100% 0px 0px)' },
        { clipPath: 'inset(0px 0% 0px 0px)', ease: 'none', duration: 1 },
        i * FILL_LINE_STAGGER,
      )
    })
  }, section.value ?? undefined)

  try {
    stMod?.update()
  } catch {
    /* ignore */
  }
}

let lastHostWidth = 0
let fillMountedAt = 0

function scheduleRebuild() {
  if (!heroIntroSettled.value) return
  if (canvasMotionPaused()) return
  // Skip RO rebuilds during the first quiet second after SPA mount.
  if (fillMountedAt && performance.now() - fillMountedAt < 1200) return
  if (rebuildTimer) window.clearTimeout(rebuildTimer)
  rebuildTimer = window.setTimeout(() => {
    rebuildTimer = 0
    void setupLineFill(true)
  }, 120)
}

/** Home often mounts under the menu overlay during a hop — build after unlock. */
async function waitHeroGlReveal(maxMs = 2400) {
  const deadline = performance.now() + maxMs
  while (heroGlRevealBusy.value && performance.now() < deadline) {
    await new Promise<void>((r) => {
      requestAnimationFrame(() => r())
    })
  }
}

async function ensureLineFill() {
  if (hostFillIntact()) return
  await waitForHeroIntro()
  await waitHeroGlReveal()
  if (canvasMotionPaused()) return
  await setupLineFill(true)
}

async function setupStoneLevitation() {
  // Menu close can call this again even though the existing infinite tweens
  // never paused. Preserve their phase instead of restarting from frame zero.
  if (levitateCtx || levitationSetupBusy) return

  if (typeof window === 'undefined') return
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  const el = stoneEl.value
  if (!el) return

  levitationSetupBusy = true
  try {
    const gsap = (await import('gsap')).default

    levitateCtx = gsap.context(() => {
      // Multi-harmonic buoyancy: each axis has its own phase & coprime period
      // with smooth sine.inOut easing for physical, weightless floating.

      // 1. Vertical float (main breathing bob)
      gsap.fromTo(
        el,
        { y: 8 },
        {
          y: -14,
          duration: 3.4,
          ease: 'sine.inOut',
          yoyo: true,
          repeat: -1,
        },
      )

      // 2. Horizontal drift (smooth lateral sway)
      gsap.fromTo(
        el,
        { x: -7 },
        {
          x: 8,
          duration: 4.7,
          ease: 'sine.inOut',
          yoyo: true,
          repeat: -1,
        },
      )

      // 3. Subtle 2D roll / tilt around center of gravity
      gsap.fromTo(
        el,
        { rotation: -1.6 },
        {
          rotation: 2.2,
          duration: 5.3,
          ease: 'sine.inOut',
          yoyo: true,
          repeat: -1,
        },
      )

      // 4. Subtle 3D pitch (tilt front/back)
      gsap.fromTo(
        el,
        { rotationX: -2.5 },
        {
          rotationX: 3.2,
          duration: 4.1,
          ease: 'sine.inOut',
          yoyo: true,
          repeat: -1,
        },
      )

      // 5. Subtle 3D yaw (gentle turn towards camera light)
      gsap.fromTo(
        el,
        { rotationY: -3 },
        {
          rotationY: 3.5,
          duration: 5.9,
          ease: 'sine.inOut',
          yoyo: true,
          repeat: -1,
        },
      )
    }, el)
  } finally {
    levitationSetupBusy = false
  }
}

/**
 * Desktop entry: stone, term and fill each own one scrubbed corridor, all keyed
 * to the stone crossing the viewport. Copy fades are part of those timelines;
 * there are no separate time-based reveal or slide-up tweens.
 */
async function setupSectionParallax() {
  parallaxMatchMedia?.revert()
  parallaxMatchMedia = null

  const host = section.value
  const stoneColumn = stoneColumnEl.value
  const bodyParallax = bodyParallaxEl.value
  const topCopy = topFocusEl.value
  const bodyCopy = bodyFocusEl.value
  if (!host || !stoneColumn || !bodyParallax || !topCopy || !bodyCopy) return

  if (!gsapMod || !stMod) {
    gsapMod = (await import('gsap')).default
    const st = await import('gsap/ScrollTrigger')
    stMod = st.ScrollTrigger
  }
  const gsap = gsapMod
  const ScrollTrigger = stMod
  gsap.registerPlugin(ScrollTrigger)

  parallaxMatchMedia = gsap.matchMedia()
  parallaxMatchMedia.add(
    '(min-width: 768px) and (prefers-reduced-motion: no-preference)',
    () => {
      const corridorProgressAtSurfaceDock = (startY: number) => {
        const viewportHeight = Math.max(1, window.innerHeight)
        const scrollY = window.scrollY || 0
        const hostBox = host.getBoundingClientRect()
        const hostTopY = hostBox.top + scrollY
        const endY = hostTopY + host.offsetHeight
        const surfaceDockY = hostTopY + host.offsetHeight / 2 - viewportHeight / 2
        const progress = (surfaceDockY - startY) / Math.max(1, endY - startY)
        return Math.min(0.9, Math.max(0.1, progress))
      }

      const shiftForSurfaceDock = (viewportShare: number, startY: number) => {
        return -window.innerHeight * viewportShare / corridorProgressAtSurfaceDock(startY)
      }

      const stoneStartY = (stoneFraction: number) => {
        const box = stoneColumn.getBoundingClientRect()
        const activeY = Number(gsap.getProperty(stoneColumn, 'y')) || 0
        return box.top - activeY + (window.scrollY || 0)
          + box.height * stoneFraction - window.innerHeight
      }

      const stoneShift = () => shiftForSurfaceDock(0.12, stoneStartY(0.5))
      const termShift = () => shiftForSurfaceDock(0.27, stoneStartY(0.25))
      const fillShift = () => shiftForSurfaceDock(0.11, stoneStartY(0.75))
      const termEntryOffset = () => {
        const stoneBox = stoneColumn.getBoundingClientRect()
        const termBox = topCopy.getBoundingClientRect()
        const stoneActiveY = Number(gsap.getProperty(stoneColumn, 'y')) || 0
        const termActiveY = Number(gsap.getProperty(topCopy, 'y')) || 0
        const stoneQuarterY = stoneBox.top - stoneActiveY + stoneBox.height * 0.25
        const termTopY = termBox.top - termActiveY
        return Math.max(0, stoneQuarterY - termTopY)
      }
      const termEndY = () => termEntryOffset() + termShift()
      const termRevealEndY = () => termEntryOffset() + termShift() * 0.1
      const fillBaseEntryOffset = () => {
        const stoneBox = stoneColumn.getBoundingClientRect()
        const fillBox = bodyCopy.getBoundingClientRect()
        const stoneActiveY = Number(gsap.getProperty(stoneColumn, 'y')) || 0
        const fillParentY = Number(gsap.getProperty(bodyParallax, 'y')) || 0
        const fillActiveY = Number(gsap.getProperty(bodyCopy, 'y')) || 0
        const stoneThreeQuarterY = stoneBox.top - stoneActiveY + stoneBox.height * 0.75
        const fillTopY = fillBox.top - fillParentY - fillActiveY
        return stoneThreeQuarterY - fillTopY - window.innerHeight * 0.2
      }
      const fillEntryOffset = () => fillBaseEntryOffset() * 1.5
      const fillEndY = () => fillBaseEntryOffset() + fillShift()

      gsap.fromTo(
        stoneColumn,
        { y: 0 },
        {
          y: stoneShift,
          ease: 'none',
          scrollTrigger: {
            trigger: stoneColumn,
            start: 'center bottom',
            endTrigger: host,
            end: 'bottom top',
            // Lenis already supplies the scroll easing and FlowSurface owns its
            // own bounded lag. A third scrub tail moves the waypoint after the
            // Surface has sampled it, producing the visible under-run at KADO.
            scrub: true,
            invalidateOnRefresh: true,
          },
        },
      )

      const termTimeline = gsap.timeline({
        scrollTrigger: {
          trigger: stoneColumn,
          start: '25% bottom',
          endTrigger: host,
          end: 'bottom top',
          scrub: 0.14,
          invalidateOnRefresh: true,
        },
      })

      termTimeline
        .fromTo(
          topCopy,
          { y: termEntryOffset },
          { y: termRevealEndY, duration: 0.14, ease: 'none' },
          0,
        )
        .to(
          topCopy,
          { y: termEndY, duration: 0.86, ease: 'none' },
          0.14,
        )
        .fromTo(
          topCopy,
          { autoAlpha: 0 },
          { autoAlpha: 1, duration: 0.14, ease: 'none' },
          0,
        )

      const fillTimeline = gsap.timeline({
        scrollTrigger: {
          trigger: stoneColumn,
          start: '75% bottom',
          endTrigger: host,
          end: 'bottom top',
          scrub: 0.24,
          invalidateOnRefresh: true,
        },
      })

      fillTimeline
        .fromTo(
          bodyParallax,
          { y: fillEntryOffset },
          { y: fillEndY, duration: 1, ease: 'none' },
          0,
        )
        .fromTo(
          bodyCopy,
          { autoAlpha: 0 },
          { autoAlpha: 1, duration: 0.22, ease: 'none' },
          0,
        )

    },
  )

  // If scroll restoration or a fast wheel step already moved the document,
  // commit the correct scrub poses in this same setup turn.
  ScrollTrigger.update()
}

watch(
  () => pageCanvasOpen.value || pageCanvasBusy.value || surfaceOn.value,
  async (active) => {
    if (active) return
    await nextTick()
    requestAnimationFrame(() => {
      if (localeFillRebuildPending) {
        localeFillRebuildPending = false
        void setupLineFill(true).then(() => stMod?.refresh())
      } else {
        void ensureLineFill()
      }
      void setupStoneLevitation()
    })
  },
)

watch(bodyText, async () => {
  if (componentUnmounted || typeof window === 'undefined') return
  await nextTick()
  if (componentUnmounted) return
  // The menu pins the page by moving the body and resetting window.scrollY.
  // Building ScrollTrigger in that temporary coordinate space produces wrong
  // line progress. Vue has already replaced the old imperative spans, so the
  // close watcher above can safely rebuild once the real scroll is restored.
  if (canvasMotionPaused()) {
    localeFillRebuildPending = true
    return
  }
  localeFillRebuildPending = false
  await setupLineFill(true)
  if (componentUnmounted) return
  stMod?.refresh()
}, { flush: 'post' })

onMounted(async () => {
  componentUnmounted = false
  fillMountedAt = performance.now()
  await nextTick()
  // Critical layout motion must exist before the preloader unlocks scrolling.
  // Waiting for Hero intro + idle here let fast visitors cross Kado first and
  // made ScrollTrigger apply its current pose as a visible late jump.
  await setupSectionParallax()
  if (componentUnmounted) return
  // Levitation is part of the stone's stable resting state, not a deferred
  // enhancement. Start it before Hero/idle-gated text work so a fast visitor
  // never sees the stone begin floating halfway through the Kado section.
  void setupStoneLevitation()
  // Hash entries need the mobile word waypoint before the Surface's first
  // frame, rather than after an offscreen Hero entrance and idle delay.
  const sectionEntry = !!window.location.hash
  if (sectionEntry) {
    await setupLineFill(true)
  } else {
    await waitForHeroIntro()
    await waitForEnhancementIdle()
  }
  if (componentUnmounted) return
  await ensureLineFill()
  if (componentUnmounted) return
  lastHostWidth = bodyFocusEl.value?.clientWidth ?? 0
  if (bodyFocusEl.value) {
    resizeObserver = new ResizeObserver(() => {
      const w = bodyFocusEl.value?.clientWidth ?? 0
      if (Math.abs(w - lastHostWidth) < MIN_REBUILD_WIDTH_DELTA) return
      lastHostWidth = w
      scheduleRebuild()
    })
    resizeObserver.observe(bodyFocusEl.value)
  }
})

onUnmounted(() => {
  componentUnmounted = true
  if (rebuildTimer) window.clearTimeout(rebuildTimer)
  resizeObserver?.disconnect()
  fillCtx?.revert()
  levitateCtx?.revert()
  levitateCtx = null
  parallaxMatchMedia?.revert()
  parallaxMatchMedia = null
})
</script>

<template>
  <section
    ref="section"
    class="kado pointer-events-auto relative w-full"
    :style="{
      paddingInline: 'var(--layout-margin-content)',
    }"
  >
    <div
      class="kado-layout relative mx-auto grid w-full"
      :style="{
        maxWidth: 'var(--layout-content-max)',
        gridTemplateColumns: 'repeat(12, minmax(0, 1fr))',
        columnGap: 'var(--layout-gutter)',
        rowGap: 'var(--space-block)',
      }"
    >
      <div
        ref="stoneColumnEl"
        class="kado-stone-column relative z-10 col-span-12 flex justify-center md:col-span-5 md:col-start-2"
      >
        <div class="kado-stone-wrap relative w-fit max-w-full">
          <div
            ref="surfaceTarget"
            class="kado-surface-target pointer-events-none absolute left-1/2 top-[10%] -z-10 -translate-x-1/2"
            aria-hidden="true"
          />
          <picture class="contents">
            <source
              type="image/avif"
              srcset="/home/rock-320.avif 320w, /home/rock-480.avif 480w, /home/rock-512.avif 512w, /home/rock-640.avif 640w, /home/rock-854.avif 854w, /home/rock-1088.avif 1088w"
              sizes="(max-width: 767px) 70vw, 36vw"
            >
            <source
              type="image/webp"
              srcset="/home/rock-320.webp 320w, /home/rock-480.webp 480w, /home/rock-512.webp 512w, /home/rock-640.webp 640w, /home/rock-854.webp 854w, /home/rock-1088.webp 1088w"
              sizes="(max-width: 767px) 70vw, 36vw"
            >
            <img
              ref="stoneEl"
              src="/home/rock.webp"
              alt=""
              aria-hidden="true"
              class="kado-focus kado-stone relative z-10 mx-auto h-auto max-h-[70vh] w-auto max-w-full object-contain"
              width="1088"
              height="2109"
              loading="lazy"
              decoding="async"
              fetchpriority="low"
            >
          </picture>
        </div>
      </div>

      <div
        class="kado-copy-column relative z-10 col-span-12 md:col-span-5 md:col-start-7 md:self-stretch"
      >
        <div
          class="kado-copy flex flex-col gap-[var(--space-block)] md:absolute md:inset-x-0 md:top-[10%] md:h-[60%] md:gap-0"
        >
          <div
            ref="topFocusEl"
            class="kado-text-reveal grid w-full text-forest"
            :style="{
              gridTemplateColumns: 'repeat(6, minmax(0, 1fr))',
              columnGap: 'var(--layout-gutter)',
            }"
          >
            <div
              ref="termTarget"
              class="kado-term col-span-6"
            >
              <div
                class="kado-surface-pin kado-surface-pin--pad"
                data-flow-pin="term"
                aria-hidden="true"
              />
              <h2 class="kado-title">
                {{ t('home.kado.title') }}
              </h2>
              <p class="kado-phonetic">
                [/ ka-dō]
              </p>
            </div>
            <p class="kado-deck col-span-6 md:col-span-4 md:col-start-2">
              {{ t('home.kado.definition') }}
            </p>
          </div>

          <div
            ref="bodyParallaxEl"
            class="kado-body-parallax mt-auto w-full"
          >
            <div
              ref="bodyFocusEl"
              class="kado-body-wrap kado-text-reveal w-full"
            >
              <p
                ref="bodyEl"
                class="kado-body relative w-full"
              >{{ bodyText }}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.kado {
  padding-top: var(--space-section);
  padding-bottom: calc(var(--kado-bottom-space, var(--space-block)) * 2);
}

@media (max-width: 767.98px) {
  .kado {
    --kado-bottom-space: calc(var(--space-block) * 2);
  }
}

@media (min-width: 768px) {
  .kado {
    --kado-word-compensation: 8svh;

    display: flex;
    min-height: var(--app-screen);
    align-items: center;
    padding-block: clamp(var(--space-block), 10svh, var(--space-section));
  }

  .kado-layout {
    flex: none;
  }

  .kado-stone-column,
  .kado-body-parallax {
    will-change: transform;
  }

  .kado-text-reveal {
    will-change: transform, opacity;
  }
}

@media (min-width: 768px) and (prefers-reduced-motion: no-preference) {
  .kado {
    /* The slower copy column owns the visual bottom edge of the section. */
    margin-bottom: calc(-1 * var(--kado-word-compensation));
  }
}

.kado-surface-target {
  /* Mobile: +4 cols vs desktop rest pose (4 → 8). */
  width: var(--layout-span-8);
  height: 80%;
}

@media (min-width: 768px) {
  .kado-surface-target {
    width: var(--layout-span-4);
  }
}

.kado-stone-wrap {
  perspective: 1200px;
}

.kado-stone {
  transform-origin: 50% 62%;
  will-change: transform, filter, opacity;
}

.kado-focus {
  will-change: filter, opacity;
}

.kado-term {
  position: relative;
  display: flex;
  flex-direction: column;
  /* Mobile: half the previous 12px title↔phonetic gap. */
  row-gap: 6px;
  overflow: visible;
}

:deep(.kado-surface-pin) {
  position: absolute;
  inset: 0;
  z-index: 0;
  overflow: hidden;
  border-radius: var(--flow-surface-radius, 24px);
  background: var(--semantic-bg-surface, var(--palette-stone));
  opacity: 0;
  pointer-events: none;
}

:deep(.kado-surface-pin)::after {
  position: absolute;
  inset: 0;
  background-image: var(--home-surface-grain);
  background-position: 0 0;
  background-repeat: repeat;
  background-size: 224px 224px;
  content: '';
  mix-blend-mode: soft-light;
  opacity: 0.2;
}

:deep(.kado-surface-pin[data-flow-surface-proxy-active]) {
  opacity: 1;
}

@media (max-width: 767.98px) {
  :deep(.kado-surface-pin)::after {
    background-size: 176px 176px;
  }
}

:deep(.kado-surface-pin--pad) {
  inset: calc(-1 * var(--layout-margin));
}

.kado-title,
.kado-phonetic {
  position: relative;
  z-index: 1;
}

@media (min-width: 768px) {
  .kado-term {
    row-gap: 12px;
  }
}

.kado-title {
  font-size: var(--type-slogan);
  font-weight: 600;
  letter-spacing: -0.02em;
  line-height: 1.15;
}

.kado-phonetic {
  font-size: var(--type-nav);
  font-weight: 400;
  letter-spacing: -0.01em;
  line-height: 1.3;
  opacity: 0.72;
}

.kado-deck {
  margin-top: 12px;
  font-size: var(--type-lead);
  font-weight: 400;
  letter-spacing: -0.02em;
  line-height: 1.35;
}

.kado-body-wrap {
  overflow: visible;
}

.kado-body {
  font-size: calc(var(--type-slogan) * 1.5);
  font-weight: 400;
  letter-spacing: -0.02em;
  line-height: 1.25;
  overflow: visible;
}

@media (min-width: 768px) {
  .kado-body {
    font-size: var(--type-slogan);
  }
}

.kado-body :deep(.kado-body__line) {
  position: relative;
  display: block;
}

.kado-body :deep(.kado-body__run) {
  position: relative;
  display: inline-block;
}

.kado-body :deep(.kado-body__ash) {
  /* Lighter than ash so ink fill reads clearly on sand */
  color: color-mix(in srgb, var(--palette-ash) 32%, var(--palette-sand));
}

.kado-body :deep(.kado-body__ink) {
  position: absolute;
  inset: 0;
  color: var(--palette-ink);
  clip-path: inset(0 100% 0 0);
  pointer-events: none;
}

.kado-body :deep(.kado-brand) {
  position: relative;
  display: inline-block;
  color: var(--palette-ink);
}

.kado-body :deep(.kado-brand__text) {
  position: relative;
  z-index: 1;
}
</style>
