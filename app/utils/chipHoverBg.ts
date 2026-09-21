/** Scale-in chip fill from the pointer (or center on keyboard focus). */

import { nextTick, ref } from 'vue'

export function setChipBgOrigin(
  el: HTMLElement,
  e: PointerEvent | FocusEvent,
) {
  if (!('clientX' in e)) {
    el.style.setProperty('--chip-bg-x', '50%')
    el.style.setProperty('--chip-bg-y', '50%')
    return
  }
  const box = el.getBoundingClientRect()
  const w = box.width || 1
  const h = box.height || 1
  el.style.setProperty('--chip-bg-x', `${((e.clientX - box.left) / w) * 100}%`)
  el.style.setProperty('--chip-bg-y', `${((e.clientY - box.top) / h) * 100}%`)
}

function prefersReduce() {
  return (
    typeof window !== 'undefined'
    && prefersReducedMotion()
  )
}

/**
 * Click → add `chip-press-play` (doesn’t replace other classes).
 * One CSS keyframe plays shrink→expand to the end, then the class is removed.
 */
export function useChipPress() {
  const pressKey = ref<string | null>(null)

  async function playChipPress(id: string) {
    if (prefersReduce()) return
    if (pressKey.value === id) {
      pressKey.value = null
      await nextTick()
    }
    pressKey.value = id
  }

  function endChipPress(id: string) {
    if (pressKey.value === id) pressKey.value = null
  }

  return { pressKey, playChipPress, endChipPress }
}

/** Plaque press flag — kept for PageCanvas cards. */
const PRESS_ATTR = 'data-chip-press'
const PLAQUE_PRESS_MS = 580
let plaqueEl: HTMLElement | null = null
let plaqueTimer = 0

export function beginChipPress(el: HTMLElement) {
  if (prefersReduce()) return
  window.clearTimeout(plaqueTimer)
  if (plaqueEl && plaqueEl !== el) plaqueEl.removeAttribute(PRESS_ATTR)
  plaqueEl = el
  el.setAttribute(PRESS_ATTR, '')
  plaqueTimer = window.setTimeout(() => {
    el.removeAttribute(PRESS_ATTR)
    if (plaqueEl === el) plaqueEl = null
  }, PLAQUE_PRESS_MS)
}
