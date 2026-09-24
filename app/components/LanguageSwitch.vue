<script setup lang="ts">
import type { LocaleCode } from '~/generated/locales/manifest'
import {
  applyIrisClip,
  irisCoverFrom,
  viewportIrisBox,
  IRIS_OPEN_EASE,
  IRIS_OPEN_S,
  type IrisGeom,
} from '~/utils/irisClip'

defineOptions({ inheritAttrs: false })

const { locale, setLocale, t } = useI18n()
const route = useRoute()
const switching = ref(false)
const buttonEl = ref<HTMLButtonElement | null>(null)
const irisEl = ref<HTMLElement | null>(null)
const irisLive = ref(false)
const proxyStyle = shallowRef<Record<string, string>>({})
const nextLocale = computed<LocaleCode>(() => locale.value === 'ru' ? 'en' : 'ru')
const switchLabel = computed(() => t(`language.switchTo.${nextLocale.value}`))
let irisTween: { kill: () => void } | null = null

function waitFrames(count = 2) {
  return new Promise<void>((resolve) => {
    const step = (left: number) => {
      if (left <= 0) {
        resolve()
        return
      }
      requestAnimationFrame(() => step(left - 1))
    }
    requestAnimationFrame(() => step(count - 1))
  })
}

function circleAtButton(): IrisGeom {
  const view = viewportIrisBox()
  const box = buttonEl.value?.getBoundingClientRect()
  const diameter = Math.max(1, Math.min(box?.width ?? 40, box?.height ?? 40))
  return {
    cx: box ? box.left + box.width / 2 : view.width / 2,
    cy: box ? box.top + box.height / 2 : view.height / 2,
    w: diameter,
    h: diameter,
    r: diameter / 2,
    vw: view.width,
    vh: view.height,
  }
}

/** Keep the switch itself legible above the iris without lifting the whole menu. */
function captureSwitcherProxy() {
  const button = buttonEl.value
  if (!button) return
  const box = button.getBoundingClientRect()
  const styles = getComputedStyle(button)
  proxyStyle.value = {
    left: `${box.left}px`,
    top: `${box.top}px`,
    width: `${box.width}px`,
    height: `${box.height}px`,
    color: styles.color,
    fontFamily: styles.fontFamily,
    fontSize: styles.fontSize,
    fontStyle: styles.fontStyle,
    fontWeight: styles.fontWeight,
    letterSpacing: styles.letterSpacing,
    lineHeight: styles.lineHeight,
    textTransform: styles.textTransform,
    background: styles.background,
    borderRadius: styles.borderRadius,
    backdropFilter: styles.backdropFilter,
    WebkitBackdropFilter: styles.getPropertyValue('-webkit-backdrop-filter'),
  }
}

async function expandIris(start: IrisGeom, end: IrisGeom) {
  const root = irisEl.value
  if (!root) return
  const gsap = (await import('gsap')).default
  const state = { diameter: start.w }
  await new Promise<void>((resolve) => {
    irisTween = gsap.to(state, {
      diameter: end.w,
      duration: IRIS_OPEN_S,
      ease: IRIS_OPEN_EASE,
      overwrite: true,
      onUpdate: () => applyIrisClip(root, {
        ...start,
        w: state.diameter,
        h: state.diameter,
        r: state.diameter / 2,
      }),
      onComplete: () => {
        irisTween = null
        resolve()
      },
    })
  })
}

async function fadeIris() {
  const root = irisEl.value
  if (!root) return
  const gsap = (await import('gsap')).default
  await new Promise<void>((resolve) => {
    irisTween = gsap.to(root, {
      opacity: 0,
      duration: 0.34,
      ease: 'power2.out',
      overwrite: true,
      onComplete: () => {
        irisTween = null
        resolve()
      },
    })
  })
}

async function switchLanguage() {
  if (switching.value) return
  const targetLocale = nextLocale.value
  const targetPath = localizedPath(route.fullPath, targetLocale)
  switching.value = true
  document.documentElement.classList.add('language-switch-lock')
  try {
    captureSwitcherProxy()
    const start = circleAtButton()
    const cover = irisCoverFrom(start)
    irisLive.value = true
    await nextTick()
    const iris = irisEl.value
    if (iris) {
      iris.style.opacity = '1'
      applyIrisClip(iris, start)
      await expandIris(start, cover)
    }

    await setLocale(targetLocale)
    await nextTick()
    // Locale URLs are aliases of the same Nuxt page record. Vue Router treats
    // alias-to-alias navigation as duplicated unless it is explicitly forced.
    await navigateTo({ path: targetPath, force: true })
    await nextTick()
    await waitFrames()
    window.dispatchEvent(new Event('resize'))

    await fadeIris()
  } finally {
    irisTween?.kill()
    irisTween = null
    irisLive.value = false
    document.documentElement.classList.remove('language-switch-lock')
    switching.value = false
  }
}

onUnmounted(() => {
  irisTween?.kill()
  document.documentElement.classList.remove('language-switch-lock')
})
</script>

<template>
  <button
    ref="buttonEl"
    v-bind="$attrs"
    type="button"
    class="language-switch"
    :class="{ 'language-switch--switching': switching }"
    :lang="nextLocale"
    :aria-label="switchLabel"
    :disabled="switching"
    @click="switchLanguage"
  >
    <span class="language-switch__labels" aria-hidden="true">
      <span class="language-switch__label">{{ nextLocale }}</span>
      <span class="language-switch__sizer">ru</span>
      <span class="language-switch__sizer">en</span>
    </span>
  </button>
  <Teleport to="body">
    <template v-if="irisLive">
      <div
        ref="irisEl"
        class="language-switch__iris"
        aria-hidden="true"
      />
      <span
        class="language-switch__proxy"
        :style="proxyStyle"
        aria-hidden="true"
      >{{ nextLocale }}</span>
    </template>
  </Teleport>
</template>

<style scoped>
.language-switch--switching {
  /* The fixed proxy owns the label during the iris fade. Keeping the real
     button visible underneath makes tiny subpixel differences read as a
     duplicated word when the cover becomes transparent. */
  visibility: hidden;
}

.language-switch__labels {
  display: inline-grid;
  white-space: nowrap;
}

.language-switch__label,
.language-switch__sizer {
  grid-area: 1 / 1;
}

.language-switch__sizer {
  visibility: hidden;
  pointer-events: none;
}

.language-switch__iris {
  position: fixed;
  inset: 0;
  z-index: 10005;
  /* Opaque equivalent of the switcher's 70% sand surface over the menu tone. */
  background: color-mix(in srgb, var(--palette-sand) 93.4%, var(--palette-ash));
  pointer-events: auto;
}

.language-switch__proxy {
  position: fixed;
  z-index: 10006;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  white-space: nowrap;
  pointer-events: none;
}

:global(html.language-switch-lock),
:global(html.language-switch-lock body) {
  overflow: hidden;
  overscroll-behavior: none;
}
</style>
