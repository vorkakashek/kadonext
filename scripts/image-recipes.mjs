/**
 * Source-to-delivery recipes for responsive raster media.
 *
 * Add a recipe when a new visual is introduced. `source` is a public-shaped
 * relative name, but optimize-images resolves it inside the local, gitignored
 * assets/source-media tree. Only generated AVIF/WebP delivery files belong in
 * public/. Widths larger than the source are skipped, so we never spend bytes
 * on an upscaled image.
 */
export const imageRecipes = [
  {
    source: 'public/textures/grain-tile.png',
    outputStem: 'public/textures/grain-tile',
    widths: [128],
  },
  {
    source: 'public/textures/grain-tile-v2.png',
    outputStem: 'public/textures/grain-tile-v2',
    widths: [256],
  },
  {
    source: 'public/home/rock.png',
    outputStem: 'public/home/rock',
    widths: [320, 480, 640, 854, 1088],
  },
  {
    source: 'public/home/kira-photo.png',
    outputStem: 'public/home/kira-photo',
    widths: [480, 960, 1440, 1920, 2760, 3840],
    fallback: 'webp',
  },
  {
    source: 'public/home/kira-photo-vertical.png',
    outputStem: 'public/home/kira-photo-vertical',
    widths: [480, 960, 1200],
    fallback: 'webp',
  },
  ...[1, 2, 3, 4].map(number => ({
    source: `public/home/work/${String(number).padStart(3, '0')}.png`,
    outputStem: `public/home/work/${String(number).padStart(3, '0')}`,
    widths: [480, 960],
  })),
  {
    source: 'public/home/cases/keys-store/keys-1.png',
    outputStem: 'public/home/cases/keys-store/keys-1',
    widths: [480, 960, 1440, 2079],
    fallback: 'webp',
  },
  {
    source: 'public/home/cases/keys-store/keys-1-vertical.png',
    outputStem: 'public/home/cases/keys-store/keys-1-vertical',
    widths: [480, 960, 1440],
    fallback: 'webp',
  },
  {
    source: 'public/home/cases/keys-store/keys-2.png',
    outputStem: 'public/home/cases/keys-store/keys-2',
    widths: [480, 960, 1440, 2079],
    fallback: 'webp',
  },
  {
    source: 'public/home/cases/keys-store/keys-3.png',
    outputStem: 'public/home/cases/keys-store/keys-3',
    widths: [480, 960, 1440, 2079],
    fallback: 'webp',
  },
  ...[4, 5, 6, 7, 8].map(index => ({
    source: `public/home/cases/keys-store/keys-${index}.png`,
    outputStem: `public/home/cases/keys-store/keys-${index}`,
    widths: [480, 960, 1440, 2079],
    fallback: 'webp',
  })),
  {
    source: 'public/home/cases/keys-store/keys-4-vertical.png',
    outputStem: 'public/home/cases/keys-store/keys-4-vertical',
    widths: [480, 960, 1440],
    fallback: 'webp',
  },
  {
    source: 'public/home/cases/keys-store/keys-9.png',
    outputStem: 'public/home/cases/keys-store/keys-9',
    widths: [480, 960, 1440, 2079, 2760],
    fallback: 'webp',
  },
  {
    source: 'public/home/cases/keys-store/keys-10.png',
    outputStem: 'public/home/cases/keys-store/keys-10',
    widths: [480, 960, 1440, 2079],
    fallback: 'webp',
  },
  {
    source: 'public/home/cases/keys-store/keys-10-horizontal.png',
    outputStem: 'public/home/cases/keys-store/keys-10-horizontal',
    widths: [480, 960, 1440, 2079],
    fallback: 'webp',
  },
  {
    source: 'public/home/cases/keys-store/keys-11.png',
    outputStem: 'public/home/cases/keys-store/keys-11',
    widths: [480, 960, 1440, 2079, 2760],
    fallback: 'webp',
  },
  {
    source: 'public/home/cases/keys-store/keys-12.png',
    outputStem: 'public/home/cases/keys-store/keys-12',
    widths: [480, 960, 1440, 2079, 2760],
    fallback: 'webp',
  },
  {
    source: 'public/home/cases/keys-store/keys-12-vertical.png',
    outputStem: 'public/home/cases/keys-store/keys-12-vertical',
    widths: [480, 960, 1440],
    fallback: 'webp',
  },
  {
    source: 'public/home/cases/keys-store/case-detail-end.png',
    outputStem: 'public/home/cases/keys-store/keys-end',
    widths: [480, 960, 1440, 1920],
  },
  {
    source: 'public/home/cases/schmidt/schmidt-1.png',
    outputStem: 'public/home/cases/schmidt/schmidt-1',
    widths: [480, 960, 1440, 1920, 2760],
    fallback: 'webp',
  },
  {
    source: 'public/home/cases/schmidt/schmidt-1-vertical.png',
    outputStem: 'public/home/cases/schmidt/schmidt-1-vertical',
    widths: [480, 960, 1440],
    fallback: 'webp',
  },
  {
    source: 'public/home/cases/schmidt/schmidt-3.png',
    outputStem: 'public/home/cases/schmidt/schmidt-3',
    widths: [480, 960, 1440, 1920, 2560],
    fallback: 'webp',
  },
  {
    source: 'public/home/cases/schmidt/schmidt-3-vertical.png',
    outputStem: 'public/home/cases/schmidt/schmidt-3-vertical',
    widths: [480, 960, 1080],
    fallback: 'webp',
  },
  {
    source: 'public/home/cases/schmidt/schmidt-4.png',
    outputStem: 'public/home/cases/schmidt/schmidt-4',
    widths: [480, 960, 1440, 1600],
    fallback: 'webp',
  },
  {
    source: 'public/home/cases/schmidt/schmidt-5.png',
    outputStem: 'public/home/cases/schmidt/schmidt-5',
    widths: [480, 960, 1440, 1920, 2560],
    fallback: 'webp',
  },
  ...[6, 7, 8, 9].map(number => ({
    source: `public/home/cases/schmidt/schmidt-${number}.png`,
    outputStem: `public/home/cases/schmidt/schmidt-${number}`,
    widths: [480, 960, 1440, 1920, 2560],
    fallback: 'webp',
  })),
  {
    source: 'public/home/cases/schmidt/schmidt-10.png',
    outputStem: 'public/home/cases/schmidt/schmidt-10',
    widths: [480, 960, 1440, 1920, 2560],
    fallback: 'webp',
  },
  {
    source: 'public/home/cases/schmidt/schmidt-10-vertical.png',
    outputStem: 'public/home/cases/schmidt/schmidt-10-vertical',
    widths: [480, 960, 1440],
    fallback: 'webp',
  },
  {
    source: 'public/home/cases/schmidt/schmidt-11.png',
    outputStem: 'public/home/cases/schmidt/schmidt-11',
    widths: [480, 960, 1440, 1920, 2560],
    fallback: 'webp',
  },
  {
    source: 'public/home/cases/schmidt/schmidt-11-vertical.png',
    outputStem: 'public/home/cases/schmidt/schmidt-11-vertical',
    widths: [480, 960, 1440, 1920, 2215],
    fallback: 'webp',
  },
  {
    source: 'public/home/cases/schmidt/schmidt-end.png',
    outputStem: 'public/home/cases/schmidt/schmidt-end',
    widths: [480, 960, 1440, 1920],
  },
  {
    source: 'public/home/cases/audience/audience-cover.png',
    outputStem: 'public/home/cases/audience/audience-cover',
    widths: [480, 960],
  },
  {
    source: 'public/home/cases/audience/case-detail-2.png',
    outputStem: 'public/home/cases/audience/audience-intro-1',
    widths: [480, 960, 1248],
  },
  {
    source: 'public/home/cases/audience/case-detail-3.png',
    outputStem: 'public/home/cases/audience/audience-intro-2',
    widths: [480, 960, 1440, 1840],
  },
  {
    source: 'public/home/cases/audience/case-detail-4.png',
    outputStem: 'public/home/cases/audience/audience-atmosphere',
    widths: [480, 960, 1440, 1920, 2760],
  },
  {
    source: 'public/home/cases/audience/case-detail-4-vertical.png',
    outputStem: 'public/home/cases/audience/audience-atmosphere-mobile',
    widths: [480, 960, 1440, 1920],
  },
  {
    source: 'public/home/cases/audience/case-detail-5.png',
    outputStem: 'public/home/cases/audience/audience-menu-lead',
    widths: [480, 960, 1440, 1920],
  },
  {
    source: 'public/home/cases/audience/case-detail-5-vertical.png',
    outputStem: 'public/home/cases/audience/audience-menu-lead-mobile',
    widths: [480, 960, 1440, 1920],
  },
  {
    source: 'public/home/cases/audience/audience-img.png',
    outputStem: 'public/home/cases/audience/audience-img',
    widths: [480, 960, 1440, 1856],
  },
  {
    source: 'public/home/cases/audience/case-detail-6.png',
    outputStem: 'public/home/cases/audience/audience-menu-primary',
    widths: [480, 960, 1488],
  },
  {
    source: 'public/home/cases/audience/case-detail-8.png',
    outputStem: 'public/home/cases/audience/audience-menu-details',
    widths: [480, 960, 1488],
  },
  {
    source: 'public/home/cases/audience/case-detail-11.png',
    outputStem: 'public/home/cases/audience/audience-menu-category-primary',
    widths: [480, 960, 1440, 1920, 2760],
  },
  {
    source: 'public/home/cases/audience/case-detail-12.png',
    outputStem: 'public/home/cases/audience/audience-menu-category-details',
    widths: [480, 960, 1440, 1920, 2760],
  },
  {
    source: 'public/home/cases/audience/case-detail-9.png',
    outputStem: 'public/home/cases/audience/audience-admin-small',
    widths: [480, 960, 1020],
  },
  {
    source: 'public/home/cases/audience/case-detail-10.png',
    outputStem: 'public/home/cases/audience/audience-admin-large',
    widths: [480, 960, 1440],
  },
  {
    source: 'public/home/cases/audience/case-detail-10-mobile.png',
    outputStem: 'public/home/cases/audience/audience-admin-large-mobile',
    widths: [480, 960, 1440, 1920],
  },
  {
    source: 'public/home/cases/audience/case-detail-end.png',
    outputStem: 'public/home/cases/audience/audience-end',
    widths: [480, 960, 1440, 1920],
  },
  {
    source: 'public/home/cases/baltika/baltika-cover.png',
    outputStem: 'public/home/cases/baltika/baltika-cover',
    widths: [480, 960, 1440],
  },
  {
    source: 'public/home/cases/baltika/baltika-detail-header.png',
    outputStem: 'public/home/cases/baltika/baltika-detail-header',
    widths: [480, 960, 1440, 1920],
    fallback: 'webp',
  },
  {
    source: 'public/home/cases/baltika/baltika-detail-header-vertical.png',
    outputStem: 'public/home/cases/baltika/baltika-detail-header-vertical',
    widths: [480, 960, 1440],
    fallback: 'webp',
  },
  {
    source: 'public/home/cases/baltika/baltika-3-vertical.png',
    outputStem: 'public/home/cases/baltika/baltika-3-vertical',
    widths: [480, 960, 1440],
    fallback: 'webp',
  },
  ...Array.from({ length: 7 }, (_, index) => {
    const imageNumber = index + 1
    return {
      source: `public/home/cases/baltika/baltika-${imageNumber}.png`,
      outputStem: `public/home/cases/baltika/baltika-${imageNumber}`,
      widths: [480, 960, 1440, 1920, 2640],
    }
  }),
  {
    source: 'public/home/cases/baltika/baltika-8.png',
    outputStem: 'public/home/cases/baltika/baltika-8',
    widths: [480, 960, 1440, 1920, 2760],
  },
  {
    source: 'public/home/cases/baltika/baltika-9.png',
    outputStem: 'public/home/cases/baltika/baltika-9',
    widths: [480, 960, 1440],
  },
  {
    source: 'public/home/cases/baltika/baltika-11.png',
    outputStem: 'public/home/cases/baltika/baltika-11',
    widths: [480, 960, 1440, 1920, 2760],
  },
  {
    source: 'public/home/cases/baltika/baltika-12.png',
    outputStem: 'public/home/cases/baltika/baltika-12',
    widths: [480, 960, 1440, 2080],
  },
]
