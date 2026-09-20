import { isSiteIndexable, SITE_URL } from '../../app/utils/siteSeo'

export default defineEventHandler((event) => {
  setHeader(event, 'content-type', 'text/plain; charset=utf-8')
  const indexable = isSiteIndexable(useRuntimeConfig(event).public.siteIndexable)
  return indexable
    ? `User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${SITE_URL}/sitemap.xml\n`
    // Crawlers need access to read noindex in preview HTML.
    : 'User-agent: *\nAllow: /\nDisallow: /api/\n'
})
