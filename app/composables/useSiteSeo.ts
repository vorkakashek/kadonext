import { canonicalPath, isSiteIndexable, serializeJsonLd, siteUrl, SITE_EMAIL, SITE_NAME, SITE_PATHS, SITE_ROBOTS, SITE_URL } from '~/utils/siteSeo'
import { localizedPath } from '~/utils/localeRouting'

type SeoCopy = { title: string; description: string }
type JsonLdNode = Record<string, unknown>

/** One route-reactive owner also works when the home page stays mounted in KeepAlive. */
export function useSiteSeo() {
  const route = useRoute()
  const config = useRuntimeConfig()
  const { locale, t, tm } = useI18n()
  const cases = useHomeCases()
  const path = computed(() => canonicalPath(route.path))
  const item = computed(() => cases.value.find(project => `/projects/${project.id}` === path.value))
  const knownPage = computed(() => SITE_PATHS.includes(path.value))
  const indexable = computed(() => isSiteIndexable(config.public.siteIndexable) && knownPage.value)
  const copy = computed<SeoCopy>(() => {
    const key = item.value ? `seo.cases.${item.value.id}` : ({
      '/': 'seo.home', '/projects': 'seo.projects', '/privacy': 'seo.privacy', '/consent': 'seo.consent',
    } as Record<string, string>)[path.value]
    return key ? tm(key) as SeoCopy : { title: t('seo.defaultTitle'), description: t('seo.defaultDescription') }
  })
  const cleanText = (text: string) => text.replace(/\s+/g, ' ').trim()
  const title = computed(() => cleanText(copy.value.title))
  const description = computed(() => cleanText(copy.value.description))
  const canonical = computed(() => siteUrl(
    route.path === '/' ? '/' : localizedPath(path.value, locale.value),
  ))
  const localizedUrl = (targetPath: string) => siteUrl(localizedPath(targetPath, locale.value))
  const image = computed(() => siteUrl(`/og/${item.value?.id ?? (path.value === '/projects' ? 'projects' : 'home')}.jpg`))
  const imageAlt = computed(() => item.value
    ? t('seo.caseImageAlt', { title: item.value.title })
    : t('seo.imageAlt'))

  useSeoMeta({
    title: () => title.value,
    description: () => description.value,
    robots: () => indexable.value ? SITE_ROBOTS : 'noindex, follow',
    ogType: 'website',
    ogSiteName: SITE_NAME,
    ogLocale: () => locale.value === 'ru' ? 'ru_RU' : 'en_US',
    ogTitle: () => title.value,
    ogDescription: () => description.value,
    ogUrl: () => canonical.value,
    ogImage: () => image.value,
    ogImageType: 'image/jpeg',
    ogImageWidth: 1200,
    ogImageHeight: 630,
    ogImageAlt: () => imageAlt.value,
    twitterCard: 'summary_large_image',
    twitterTitle: () => title.value,
    twitterDescription: () => description.value,
    twitterImage: () => image.value,
    twitterImageAlt: () => imageAlt.value,
  })

  const graph = computed<JsonLdNode[]>(() => {
    const organizationId = `${SITE_URL}/#studio`
    const websiteId = `${SITE_URL}/#website`
    const pageId = `${canonical.value}#webpage`
    const nodes: JsonLdNode[] = [
      {
        '@type': 'Organization', '@id': organizationId, name: SITE_NAME,
        url: localizedUrl('/'), email: SITE_EMAIL,
        logo: { '@type': 'ImageObject', url: siteUrl('/brand/kado-logo.png'), width: 512, height: 512 },
        description: cleanText(t('seo.defaultDescription')),
      },
      {
        '@type': 'WebSite', '@id': websiteId, url: localizedUrl('/'), name: SITE_NAME,
        inLanguage: locale.value, publisher: { '@id': organizationId },
      },
      {
        '@type': path.value === '/projects' ? 'CollectionPage' : 'WebPage',
        '@id': pageId, url: canonical.value, name: title.value, description: description.value,
        inLanguage: locale.value, isPartOf: { '@id': websiteId },
        primaryImageOfPage: { '@type': 'ImageObject', url: image.value, width: 1200, height: 630, caption: imageAlt.value },
        ...(path.value !== '/' ? { breadcrumb: { '@id': `${canonical.value}#breadcrumbs` } } : {}),
        ...(item.value ? { mainEntity: { '@id': `${canonical.value}#project` } } : {}),
        ...(path.value === '/projects' ? { mainEntity: { '@id': `${canonical.value}#catalog` } } : {}),
      },
    ]
    if (path.value !== '/') {
      const crumbs = [{ name: SITE_NAME, url: localizedUrl('/') }]
      if (item.value) crumbs.push({ name: t('projects.catalog.title'), url: localizedUrl('/projects') })
      crumbs.push({ name: item.value?.title ?? title.value.replace(' — KADO', ''), url: canonical.value })
      nodes.push({
        '@type': 'BreadcrumbList', '@id': `${canonical.value}#breadcrumbs`,
        itemListElement: crumbs.map((crumb, index) => ({ '@type': 'ListItem', position: index + 1, name: crumb.name, item: crumb.url })),
      })
    }
    if (item.value) {
      nodes.push({
        '@type': 'CreativeWork', '@id': `${canonical.value}#project`, name: item.value.title,
        description: description.value, url: canonical.value, image: siteUrl(item.value.media.src),
        inLanguage: locale.value, mainEntityOfPage: { '@id': pageId },
        // Agency collaborations are described in the visible case, without claiming sole authorship.
        about: { '@type': 'Thing', name: item.value.client },
      })
    }
    if (path.value === '/projects') {
      nodes.push({
        '@type': 'ItemList', '@id': `${canonical.value}#catalog`, numberOfItems: cases.value.length,
        itemListElement: cases.value.map((project, index) => ({
          '@type': 'ListItem', position: index + 1,
          item: { '@type': 'CreativeWork', name: project.title, url: localizedUrl(`/projects/${project.id}`), image: siteUrl(project.media.src) },
        })),
      })
    }
    if (path.value === '/') {
      const formats = tm('home.formats.items') as Array<{ title: string; description: string }>
      nodes.push(...formats.map((format, index) => ({
        '@type': 'Service', '@id': `${SITE_URL}/#service-${index + 1}`, name: cleanText(format.title),
        description: cleanText(format.description), provider: { '@id': organizationId }, url: localizedUrl('/'),
      })))
    }
    return nodes
  })

  useHead(() => ({
    htmlAttrs: { lang: locale.value },
    link: knownPage.value ? [
      { key: 'canonical', rel: 'canonical', href: canonical.value },
      { key: 'alternate-ru', rel: 'alternate', hreflang: 'ru', href: siteUrl(localizedPath(path.value, 'ru')) },
      { key: 'alternate-en', rel: 'alternate', hreflang: 'en', href: siteUrl(localizedPath(path.value, 'en')) },
      { key: 'alternate-default', rel: 'alternate', hreflang: 'x-default', href: siteUrl(path.value) },
    ] : [],
    script: knownPage.value ? [{ key: 'site-schema', type: 'application/ld+json', innerHTML: serializeJsonLd({ '@context': 'https://schema.org', '@graph': graph.value }) }] : [],
  }))
}
