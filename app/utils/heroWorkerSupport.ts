export function supportsHeroWorkerRenderer(): boolean {
  if (!import.meta.client || typeof Worker === 'undefined') return false
  return typeof HTMLCanvasElement !== 'undefined'
    && typeof HTMLCanvasElement.prototype.transferControlToOffscreen === 'function'
}
