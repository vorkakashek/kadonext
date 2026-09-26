import homeCasesStructure from '../data/homeCases.json'
import { mergeLocalizedContent } from './localizedContent'
import { attachResponsiveMedia } from './responsiveMedia'

export type HomeCase = {
  id: string
  label: string
  title: string
  blurb: string
  client: string
  year: string
  collaboration?: string
  projectUrl?: string
  projectLabel?: string
  focusTags: string[]
  roleTags: string[]
  wash: string
  inverse?: boolean
  media: {
    src: string
    webpSrcset?: string
    avifSrcset?: string
    mobileSrc?: string
    mobileWebpSrcset?: string
    mobileAvifSrcset?: string
    alt: string
    width: number
    height: number
    mobileWidth?: number
    mobileHeight?: number
    orientation?: 'portrait' | 'landscape'
    video?: {
      webm: string
      mp4: string
      mobileWebm?: string
      mobileMp4?: string
      poster: string
    }
  }
}

export const homeCaseIds = homeCasesStructure.map(item => item.id)

export function localizeHomeCases(copy: unknown, assetCdnUrl = ''): HomeCase[] {
  return attachResponsiveMedia(
    mergeLocalizedContent<HomeCase[]>(homeCasesStructure, copy),
    assetCdnUrl,
  )
}

export function homeCaseDetailPath(item: Pick<HomeCase, 'id'>): string {
  return `/projects/${item.id}`
}
