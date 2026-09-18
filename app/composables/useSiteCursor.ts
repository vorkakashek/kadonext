export function useSiteCursor() {
  const suppressed = useState('site-cursor-suppressed', () => false)
  const topLayerRequest = useState('site-cursor-top-layer-request', () => 0)
  function raiseAbovePopover() { topLayerRequest.value++ }
  return { suppressed, topLayerRequest, raiseAbovePopover }
}
