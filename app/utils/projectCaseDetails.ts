import projectCaseDetailsStructure from '../data/projectCaseDetails.json'
import { mergeLocalizedContent } from './localizedContent'
import { attachResponsiveMedia } from './responsiveMedia'

export type ProjectCaseMedia = {
  src: string
  alt: string
  width?: number
  height?: number
  shape?: 'wide' | 'landscape' | 'portrait' | 'square'
  type?: 'image' | 'video'
  poster?: string
  mobileSrc?: string
  mobilePoster?: string
  mobileWebpSrcset?: string
  mobileAvifSrcset?: string
  webpSrcset?: string
  avifSrcset?: string
  sizes?: string
  aspectRatio?: string
  mobileAspectRatio?: string
}

export type ProjectCaseSectionPresentation = {
  title?: 'default' | 'nowrap' | 'offset'
  copy?: 'default' | 'collection' | 'object-grid' | 'route'
  media?: 'default' | 'collection-rail' | 'gallery-tight' | 'label' | 'motion' | 'object-pair' | 'route'
  mobileCopyGap?: 'default' | 'compact'
  statementGap?: 'default' | 'medium' | 'section' | 'small'
}

export type ProjectCaseSection = {
  id: string
  layout: 'intro' | 'gallery' | 'feature' | 'split'
  title: string
  paragraphs: string[]
  media: ProjectCaseMedia[]
  statement?: string
  presentation?: ProjectCaseSectionPresentation
  railSpeed?: number
}

export type ProjectCaseStoryBlock = ProjectCaseSection & { type: 'story' }

export type ProjectCaseIntroRailBlock = {
  type: 'intro-rail'
  id: string
  title: string
  paragraphs: string[]
  media: ProjectCaseMedia[]
  railSpeed?: number
}

export type ProjectCaseDisclosureMediaBlock = {
  type: 'disclosure-media'
  id: string
  title: string
  paragraphs: string[]
  media: ProjectCaseMedia
}

export type ProjectCaseMosaicRow = {
  feature: ProjectCaseMedia
  detail: ProjectCaseMedia
  featureSide: 'start' | 'end'
  statement: string
}

export type ProjectCaseContentMosaicBlock = {
  type: 'content-mosaic'
  id: string
  title: string
  lead: { media: ProjectCaseMedia; text: string }
  fillText: string
  rows: ProjectCaseMosaicRow[]
}

export type ProjectCaseTextMediaRailBlock = {
  type: 'text-media-rail'
  id: string
  title: string
  text: string
  media: ProjectCaseMedia[]
  railSpeed?: number
}

export type ProjectCaseFinalBlock = {
  type: 'final'
  id: string
  text: string
  variant?: 'default' | 'editorial'
}

export type ProjectCaseBlock =
  | ProjectCaseStoryBlock
  | ProjectCaseIntroRailBlock
  | ProjectCaseDisclosureMediaBlock
  | ProjectCaseContentMosaicBlock
  | ProjectCaseTextMediaRailBlock
  | ProjectCaseFinalBlock

export type ProjectCaseDetail = {
  summary?: string
  headerMedia?: {
    src: string
    alt: string
    width: number
    height: number
    webpSrcset?: string
    avifSrcset?: string
    mobileSrc?: string
    mobileWidth?: number
    mobileHeight?: number
    mobileWebpSrcset?: string
    mobileAvifSrcset?: string
  }
  blocks: ProjectCaseBlock[]
  closing: ProjectCaseMedia
  closingVariant?: 'story' | 'audience'
}

export function localizeProjectCaseDetails(copy: unknown, assetCdnUrl = ''): Record<string, ProjectCaseDetail> {
  return attachResponsiveMedia(
    mergeLocalizedContent<Record<string, ProjectCaseDetail>>(
      projectCaseDetailsStructure,
      copy,
    ),
    assetCdnUrl,
  )
}
