/**
 * Prefix public asset references with the optional delivery CDN.
 *
 * Routes and API URLs deliberately stay on the site origin. This helper only
 * recognizes paths that can exist in `public/`, so localized links and form
 * endpoints cannot accidentally move to the CDN host.
 */
const PUBLIC_ASSET_PATH = /\/(?:_nuxt|home|images|textures|env|fonts|brand|svg|og|favicon[^\s,)]*|apple-touch-icon[^\s,)]*)/g

function normalizeBase(base: string) {
  return base.trim().replace(/\/+$/, '')
}

export function prefixPublicAssetReferences(value: string, base = '') {
  const normalizedBase = normalizeBase(base)
  if (!normalizedBase || !value) return value

  return value.replace(PUBLIC_ASSET_PATH, (match, offset: number, source: string) => {
    // Do not prefix an already absolute CDN/remote URL.
    const before = source.slice(Math.max(0, offset - normalizedBase.length - 8), offset)
    if (before.includes('://')) return match
    return `${normalizedBase}${match}`
  })
}
