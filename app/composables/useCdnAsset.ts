import { prefixPublicAssetReferences } from '~/utils/assetCdn'

export function useCdnAsset() {
  const config = useRuntimeConfig()
  const base = String(config.public.assetCdnUrl || config.app.cdnURL || '')
  return (value: string) => prefixPublicAssetReferences(value, base)
}
