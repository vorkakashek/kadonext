import homeCases from '../../app/data/homeCases.json'
import projectDetails from '../../app/data/projectCaseDetails.json'
import { isSiteIndexable, SITE_PATHS, siteUrl } from '../../app/utils/siteSeo'

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]!)
}

function imagePaths(value: unknown, paths = new Set<string>()): Set<string> {
  if (Array.isArray(value)) value.forEach(item => imagePaths(item, paths))
  else if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      if (['src', 'poster'].includes(key) && typeof item === 'string' && /\.(?:webp|png|jpe?g|avif)$/i.test(item)) paths.add(item)
      else if (item && typeof item === 'object') imagePaths(item, paths)
    }
  }
  return paths
}

export default defineEventHandler((event) => {
  setHeader(event, 'content-type', 'application/xml; charset=utf-8')
  const paths = isSiteIndexable(useRuntimeConfig(event).public.siteIndexable) ? SITE_PATHS : []
  const urls = paths.map(path => {
    const project = homeCases.find(item => `/projects/${item.id}` === path)
    const media = project
      ? [project.media, projectDetails[project.id as keyof typeof projectDetails]]
      : path === '/' ? [
        ...homeCases.map(item => item.media),
        { src: '/home/me-1024.webp' }, { src: '/home/kira-photo-1920.webp' },
      ] : path === '/projects' ? homeCases.map(item => item.media) : []
    const images = [...imagePaths(media)].map(src => `<image:image><image:loc>${escapeXml(siteUrl(src))}</image:loc></image:image>`).join('')
    return `<url><loc>${escapeXml(siteUrl(path))}</loc>${images}</url>`
  }).join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n${urls}\n</urlset>\n`
})
