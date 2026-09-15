import {
  isAppliedScrollDriverConnected,
  publishAppliedScrollFrame,
  subscribeAppliedScrollFrame,
} from '~/utils/appliedScrollFrame'

export default defineNuxtPlugin(() => {
  const runtime = useMotionRuntime()
  let scrollFrame = 0
  let resizeFrame = 0

  const publishNativeScroll = () => {
    scrollFrame = 0
    // When Lenis is unavailable this is the sole applied-frame publisher.
    // Lenis publishes synchronously after its own DOM write and suppresses this
    // fallback, so compositor consumers never receive the same frame twice.
    if (!isAppliedScrollDriverConnected()) {
      publishAppliedScrollFrame(window.scrollY, 'native')
    }
  }
  const onScroll = () => {
    if (!scrollFrame) scrollFrame = requestAnimationFrame(publishNativeScroll)
  }
  const commitResize = () => {
    resizeFrame = 0
    runtime.commitResize()
  }
  const onResize = () => {
    if (!resizeFrame) resizeFrame = requestAnimationFrame(commitResize)
  }
  const onVisibilityChange = () => {
    runtime.setDocumentVisible(!document.hidden)
  }

  runtime.commitScroll(window.scrollY)
  runtime.setDocumentVisible(!document.hidden)
  const removeAppliedScrollFrame = subscribeAppliedScrollFrame((frame) => {
    runtime.commitScroll(frame.y)
  })
  window.addEventListener('scroll', onScroll, { passive: true })
  window.addEventListener('resize', onResize, { passive: true })
  document.addEventListener('visibilitychange', onVisibilityChange)

  import.meta.hot?.dispose(() => {
    if (scrollFrame) cancelAnimationFrame(scrollFrame)
    if (resizeFrame) cancelAnimationFrame(resizeFrame)
    window.removeEventListener('scroll', onScroll)
    window.removeEventListener('resize', onResize)
    document.removeEventListener('visibilitychange', onVisibilityChange)
    removeAppliedScrollFrame()
  })
})
