<script setup lang="ts">
/**
 * Brand preloader — ring + orbiting sector + odometer synced to one orbit.
 * First visit: one lap, % runs 00→99 with that lap, then expand → pinch → iris.
 * Repeat / warm cache: skip the orbit — quick % + expand exit.
 */
const preload = useBrandPreload()
const route = useRoute()
const { t } = useI18n()
const heroWebglPrebootRequested = useState<boolean>(
  'home-hero-webgl-preboot-requested',
  () => false,
)
const heroWebglBooted = useState<boolean>('home-hero-webgl-booted', () => false)
const heroWebglLit = useState<boolean>('home-hero-webgl-lit', () => false)

const rootEl = ref<HTMLElement | null>(null)
const markEl = ref<HTMLElement | null>(null)
const pctEl = ref<HTMLElement | null>(null)
const flyerEl = ref<SVGGElement | null>(null)
const arcEl = ref<SVGPathElement | null>(null)

const reduced = ref(false)
const exiting = ref(false)
const liteExit = ref(false)
const connectionOptimized = ref(false)
const show = ref(true)
const liteExitDurationMs = ref(920)
/** Odometer — driven by lap-1 orbit progress (not a slow post-queue). */
const shownPct = ref(0)
const tensDigit = computed(() => Math.floor(shownPct.value / 10))
const onesDigit = computed(() => shownPct.value % 10)
const percentLabel = computed(() => shownPct.value)

const RING_R = 54.675
const STROKE = 27
/** Flying macron sector — 10% thinner than the ring. */
const ARC_STROKE = STROKE * 0.9
const RING_GAP = 8
const RING_OUTER = RING_R + STROKE / 2
const ORBIT_R = RING_OUTER + RING_GAP + ARC_STROKE / 2
const APEX = -Math.PI / 2
/** Brief beat after extra orbits — was 3s and made cold visits feel stuck at 99%. */
const HOLD_S = 0.08
/** One readable brand orbit without holding the first useful paint behind it. */
const LAP1_DIVE_S = 0.3
const LAP1_RISE_S = 0.18
/** Warm revisit — odometer sprint before expand. */
const WARM_PCT_S = 0.16
/** Compact exit beats: the complete cold reveal should fit inside the LCP budget. */
const SETTLE_S = 0.07
const EXPAND_S = 0.16
const STROKE_FILL_S = 0.11
const PEAK_HOLD_S = 0.02
const PINCH_S = 0.1
const IRIS_S = 0.26
const DISC_END_R = 16
const TRACK_OP = 0.14

const ringR = ref(RING_R)
const ringSw = ref(STROKE)
const ringOp = ref(1)
const discR = ref(DISC_END_R)
const discOp = ref(0)

/** Iris hole — scaled div + box-shadow (mask-image radial was freezing mobile). */
const irisHoleEl = ref<HTMLElement | null>(null)

let gsapMod: typeof import('gsap').default | null = null
let cycleTl: { kill: () => void } | null = null
let angle = APEX
let flyerR = ORBIT_R
let settling = false
let settled = false
let holding = false
let liteExitTimer = 0
/** While true, odometer follows the first orbit (0→99). */
let pacingLap1 = true
let lap1StartA = APEX

const flyerTransform = ref(`translate(0 ${-ORBIT_R})`)

async function getGsap() {
  if (!gsapMod) {
    gsapMod = (await import('gsap')).default
    gsapMod.ticker.fps(0)
    gsapMod.ticker.lagSmoothing(0)
    gsapMod.config({ force3D: true, nullTargetWarn: false })
  }
  return gsapMod
}

function placeFlyer(a: number, flatten = 0, radius = flyerR) {
  const x = Math.cos(a) * radius
  const y = Math.sin(a) * radius
  let tangent = ((a * 180) / Math.PI + 90) % 360
  if (tangent > 180) tangent -= 360
  if (tangent <= -180) tangent += 360
  const rot = tangent * (1 - flatten)
  flyerTransform.value = `translate(${x} ${y}) rotate(${rot})`
}

/** pathLength=1 — empty at offset 1, full at 0. Gray track is always full underneath. */
function updateArcFill(p: number) {
  const arc = arcEl.value
  if (!arc) return
  const t = Math.min(1, Math.max(0, p))
  arc.style.strokeDasharray = '1'
  arc.style.strokeDashoffset = String(1 - t)
}

/** Map first-lap angle → 00–99 and sector fill. */
function paceFromOrbit(a: number) {
  if (!pacingLap1) return
  const u = Math.min(1, Math.max(0, (a - lap1StartA) / (Math.PI * 2)))
  const pct = Math.min(99, Math.floor(u * 99))
  if (pct !== shownPct.value) shownPct.value = pct
  updateArcFill(u)
}

function syncVisual(a: number, flat = 0) {
  angle = a
  placeFlyer(a, flat)
  if (pacingLap1) paceFromOrbit(a)
  else updateArcFill(1)
}

function userToPx(units: number) {
  const mark = markEl.value
  if (!mark) return units
  return (units * mark.getBoundingClientRect().width) / 320
}

function hideFlyerNow() {
  const flyer = flyerEl.value
  if (flyer) flyer.setAttribute('opacity', '0')
}

async function waitForCanExit(maxMs = 2200) {
  if (preload.canExit.value) return
  await new Promise<void>((resolve) => {
    let done = false
    const finish = () => {
      if (done) return
      done = true
      unwatch()
      window.clearTimeout(safety)
      resolve()
    }
    const unwatch = watch(
      () => preload.canExit.value,
      (ok) => {
        if (ok) finish()
      },
      { immediate: true },
    )
    const safety = window.setTimeout(finish, maxMs)
  })
}

async function settleAndExit(opts?: { skipSpin?: boolean }) {
  if (settling || settled) return
  settling = true
  holding = false
  pacingLap1 = false
  cycleTl?.kill()
  cycleTl = null
  preload.markMinOrbitDone()
  preload.beginFinish()
  shownPct.value = 99
  updateArcFill(1)

  const gsap = await getGsap()
  const skipSpin = !!opts?.skipSpin

  if (skipSpin) {
    // Warm path — no orbit; macron sits full at apex until the disc covers it.
    placeFlyer(APEX, 1)
    angle = APEX
    updateArcFill(1)
  } else {
    const turns = Math.round((angle - APEX) / (Math.PI * 2))
    const apexNow = APEX + turns * Math.PI * 2
    const spin = { a: angle, flat: 0 }

    // Snap sector to apex — exit morph starts immediately after (no hold).
    await new Promise<void>((resolve) => {
      gsap.to(spin, {
        a: apexNow,
        flat: 1,
        duration: SETTLE_S,
        ease: 'power3.out',
        onUpdate: () => {
          angle = spin.a
          placeFlyer(spin.a, spin.flat)
        },
        onComplete: () => {
          placeFlyer(apexNow, 1)
          resolve()
        },
      })
    })
  }

  // Desktop pays the complete first-scene cost while the mark is motionless at
  // 99%: Three import, WebGL context, HDR/PMREM, shader compile and hidden paints.
  // A bounded wait keeps a cold network from turning the brand beat into a wall.
  const homeDesktop =
    isLocalizedHome(route.path)
    && !reduced.value
    && window.innerWidth >= 900
    && window.matchMedia('(hover: hover) and (pointer: fine)').matches
  if (homeDesktop && !heroWebglLit.value) {
    heroWebglPrebootRequested.value = true
    await new Promise<void>((resolve) => {
      let done = false
      const finish = () => {
        if (done) return
        done = true
        stop()
        window.clearTimeout(safety)
        resolve()
      }
      const stop = watch(heroWebglLit, (lit) => {
        if (lit) finish()
      }, { immediate: true })
      const safety = window.setTimeout(
        finish,
        preload.repeatVisit.value ? 700 : 1100,
      )
    })
  }

  // Start the expensive expand only from a quiet main-thread slot. The short
  // bounded wait is preferable to dropping a frame halfway through the morph.
  await new Promise<void>((resolve) => {
    if ('requestIdleCallback' in window) {
      window.requestIdleCallback(() => resolve(), { timeout: 160 })
    } else {
      globalThis.setTimeout(resolve, 48)
    }
  })
  // Commit two quiet paints before the expand beat.
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  })

  const outer0 = RING_OUTER
  // Expand flush with the macron’s outer tips (no overshoot).
  const swallowR = Math.hypot(42, ORBIT_R) + ARC_STROKE / 2
  const tipR = swallowR - 0.5
  const peakScale = swallowR / outer0
  const pinchScale = DISC_END_R / outer0
  flyerR = ORBIT_R
  const mark = markEl.value
  const ringNode = mark?.querySelector('.brand-preload__ring') as SVGCircleElement | null
  const discNode = mark?.querySelector('.brand-preload__disc') as SVGCircleElement | null
  const discG = mark?.querySelector('.brand-preload__disc-g') as SVGGElement | null
  // Mobile: solid disc + CSS/SVG scale (animating circle `r` re-rasters and stalls).
  const cheapMorph =
    reduced.value
    || window.matchMedia('(pointer: coarse)').matches
    || window.innerWidth < 900

  const morph = { outer: outer0, sw: STROKE }
  let solid = cheapMorph
  let flyerHidden = false

  const hideFlyerIfCovered = (outer: number) => {
    if (flyerHidden || outer < tipR) return
    flyerHidden = true
    hideFlyerNow()
  }

  const paintDiscScale = (s: number) => {
    if (discG) discG.setAttribute('transform', `scale(${s})`)
  }

  /** Direct SVG attrs only — never touch Vue refs mid-tween (mobile jank). */
  const paintMorph = () => {
    const outer = morph.outer
    let sw = morph.sw
    if (sw > outer) sw = outer
    hideFlyerIfCovered(outer)

    if (sw >= outer - 0.35) {
      if (!solid) {
        solid = true
        if (ringNode) {
          ringNode.setAttribute('opacity', '0')
          ringNode.setAttribute('r', String(RING_R))
          ringNode.setAttribute('stroke-width', String(STROKE))
        }
        if (discNode) {
          discNode.setAttribute('opacity', '1')
          discNode.setAttribute('r', String(outer0))
        }
        paintDiscScale(outer / outer0)
      } else {
        paintDiscScale(outer / outer0)
      }
      return
    }

    const r = Math.max(0.01, outer - sw / 2)
    if (ringNode) {
      ringNode.setAttribute('stroke-width', String(sw))
      ringNode.setAttribute('r', String(r))
    }
  }

  const syncVueDisc = (r: number) => {
    discR.value = r
    discOp.value = 1
    ringOp.value = 0
    paintDiscScale(1)
  }

  if (cheapMorph) {
    if (ringNode) ringNode.setAttribute('opacity', '1')
    if (discNode) {
      discNode.setAttribute('opacity', '0')
      discNode.setAttribute('r', String(outer0))
    }
    paintDiscScale(1)
  }

  const endR = Math.hypot(window.innerWidth, window.innerHeight) * 0.72
  const surfaceEl = document.querySelector(
    '[data-flow-surface-frame]',
  ) as HTMLElement | null

  await new Promise<void>((resolve) => {
    const tl = gsap.timeline({ onComplete: () => resolve() })

    if (pctEl.value) {
      tl.to(
        pctEl.value,
        { autoAlpha: 0, duration: 0.08, ease: 'power2.out' },
        0,
      )
    }

    if (cheapMorph) {
      // GPU-friendly mobile path: crossfade O → disc while scaling a fixed
      // radius. This preserves the desktop story without SVG r re-rastering.
      const disc = { s: 1, fill: 0 }
      tl.to(
        disc,
        {
          s: peakScale,
          fill: 1,
          duration: EXPAND_S,
          ease: 'power2.out',
          onUpdate: () => {
            paintDiscScale(disc.s)
            if (discNode) discNode.setAttribute('opacity', String(disc.fill))
            if (ringNode) ringNode.setAttribute('opacity', String(1 - disc.fill))
            hideFlyerIfCovered(outer0 * disc.s)
          },
        },
        0,
      )
    } else {
      // Expand + fill; stroke fills faster so a solid disc owns the cover.
      tl.to(
        morph,
        {
          outer: swallowR,
          duration: EXPAND_S,
          ease: 'power2.out',
          onUpdate: paintMorph,
        },
        0,
      )
      tl.to(
        morph,
        {
          sw: swallowR,
          duration: STROKE_FILL_S,
          ease: 'power2.in',
          onUpdate: paintMorph,
        },
        0,
      )
    }

    // Peak hold: sector must already be under the disc before pinch.
    tl.call(
      () => {
        morph.outer = swallowR
        morph.sw = swallowR
        if (cheapMorph) {
          paintDiscScale(peakScale)
          if (discNode) discNode.setAttribute('opacity', '1')
          if (ringNode) ringNode.setAttribute('opacity', '0')
          hideFlyerIfCovered(swallowR)
        } else {
          paintMorph()
          hideFlyerIfCovered(swallowR)
        }
      },
      undefined,
      '>',
    )
    tl.to({}, { duration: PEAK_HOLD_S })

    // Quick pinch, then iris opens the site.
    const pinch = { s: peakScale }
    tl.to(pinch, {
      s: pinchScale,
      duration: PINCH_S,
      ease: 'power2.in',
      onUpdate: () => {
        paintDiscScale(pinch.s)
      },
      onComplete: () => {
        paintDiscScale(1)
        if (discNode) discNode.setAttribute('r', String(DISC_END_R))
        syncVueDisc(DISC_END_R)
      },
    })

    const irisStartR = userToPx(DISC_END_R)
    const irisScaleEnd = endR / Math.max(1, irisStartR)
    const isMobile =
      window.matchMedia('(pointer: coarse)').matches
      || window.innerWidth < 900

    tl.call(() => {
      exiting.value = true
      if (surfaceEl && !reduced.value && !isMobile) {
        gsap.fromTo(
          surfaceEl,
          { scale: 0.94, transformOrigin: '50% 40%' },
          { scale: 1, duration: IRIS_S, ease: 'power3.out' },
        )
      }
      gsap.to(markEl.value, {
        autoAlpha: 0,
        duration: 0.1,
        ease: 'power2.out',
      })
      const hole = irisHoleEl.value
      if (hole) {
        gsap.set(hole, {
          width: irisStartR * 2,
          height: irisStartR * 2,
          marginLeft: -irisStartR,
          marginTop: -irisStartR,
          scale: 1,
        })
      }
      // Intros under the iris. Mobile keeps WebGL cold until veil ends (hero watches revealT).
      // markRevealed() stamps revealT=1 — reset so iris progress can climb 0→1.
      preload.markRevealed()
      preload.setRevealT(0)
    })

    if (irisHoleEl.value) {
      tl.to(
        irisHoleEl.value,
        {
          scale: irisScaleEnd,
          duration: IRIS_S,
          ease: 'power3.inOut',
          onUpdate: function () {
            preload.setRevealT(this.progress())
          },
        },
        '>',
      )
    } else {
      tl.to({}, { duration: IRIS_S })
    }
  })

  settled = true
  preload.setRevealT(1)
  if (!preload.revealed.value) preload.markRevealed()
  show.value = false
}

/** Repeat visit — no orbit; sprint % then the same expand exit. */
async function runWarmExit(gsap: typeof import('gsap').default) {
  pacingLap1 = false
  holding = false
  flyerR = ORBIT_R
  // Full black macron at apex — covered later by the expanding disc.
  const flyer = flyerEl.value
  if (flyer) flyer.setAttribute('opacity', '1')
  placeFlyer(APEX, 1)
  updateArcFill(1)
  shownPct.value = 0

  const pct = { n: 0 }
  await new Promise<void>((resolve) => {
    gsap.to(pct, {
      n: 99,
      duration: WARM_PCT_S,
      ease: 'power2.out',
      onUpdate: () => {
        shownPct.value = Math.min(99, Math.round(pct.n))
      },
      onComplete: () => {
        shownPct.value = 99
        resolve()
      },
    })
  })

  await waitForCanExit()
  if (settled || settling) return
  await settleAndExit({ skipSpin: true })
}

function tryExitFromHold() {
  if (settling || settled) return
  if (!preload.canExit.value) return
  // After lap 1, exit immediately — don't wait for the HOLD beat.
  if (!holding && pacingLap1) return
  holding = true
  void settleAndExit()
}

function buildCycle(gsap: typeof import('gsap').default) {
  const state = { a: APEX }
  pacingLap1 = true
  lap1StartA = APEX
  flyerR = ORBIT_R
  shownPct.value = 0
  updateArcFill(0)
  syncVisual(APEX, 0)

  const tl = gsap.timeline({
    repeat: -1,
    onRepeat: () => {
      state.a = APEX
      flyerR = ORBIT_R
      // Extra loops while loading — stay at 99, don't re-pace from 0.
      pacingLap1 = false
      shownPct.value = 99
      updateArcFill(1)
      syncVisual(APEX, 0)
    },
  })

  // One full orbit — % rides this window (00→99).
  tl.to(state, {
    a: `+=${Math.PI}`,
    duration: LAP1_DIVE_S,
    ease: 'power3.in',
    onUpdate: () => syncVisual(state.a),
  })

  tl.to(state, {
    a: `+=${Math.PI}`,
    duration: LAP1_RISE_S,
    ease: 'power2.out',
    onUpdate: () => syncVisual(state.a),
  })

  tl.call(() => {
    pacingLap1 = false
    shownPct.value = 99
    updateArcFill(1)
    syncVisual(state.a, 1)
    // Fast load: stop after exactly one orbit.
    if (preload.canExit.value && !settling && !settled) {
      holding = true
      void settleAndExit()
    }
  })

  // Still loading — short extra orbits; exit as soon as canExit (see watch).
  tl.to(state, {
    a: `+=${Math.PI}`,
    duration: 0.72,
    ease: 'power3.in',
    onUpdate: () => {
      syncVisual(state.a)
      if (preload.canExit.value && !settling && !settled) {
        holding = true
        tryExitFromHold()
      }
    },
  })

  tl.to(state, {
    a: `+=${Math.PI}`,
    duration: 0.95,
    ease: 'power2.out',
    onUpdate: () => {
      syncVisual(state.a)
      if (preload.canExit.value && !settling && !settled) {
        holding = true
        tryExitFromHold()
      }
    },
  })

  tl.call(() => {
    holding = true
    syncVisual(state.a, 1)
    tryExitFromHold()
  })
  tl.to({}, { duration: HOLD_S })
  tl.call(() => {
    holding = false
    if (preload.canExit.value && !settling) {
      void settleAndExit()
    }
  })

  return tl
}

watch(
  () => preload.canExit.value,
  (ok) => {
    if (!ok || settling || settled) return
    // After the first lap, don't wait for the next hold beat.
    if (holding || !pacingLap1) tryExitFromHold()
  },
)

onMounted(async () => {
  if (isLocalizedHome(route.path)) {
    heroWebglPrebootRequested.value = false
    heroWebglBooted.value = false
    heroWebglLit.value = false
  }
  preload.begin()
  reduced.value =
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const mobileLite =
    window.innerWidth < 900
    || window.matchMedia('(pointer: coarse)').matches

  const connection = (navigator as Navigator & {
    connection?: { effectiveType?: string; saveData?: boolean }
  }).connection
  const constrained = Boolean(
    connection?.saveData
    || connection?.effectiveType === 'slow-2g'
    || connection?.effectiveType === '2g'
    || connection?.effectiveType === '3g',
  )
  connectionOptimized.value = constrained
  // Mobile keeps a concise branded mark, but does not hold the meaningful SSR
  // Hero behind a GSAP download and a full orbit. Desktop retains the complete
  // O → disc → iris story; constrained links keep the slower explanatory beat.
  if (constrained || reduced.value || mobileLite) {
    liteExit.value = true
    shownPct.value = 99
    updateArcFill(1)
    preload.markSceneReady()
    preload.markFontsReady()
    preload.beginFinish()
    liteExitDurationMs.value = constrained ? 1350 : reduced.value ? 400 : 920
    liteExitTimer = window.setTimeout(() => {
      settled = true
      preload.setRevealT(1)
      if (!preload.revealed.value) preload.markRevealed()
      show.value = false
    }, liteExitDurationMs.value)
    return
  }

  // Hard unlock — if GSAP/exit stalls (hung tab after canvas nav), never leave
  // a blank sand veil forever.
  const forceUnlock = window.setTimeout(() => {
    if (settled) return
    settling = true
    settled = true
    cycleTl?.kill()
    cycleTl = null
    preload.markSceneReady()
    preload.markFontsReady()
    preload.setRevealT(1)
    if (!preload.revealed.value) preload.markRevealed()
    exiting.value = false
    show.value = false
  }, 9000)

  const warm = preload.repeatVisit.value
  flyerR = ORBIT_R
  // Warm: paint full black macron before any await (avoids gray-track flash).
  placeFlyer(APEX, warm ? 1 : 0, ORBIT_R)
  updateArcFill(warm ? 1 : 0)
  await nextTick()
  placeFlyer(APEX, warm ? 1 : 0, ORBIT_R)
  updateArcFill(warm ? 1 : 0)

  const gsap = await getGsap()
  placeFlyer(APEX, warm || reduced.value ? 1 : 0, ORBIT_R)

  if (reduced.value) {
    flyerR = ORBIT_R
    placeFlyer(APEX, 1, ORBIT_R)
    shownPct.value = 99
    updateArcFill(1)
    const unwatch = watch(
      () => preload.canExit.value,
      (ok) => {
        if (!ok) return
        unwatch()
        window.setTimeout(() => void settleAndExit({ skipSpin: true }), 400)
      },
      { immediate: true },
    )
    return
  }

  // Warm / repeat visit: skip the orbit lap — quick % then expand.
  if (warm) {
    void runWarmExit(gsap).finally(() => window.clearTimeout(forceUnlock))
    return
  }

  cycleTl = buildCycle(gsap)
  // Cold path clears via markRevealed inside settleAndExit.
  watch(
    () => preload.revealed.value,
    (on) => {
      if (on) window.clearTimeout(forceUnlock)
    },
    { immediate: true },
  )
})

onUnmounted(() => {
  if (liteExitTimer) window.clearTimeout(liteExitTimer)
  cycleTl?.kill()
  cycleTl = null
})
</script>

<template>
  <div
    v-if="show"
    ref="rootEl"
    class="brand-preload"
    :class="{
      'is-exiting': exiting,
      'is-lite': liteExit,
      'is-connection-lite': connectionOptimized,
    }"
    :style="{ '--brand-lite-duration': `${liteExitDurationMs}ms` }"
    role="status"
    aria-live="polite"
    aria-busy="true"
    :aria-label="t('accessibility.preload', { percent: percentLabel })"
  >
    <!-- GPU iris: scaled hole + box-shadow veil (avoids per-frame CSS mask). -->
    <div
      class="brand-preload__iris"
      :class="{ 'is-on': exiting }"
      aria-hidden="true"
    >
      <div ref="irisHoleEl" class="brand-preload__iris-hole" />
    </div>

    <div class="brand-preload__stage">
      <div ref="markEl" class="brand-preload__glyph" aria-hidden="true">
        <svg
          class="brand-preload__mark"
          viewBox="-160 -160 320 320"
          aria-hidden="true"
        >
          <!-- Flyer under ring/disc so the expanding circle physically covers it. -->
          <g ref="flyerEl" :transform="flyerTransform">
            <path
              class="brand-preload__arc brand-preload__arc--track"
              d="M -42 0 Q 0 -14 42 0"
              pathLength="1"
              fill="none"
              stroke="currentColor"
              :stroke-width="ARC_STROKE"
              stroke-linecap="butt"
              :opacity="TRACK_OP"
            />
            <path
              ref="arcEl"
              class="brand-preload__arc"
              d="M -42 0 Q 0 -14 42 0"
              pathLength="1"
              fill="none"
              stroke="currentColor"
              :stroke-width="ARC_STROKE"
              stroke-linecap="butt"
              stroke-dasharray="1"
              stroke-dashoffset="1"
            />
          </g>
          <circle
            class="brand-preload__ring"
            cx="0"
            cy="0"
            :r="ringR"
            fill="none"
            stroke="currentColor"
            :stroke-width="ringSw"
            :opacity="ringOp"
          />
          <!-- Scale the group, not circle `r` — mobile Safari stalls on r-raster. -->
          <g class="brand-preload__disc-g">
            <circle
              class="brand-preload__disc"
              cx="0"
              cy="0"
              :r="discR"
              fill="currentColor"
              :opacity="discOp"
            />
          </g>
        </svg>
      </div>
    </div>

    <div ref="pctEl" class="brand-preload__pct" aria-hidden="true">
      <div class="brand-preload__odometer">
        <div class="brand-preload__slot">
          <div
            class="brand-preload__reel"
            :style="{ transform: `translate3d(0, ${-tensDigit * 10}%, 0)` }"
          >
            <span v-for="n in 10" :key="`t${n - 1}`">{{ n - 1 }}</span>
          </div>
        </div>
        <div class="brand-preload__slot">
          <div
            class="brand-preload__reel"
            :style="{ transform: `translate3d(0, ${-onesDigit * 10}%, 0)` }"
          >
            <span v-for="n in 10" :key="`o${n - 1}`">{{ n - 1 }}</span>
          </div>
        </div>
      </div>
    </div>
    <p v-if="connectionOptimized" class="brand-preload__connection-note">
      {{ t('accessibility.connectionOptimized') }}
    </p>
  </div>
</template>

<style scoped>
.brand-preload {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: grid;
  place-items: center;
  background: var(--palette-sand);
  color: var(--palette-ink);
  pointer-events: auto;
  overflow: hidden;
}

.brand-preload.is-exiting {
  pointer-events: none;
  /* Hole punches through to the site; sand comes from iris box-shadow. */
  background: transparent;
}

.brand-preload.is-lite {
  pointer-events: none;
  animation: brand-preload-lite-exit var(--brand-lite-duration) cubic-bezier(0.22, 1, 0.36, 1) forwards;
}

.brand-preload.is-lite .brand-preload__glyph {
  animation: brand-preload-lite-mark var(--brand-lite-duration) cubic-bezier(0.22, 1, 0.36, 1) forwards;
}

.brand-preload.is-lite .brand-preload__pct {
  display: block;
  animation: brand-preload-lite-pct var(--brand-lite-duration) ease-out forwards;
}

.brand-preload.is-lite.is-connection-lite {
  animation-name: brand-preload-connection-exit;
}

.brand-preload.is-lite.is-connection-lite .brand-preload__glyph {
  animation-name: brand-preload-connection-mark;
}

@keyframes brand-preload-lite-exit {
  0%, 38% {
    opacity: 1;
    visibility: visible;
  }
  100% {
    opacity: 0;
    visibility: hidden;
  }
}

@keyframes brand-preload-lite-mark {
  0% { opacity: 1; transform: scale(1); }
  58% { opacity: 1; transform: scale(1.04); }
  100% { opacity: 0; transform: scale(0.94); }
}

@keyframes brand-preload-lite-pct {
  0%, 58% { opacity: 1; }
  82%, 100% { opacity: 0; }
}

@keyframes brand-preload-connection-exit {
  0%, 66% {
    opacity: 1;
    visibility: visible;
  }
  100% {
    opacity: 0;
    visibility: hidden;
  }
}

@keyframes brand-preload-connection-mark {
  0%, 58% { opacity: 1; transform: scale(1); }
  100% { opacity: 0; transform: scale(0.94); }
}

.brand-preload__iris {
  position: absolute;
  inset: 0;
  z-index: 1;
  pointer-events: none;
  opacity: 0;
  visibility: hidden;
}

.brand-preload__iris.is-on {
  opacity: 1;
  visibility: visible;
}

.brand-preload__iris-hole {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 32px;
  height: 32px;
  margin: -16px 0 0 -16px;
  border-radius: 50%;
  background: transparent;
  box-shadow: 0 0 0 100vmax var(--palette-sand);
  transform: scale(1);
  will-change: transform;
}

.brand-preload__stage {
  position: relative;
  z-index: 2;
  display: grid;
  place-items: center;
}

.brand-preload__glyph {
  position: relative;
  display: grid;
  place-items: center;
  width: min(57vw, 378px);
  height: min(57vw, 378px);
  transform-origin: center center;
  will-change: transform, opacity;
}

.brand-preload__mark {
  width: 100%;
  height: 100%;
  overflow: visible;
  color: var(--palette-ink);
}

.brand-preload__pct {
  position: absolute;
  z-index: 2;
  right: max(var(--layout-margin, 1.25rem), 5vw);
  bottom: max(var(--layout-margin, 1.25rem), 4vh);
}

.brand-preload__connection-note {
  position: absolute;
  z-index: 2;
  left: 50%;
  bottom: max(var(--layout-margin, 1.25rem), 4vh);
  width: min(88vw, 28rem);
  margin: 0;
  color: var(--palette-ash);
  font-family: var(--font-sans);
  font-size: calc(var(--type-nav) * 0.78);
  font-weight: 400;
  line-height: 1.25;
  letter-spacing: 0.01em;
  text-align: center;
  opacity: 0.75;
  transform: translateX(-50%);
}

.brand-preload__odometer {
  display: flex;
  align-items: stretch;
  font-family: var(--font-sans);
  font-weight: 600;
  font-size: clamp(3.5rem, 11vw, 6.5rem);
  line-height: 1;
  letter-spacing: -0.04em;
  font-variant-numeric: tabular-nums;
}

.brand-preload__slot {
  position: relative;
  height: 1.05em;
  width: 0.62em;
  overflow: hidden;
  -webkit-mask-image: linear-gradient(
    to bottom,
    transparent 0%,
    #000 16%,
    #000 84%,
    transparent 100%
  );
  mask-image: linear-gradient(
    to bottom,
    transparent 0%,
    #000 16%,
    #000 84%,
    transparent 100%
  );
}

.brand-preload__reel {
  display: flex;
  flex-direction: column;
  will-change: transform;
  /* ~4s / 99 ≈ 40ms — keep each tick readable. */
  transition: transform 0.04s cubic-bezier(0.22, 1, 0.36, 1);
}

.brand-preload__reel span {
  display: flex;
  height: 1.05em;
  align-items: center;
  justify-content: center;
}

@media (max-width: 767px) {
  .brand-preload__pct {
    right: auto;
    left: 50%;
    bottom: max(2.5rem, 6vh);
    transform: translateX(-50%);
  }

  .brand-preload__odometer {
    font-size: clamp(3rem, 16vw, 4.75rem);
  }

  .brand-preload__glyph {
    width: min(65vw, 297px);
    height: min(65vw, 297px);
  }
}

/* Hide the SSR 00 until client capability detection switches mobile to 99. */
@media (max-width: 899px), (pointer: coarse) {
  .brand-preload:not(.is-lite) .brand-preload__pct {
    opacity: 0;
  }
}
</style>
