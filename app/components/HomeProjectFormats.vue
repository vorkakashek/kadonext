<script setup lang="ts">
type ProjectFormat = {
  title: string
  price: string
  duration: string
  description: string
  scope: string[]
}

const { t, tm } = useI18n()
const projectFormats = computed(() => tm('home.projectFormats.items') as ProjectFormat[])
const projectFormatsTitle = computed(() => t('home.projectFormats.title'))
const projectFormatsTitleWords = computed(() => (
  projectFormatsTitle.value.trim().split(/\s+/).map(word => Array.from(word))
))
const iconVariants = ['compact', 'signature', 'product'] as const

defineProps<{ surfaceReady?: boolean }>()

const rootEl = ref<HTMLElement | null>(null)
const surfaceEls = ref<HTMLElement[]>([])

function captureSurfaceEls() {
  const next = rootEl.value
    ? Array.from(rootEl.value.querySelectorAll<HTMLElement>('.project-formats__meta-surface'))
    : []
  if (
    next.length === surfaceEls.value.length
    && next.every((element, index) => element === surfaceEls.value[index])
  ) return
  surfaceEls.value = next
}

defineExpose({ rootEl, surfaceEls })

let mobileMedia: MediaQueryList | null = null
let entranceMotionCtx: { revert: () => void } | null = null
let entranceMotionObservers: IntersectionObserver[] = []

function clearEntranceMotion() {
  entranceMotionObservers.forEach(observer => observer.disconnect())
  entranceMotionObservers = []
  entranceMotionCtx?.revert()
  entranceMotionCtx = null
}

async function setupEntranceMotion() {
  clearEntranceMotion()
  const root = rootEl.value
  if (!root) return

  const gsap = (await import('gsap')).default
  const { ScrollTrigger } = await import('gsap/ScrollTrigger')
  gsap.registerPlugin(ScrollTrigger)

  const isMobile = !!mobileMedia?.matches
  const header = root.querySelector<HTMLElement>('.project-formats__header')
  const title = root.querySelector<HTMLElement>('.project-formats__title')
  const titleChars = Array.from(
    root.querySelectorAll<HTMLElement>('.project-formats__title-char'),
  )
  const intro = root.querySelector<HTMLElement>('.project-formats__intro')
  const items = Array.from(
    root.querySelectorAll<HTMLElement>('.project-formats__item'),
  )

  const observeTimeline = (
    trigger: HTMLElement,
    timeline: ReturnType<typeof gsap.timeline>,
  ) => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return
        if (entry.isIntersecting || entry.boundingClientRect.top < 0) timeline.play()
        else timeline.reverse()
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0 },
    )
    observer.observe(trigger)
    entranceMotionObservers.push(observer)
  }

  entranceMotionCtx = gsap.context(() => {
    if (header && titleChars.length) {
      gsap.set(titleChars, { yPercent: 115 })
      if (intro) gsap.set(intro, { autoAlpha: 0, y: 24 })
      const headerReveal = gsap.timeline({
        paused: isMobile,
        scrollTrigger: isMobile
          ? undefined
          : {
              trigger: title ?? header,
              start: 'center bottom',
              toggleActions: 'play none none reverse',
            },
      })
      headerReveal.to(titleChars, {
        yPercent: 0,
        duration: isMobile ? 0.72 : 1.05,
        stagger: isMobile ? 0.025 : 0.05,
        ease: 'power4.out',
      }, 0)
      if (intro) {
        headerReveal.to(intro, {
          autoAlpha: 1,
          y: 0,
          duration: 0.72,
          ease: 'power3.out',
        }, isMobile ? 0.16 : 0.28)
      }
      if (isMobile) observeTimeline(title ?? header, headerReveal)
    }

    items.forEach((item) => {
      const icon = item.querySelector<HTMLElement>('.project-formats__icon')
      const drawParts = Array.from(
        item.querySelectorAll<SVGGeometryElement>('[data-icon-stroke]'),
      )
      const flexLines = Array.from(
        item.querySelectorAll<SVGPathElement>('[data-flex-line]'),
      )
      const dots = Array.from(
        item.querySelectorAll<SVGElement>('[data-icon-dot]'),
      )
      const title = item.querySelector<HTMLElement>('.project-formats__copy h3')
      const description = item.querySelector<HTMLElement>('.project-formats__description')
      const scopeLabel = item.querySelector<HTMLElement>('.project-formats__label')
      const tags = Array.from(
        item.querySelectorAll<HTMLElement>('.project-formats__scope li'),
      )
      const metaLines = Array.from(
        item.querySelectorAll<HTMLElement>('.project-formats__meta > div'),
      )

      gsap.set(item, { '--project-formats-divider-scale': 0 })
      gsap.set([title, description, scopeLabel, ...metaLines].filter(Boolean), {
        autoAlpha: 0,
        y: isMobile ? 28 : 22,
      })
      gsap.set(tags, { autoAlpha: 0, y: 14, scale: 0.96 })
      drawParts.forEach((part) => {
        const length = Math.max(1, part.getTotalLength())
        gsap.set(part, {
          strokeDasharray: length,
          strokeDashoffset: length,
        })
      })
      flexLines.forEach((line) => {
        const fromD = line.dataset.fromD
        if (fromD) gsap.set(line, { attr: { d: fromD } })
      })
      gsap.set(dots, { autoAlpha: 0, scale: 0, transformOrigin: '50% 50%' })

      const itemReveal = gsap.timeline({
        paused: isMobile,
        defaults: { ease: 'power3.out' },
        scrollTrigger: isMobile
          ? undefined
          : {
              trigger: item,
              start: 'top 88%',
              toggleActions: 'play none none reverse',
            },
      })
      itemReveal.to(item, {
        '--project-formats-divider-scale': 1,
        duration: 0.72,
        ease: 'power2.out',
      }, 0)

      drawParts.forEach((part) => {
        const delay = Number.parseFloat(part.dataset.drawDelay ?? '0')
        itemReveal.to(part, {
          strokeDashoffset: 0,
          duration: isMobile ? 0.86 : 1.05,
          ease: 'power2.inOut',
        }, 0.04 + delay)
      })
      flexLines.forEach((line) => {
        const toD = line.dataset.toD
        if (!toD) return
        const delay = Number.parseFloat(line.dataset.drawDelay ?? '0')
        itemReveal.to(line, {
          attr: { d: toD },
          duration: isMobile ? 0.9 : 1.12,
          ease: 'sine.inOut',
        }, 0.04 + delay)
      })
      if (dots.length) {
        itemReveal.to(dots, {
          autoAlpha: 1,
          scale: 1,
          duration: 0.46,
          stagger: 0.11,
          ease: 'back.out(1.8)',
        }, isMobile ? 0.96 : 1.16)
      }
      if (icon) {
        itemReveal.fromTo(icon, { rotate: -1.4 }, {
          rotate: 0,
          duration: 1.15,
          transformOrigin: '50% 50%',
          ease: 'sine.out',
        }, 0)
      }
      itemReveal
        .to(title, { autoAlpha: 1, y: 0, duration: 0.74 }, 0.1)
        .to(description, { autoAlpha: 1, y: 0, duration: 0.72 }, 0.2)
        .to(scopeLabel, { autoAlpha: 1, y: 0, duration: 0.56 }, 0.3)
        .to(tags, {
          autoAlpha: 1,
          y: 0,
          scale: 1,
          duration: 0.52,
          stagger: 0.07,
        }, 0.36)
        .to(metaLines, {
          autoAlpha: 1,
          y: 0,
          duration: 0.64,
          stagger: 0.12,
        }, 0.32)

      if (isMobile) observeTimeline(item, itemReveal)
    })
  }, root)
}

async function onMotionMediaChange() {
  await setupEntranceMotion()
}

onMounted(async () => {
  captureSurfaceEls()
  mobileMedia = window.matchMedia('(max-width: 767.98px)')
  mobileMedia.addEventListener('change', onMotionMediaChange)
  await setupEntranceMotion()
})

watch(projectFormats, async () => {
  await nextTick()
  captureSurfaceEls()
}, { flush: 'post' })

onUnmounted(() => {
  clearEntranceMotion()
  mobileMedia?.removeEventListener('change', onMotionMediaChange)
})
</script>

<template>
  <section
    id="project-formats"
    ref="rootEl"
    class="project-formats pointer-events-auto relative z-10 w-full"
    aria-labelledby="project-formats-title"
  >
    <div class="project-formats__layout">
      <header class="project-formats__header">
        <h2
          id="project-formats-title"
          class="project-formats__title"
          :aria-label="projectFormatsTitle"
        >
          <span class="sr-only">{{ projectFormatsTitle }}</span>
          <span
            v-for="(word, wordIndex) in projectFormatsTitleWords"
            :key="`${word.join('')}-${wordIndex}`"
            class="project-formats__title-word-mask"
            aria-hidden="true"
          >
            <span class="project-formats__title-word-reveal">
              <span
                v-for="(char, charIndex) in word"
                :key="`${char}-${charIndex}`"
                class="project-formats__title-char"
              >{{ char }}</span>
            </span>
          </span>
        </h2>
        <p class="project-formats__intro">
          {{ t('home.projectFormats.intro') }}
        </p>
      </header>

      <div class="project-formats__list">
        <article
          v-for="(format, index) in projectFormats"
          :key="format.title"
          class="project-formats__item"
        >
          <div class="project-formats__item-grid">
            <div class="project-formats__icon" aria-hidden="true">
              <!-- Temporary line signs reserve the final icon footprint. -->
              <svg
                v-if="iconVariants[index] === 'compact'"
                viewBox="20 20 120 120"
                fill="none"
              >
                <rect data-icon-stroke data-draw-delay="0" x="29" y="35" width="102" height="90" rx="13" />
                <path
                  data-icon-stroke
                  data-flex-line
                  data-draw-delay="0.14"
                  data-from-d="M50 61 C70 61 90 61 110 61"
                  data-to-d="M50 61 C67 54 88 68 110 61"
                  d="M50 61 C67 54 88 68 110 61"
                />
                <path
                  data-icon-stroke
                  data-flex-line
                  data-draw-delay="0.06"
                  data-from-d="M50 80 C62 80 75 80 87 80"
                  data-to-d="M50 80 C60 86 75 74 87 80"
                  d="M50 80 C60 86 75 74 87 80"
                />
                <path
                  data-icon-stroke
                  data-flex-line
                  data-draw-delay="0.2"
                  data-from-d="M50 99 C66 99 82 99 99 99"
                  data-to-d="M50 99 C65 93 83 105 99 99"
                  d="M50 99 C65 93 83 105 99 99"
                />
              </svg>
              <svg
                v-else-if="iconVariants[index] === 'signature'"
                viewBox="20 20 120 120"
                fill="none"
              >
                <path
                  data-icon-stroke
                  data-flex-line
                  data-draw-delay="0"
                  data-from-d="M31 108 C48 92 65 84 80 78 C96 72 113 62 129 51"
                  data-to-d="M31 108 C45 54 64 46 80 78 C96 110 111 104 129 51"
                  d="M31 108 C45 54 64 46 80 78 C96 110 111 104 129 51"
                />
                <circle data-icon-dot cx="31" cy="108" r="7" />
                <circle data-icon-dot cx="129" cy="51" r="7" />
              </svg>
              <svg v-else viewBox="20 20 120 120" fill="none">
                <rect data-icon-stroke data-draw-delay="0.02" x="27" y="32" width="106" height="29" rx="8" />
                <rect data-icon-stroke data-draw-delay="0.16" x="27" y="66" width="106" height="29" rx="8" />
                <rect data-icon-stroke data-draw-delay="0.09" x="27" y="100" width="106" height="29" rx="8" />
                <path data-icon-stroke data-draw-delay="0.24" d="M47 47h1M47 81h1M47 115h1M64 47h43M64 81h29M64 115h51" />
              </svg>
            </div>

            <div class="project-formats__copy">
              <h3>{{ format.title }}</h3>
              <p class="project-formats__description">
                {{ format.description }}
              </p>

              <div class="project-formats__scope">
                <p class="project-formats__label">
                  {{ t('home.projectFormats.scopeLabel') }}
                </p>
                <ul>
                  <li v-for="scopeItem in format.scope" :key="scopeItem">
                    {{ scopeItem }}
                  </li>
                </ul>
              </div>
            </div>

            <div class="project-formats__meta-shell">
              <div
                class="project-formats__meta-surface"
                :class="{ 'is-surface-ready': surfaceReady }"
                aria-hidden="true"
              />
              <dl class="project-formats__meta">
                <div>
                  <dt>{{ t('home.projectFormats.priceLabel') }}</dt>
                  <dd>{{ format.price }}</dd>
                </div>
                <div>
                  <dt>{{ t('home.projectFormats.durationLabel') }}</dt>
                  <dd>{{ format.duration }}</dd>
                </div>
              </dl>
            </div>
          </div>
        </article>
      </div>
    </div>
  </section>
</template>

<style scoped>
.project-formats {
  padding: calc(var(--space-section) * 0.7) var(--layout-margin-content)
    calc(var(--space-section) * 0.2);
}

.project-formats__layout {
  display: grid;
  width: 100%;
  max-width: var(--layout-content-max);
  margin-inline: auto;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  column-gap: var(--layout-gutter);
}

.project-formats__header,
.project-formats__list {
  grid-column: 1 / -1;
}

.project-formats__header {
  padding-bottom: clamp(4rem, 8vw, 8rem);
}

.project-formats__title {
  margin: 0;
  font-size: clamp(3.25rem, 8.5vw, 8rem);
  font-weight: 400;
  letter-spacing: -0.065em;
  line-height: 0.88;
}

.project-formats__title-word-mask {
  display: inline-block;
  overflow: hidden;
  padding-top: 0.08em;
  padding-right: 0.04em;
  padding-bottom: 0.12em;
  margin-bottom: -0.12em;
  vertical-align: bottom;
}

.project-formats__title-word-mask:not(:last-child) {
  margin-right: 0.22em;
}

.project-formats__title-word-reveal,
.project-formats__title-char {
  display: inline-block;
}

.project-formats__title-char {
  will-change: transform;
}

.project-formats__intro {
  max-width: 38rem;
  margin: var(--space-2) 0 0;
  font-size: var(--type-lead);
  letter-spacing: -0.025em;
  line-height: 1.3;
}

.project-formats__item {
  --project-formats-divider-scale: 1;
  position: relative;
}

.project-formats__item::before {
  position: absolute;
  z-index: 2;
  top: 0;
  right: 0;
  left: 0;
  height: 1px;
  background: color-mix(in srgb, var(--palette-ink) 18%, transparent);
  content: '';
  transform: scaleX(var(--project-formats-divider-scale));
  transform-origin: left center;
}

.project-formats__item-grid {
  display: grid;
  min-height: min(46rem, 72svh);
  padding-block: clamp(4.5rem, 8vw, 8rem);
  grid-template-columns: repeat(12, minmax(0, 1fr));
  column-gap: var(--layout-gutter);
  align-items: start;
}

.project-formats__icon {
  width: clamp(6.75rem, 10.5vw, 10.5rem);
  aspect-ratio: 1;
  grid-column: 1 / span 2;
  color: color-mix(in srgb, var(--palette-ink) 76%, transparent);
  transform-origin: center;
}

.project-formats__icon svg {
  display: block;
  width: 100%;
  height: 100%;
  overflow: visible;
  stroke: currentColor;
  stroke-width: 1.6;
  stroke-linecap: round;
  stroke-linejoin: round;
  vector-effect: non-scaling-stroke;
}

.project-formats__copy {
  grid-column: 4 / span 6;
}

.project-formats__copy h3 {
  max-width: 12ch;
  margin: 0;
  font-size: clamp(2.125rem, 4.15vw, 4.25rem);
  font-weight: 500;
  letter-spacing: -0.06em;
  line-height: 0.95;
}

.project-formats__description {
  max-width: 43rem;
  margin: clamp(1.75rem, 3vw, 3rem) 0 0;
  font-size: var(--type-lead);
  letter-spacing: -0.025em;
  line-height: 1.42;
}

.project-formats__scope {
  max-width: 43rem;
  margin-top: clamp(3rem, 5vw, 5rem);
}

.project-formats__label,
.project-formats__meta dt {
  margin: 0;
  color: color-mix(in srgb, var(--palette-ink) 56%, transparent);
  font-size: var(--type-meta);
  letter-spacing: 0.04em;
  line-height: 1.2;
  text-transform: lowercase;
}

.project-formats__scope ul {
  display: flex;
  margin: 1.2rem 0 0;
  padding: 0;
  flex-wrap: wrap;
  gap: clamp(0.45rem, 0.7vw, 0.7rem);
  list-style: none;
}

.project-formats__scope li {
  padding: clamp(0.62rem, 0.85vw, 0.82rem) clamp(0.82rem, 1.1vw, 1.1rem);
  border-radius: 999px;
  background: var(--palette-ink);
  color: var(--palette-milk, #f5f1e8);
  font-size: clamp(0.875rem, 1vw, 1rem);
  letter-spacing: -0.01em;
  line-height: 1;
  white-space: nowrap;
}

.project-formats__meta-shell {
  position: relative;
  min-width: 0;
  aspect-ratio: 1;
  grid-column: 10 / -1;
  align-self: start;
  isolation: isolate;
}

.project-formats__meta-surface {
  position: absolute;
  z-index: -1;
  inset: 0;
  overflow: hidden;
  border-radius: var(--flow-surface-radius, 24px);
  background: var(--palette-stone);
}

.project-formats__meta-surface.is-surface-ready {
  background: transparent;
}

.project-formats__meta-surface[data-flow-surface-proxy-active] {
  background: var(--palette-stone);
}

.project-formats__meta {
  display: flex;
  height: 100%;
  margin: 0;
  padding: clamp(0.75rem, 1.1vw, 1.125rem) clamp(1.5rem, 2.2vw, 2.25rem);
  flex-direction: column;
  justify-content: center;
  gap: clamp(0.625rem, 1vw, 1rem);
}

.project-formats__meta dd {
  margin: 0.65rem 0 0;
  font-size: clamp(1.4rem, 2vw, 2rem);
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.035em;
  line-height: 1.15;
}

@media (min-width: 768px) {
  .project-formats__header,
  .project-formats__list {
    grid-column: 3 / span 8;
  }
}

@media (max-width: 767.98px) {
  .project-formats {
    padding-block: calc(var(--space-section) * 0.75)
      calc(var(--space-section) * 0.15);
  }

  .project-formats__header {
    padding-bottom: clamp(3.5rem, 16vw, 5.5rem);
  }

  .project-formats__title {
    font-size: clamp(3.5rem, 17vw, 5.75rem);
  }

  .project-formats__item-grid {
    min-height: 0;
    padding-block: clamp(4rem, 18vw, 6rem);
    grid-template-columns:
      minmax(0, clamp(4.1rem, 20.4vw, 5.95rem))
      minmax(0, 1fr);
    column-gap: clamp(1rem, 4vw, 1.5rem);
  }

  .project-formats__icon {
    width: 100%;
    margin-bottom: 0;
    grid-column: 1;
    grid-row: 1;
    align-self: center;
  }

  .project-formats__copy,
  .project-formats__meta-shell {
    grid-column: 1 / -1;
  }

  .project-formats__copy {
    display: contents;
  }

  .project-formats__copy h3 {
    max-width: 11ch;
    font-size: clamp(2rem, 9.25vw, 3.1rem);
    grid-column: 2;
    grid-row: 1;
    align-self: center;
    order: 1;
    text-wrap: balance;
  }

  .project-formats__description {
    font-size: var(--type-body);
    grid-column: 1 / -1;
    grid-row: 3;
    order: 3;
  }

  .project-formats__scope {
    grid-column: 1 / -1;
    grid-row: 4;
    order: 4;
  }

  .project-formats__scope li {
    max-width: 100%;
    line-height: 1.25;
    white-space: normal;
  }

  .project-formats__meta-shell {
    aspect-ratio: auto;
    margin-top: clamp(2rem, 8vw, 3rem);
    grid-row: 2;
    order: 2;
  }

  .project-formats__meta {
    display: grid;
    height: auto;
    padding: clamp(1rem, 4vw, 1.5rem);
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: auto auto;
    gap: clamp(1rem, 5vw, 1.5rem);
  }

  .project-formats__meta dd {
    margin-top: 0.325rem;
    font-size: clamp(1.3rem, 6vw, 1.65rem);
  }
}
</style>
