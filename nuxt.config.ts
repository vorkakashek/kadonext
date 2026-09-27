import tailwindcss from '@tailwindcss/vite'
import { homeCaseIds } from './app/utils/homeCases'

/**
 * Large public media can use the legacy asset-only CDN until the canonical
 * host is placed behind the edge. Full-site CDN builds intentionally keep all
 * public paths same-origin so the browser has one asset origin.
 */
const fullSiteCdn = process.env.KADO_FULL_SITE_CDN === 'true'
const publicAssetCdnUrl = fullSiteCdn
  ? ''
  : (process.env.NUXT_PUBLIC_ASSET_CDN_URL
      ?? (process.env.NODE_ENV === 'production' ? 'https://nfb4tt2jyb.cdn.twcstorage.ru' : ''))
/**
 * Critical Nuxt chunks and fonts default to the canonical origin. Reusing the
 * document's HTTP/2 connection is more predictable for a cold first screen
 * than opening a second DNS/TLS path to the media CDN. Keep this independently
 * overridable for an origin/CDN comparison without moving the media library.
 */
const appAssetCdnUrl = fullSiteCdn ? '' : (process.env.KADO_APP_ASSET_CDN_URL ?? '')

const contentRoutes = ['/', '/projects', '/privacy', '/consent', ...homeCaseIds.map(id => `/projects/${id}`)]
const localizedContentRoutes = ['ru', 'en'].flatMap(locale => (
  contentRoutes.map(path => `/${locale}${path}`)
))

const threeSourceUrl = new URL('./node_modules/three/src/Three.js', import.meta.url)
const threeSourceEntry = decodeURIComponent(
  /^\/[A-Za-z]:\//.test(threeSourceUrl.pathname)
    ? threeSourceUrl.pathname.slice(1)
    : threeSourceUrl.pathname,
)

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: false },

  experimental: {
    // Every prerendered payload currently contains only Nuxt's timestamp
    // (69 bytes): the site has no route-level useAsyncData/useFetch state.
    // Inline it so SPA hops cannot fail on a redundant CDN _payload request.
    // Mandatory: review on the first useAsyncData/useFetch; prefer 'client'.
    // https://nuxt.com/docs/4.x/getting-started/prerendering#payload-extraction
    payloadExtraction: false,
  },

  runtimeConfig: {
    public: {
      // Static hosting proxies this path to the separate SMTP gateway.
      // Alternatively set its HTTPS URL with NUXT_PUBLIC_CONTACT_ENDPOINT.
      contactEndpoint: '/api/contact',
      // In the transitional topology this is the asset-only CDN. A full-site
      // CDN build leaves it empty and lets the edge proxy the same paths.
      assetCdnUrl: publicAssetCdnUrl,
      // Opt-in only. Production must never silently acknowledge a real enquiry without delivery.
      contactMock: process.env.NUXT_PUBLIC_CONTACT_MOCK === 'true' && process.env.NODE_ENV === 'production',
      contactMockDelayMs: Math.min(Math.max(Number(process.env.NUXT_PUBLIC_CONTACT_MOCK_DELAY_MS) || 500, 0), 10000),
      // Set false for preview builds; static hosts must publish a fresh build.
      siteIndexable: process.env.NUXT_PUBLIC_SITE_INDEXABLE !== 'false' && process.env.NODE_ENV !== 'development',
    },
  },

  hooks: {
    'vite:extendConfig'(config, { isClient }) {
      if (!isClient || config.build?.ssr) return
      const output = config.build?.rolldownOptions?.output ?? {}
      const rolldownOptions = config.build?.rolldownOptions ?? {}
      Object.assign(config, {
        build: {
          ...config.build,
          rolldownOptions: {
            ...rolldownOptions,
            output: {
              ...output,
              codeSplitting: {
                groups: [{
                  name: 'initial-runtime',
                  // Keep static data with the runtime modules that consume it.
                  // Splitting JSON into a separate group creates a circular
                  // BdtJzCIA ↔ BXc0hjfS dependency in Rolldown.
                  test: (id: string) => /\.(?:[cm]?[jt]sx?|json)$/.test(id),
                  tags: ['$initial'],
                  minSize: 4 * 1024,
                  priority: 100,
                }],
              },
            },
          },
        },
      })
    },
    'pages:extend'(pages) {
      const addLocaleAliases = (page: typeof pages[number]) => {
        if (page.path.startsWith('/')) {
          const aliases = ['ru', 'en'].map(locale => `/${locale}${page.path}`)
          page.alias = [...(Array.isArray(page.alias) ? page.alias : page.alias ? [page.alias] : []), ...aliases]
        }
        page.children?.forEach(addLocaleAliases)
      }
      pages.forEach(addLocaleAliases)
    },
  },

  css: ['~/assets/css/main.css', 'lenis/dist/lenis.css'],

  // Bind on all interfaces so phone can open the LAN IP.
  // Device motion on iOS: use a public HTTPS tunnel (see preview:tunnel), not LAN HTTP.
  devServer: {
    port: 3000,
  },

  vite: {
    plugins: [tailwindcss()],
    resolve: {
      // The package root is one pre-bundled module. Pointing at Three's source
      // entry lets Rolldown remove unused subsystems before emitting the lazy
      // Hero vendor chunk.
      alias: [{ find: /^three$/, replacement: threeSourceEntry }],
    },
    server: {
      strictPort: true,
      // Case detail is a frequent but route-lazy page. Transform it at dev
      // startup so the first animated navigation cannot hit a cold waterfall.
      warmup: {
        clientFiles: ['./app/pages/projects/**/*.vue'],
      },
      // Localtunnel / Cloudflare quick tunnels hit Vite's host check otherwise.
      allowedHosts: ['.loca.lt', '.trycloudflare.com', '.ngrok-free.app', '.ngrok.io'],
      // Vite 8: WS options live on `server.ws` (hmr.* is deprecated).
      // Bind HMR on the Nuxt port, but do NOT force client protocol/port —
      // HTTPS tunnels need wss://host (443), LAN keeps ws://ip:3000 via location.
      ws: {
        port: 3000,
        timeout: 2000,
      },
    },
    optimizeDeps: {
      include: [
        'gsap',
        'gsap/ScrollTrigger',
        'lenis',
        'three',
        'three/examples/jsm/loaders/HDRLoader.js',
      ],
    },
  },

  app: {
    cdnURL: appAssetCdnUrl,
    head: {
      htmlAttrs: { lang: 'ru' },
      charset: 'utf-8',
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
        { name: 'theme-color', content: '#ece7dd' },
        // Error documents don't mount app.vue. Content pages override this via useSiteSeo.
        { name: 'robots', content: 'noindex, follow' },
      ],
      link: [
        ...(publicAssetCdnUrl
          ? [{ rel: 'preconnect' as const, href: publicAssetCdnUrl, crossorigin: 'anonymous' as const }]
          : []),
        {
          rel: 'preload',
          href: `${appAssetCdnUrl}/fonts/fixel/FixelCritical.woff2`,
          as: 'font',
          type: 'font/woff2',
          crossorigin: 'anonymous',
        },
        { rel: 'icon', href: '/favicon.ico', type: 'image/x-icon' },
        { rel: 'apple-touch-icon', href: '/apple-touch-icon.png', sizes: '180x180' },
      ],
      noscript: [{
        key: 'static-content-fallback',
        innerHTML: '<style>.home-hero__copy--intro-hidden,.case-detail--entering h1,.case-detail--entering .case-detail__meta,.case-detail--entering .case-detail__media{opacity:1!important;visibility:visible!important;transform:none!important}.home-hero__copy--css-intro .home-hero__title,.home-hero__copy--css-intro .home-hero__desc-lines{opacity:1!important;transform:none!important;animation:none!important}</style>',
      }],
      script: [
        {
          key: 'scroll-restoration-policy',
          innerHTML:
            "try{if('scrollRestoration'in history)history.scrollRestoration='manual'}catch(e){}",
          tagPosition: 'head',
        },
        {
          key: 'cookie-notice-state',
          innerHTML:
            "try{if(/(?:^|; )kado_cookie_notice=1(?:;|$)/.test(document.cookie))document.documentElement.classList.add('cookie-notice-seen')}catch(e){}",
          tagPosition: 'head',
        },
        {
          key: 'locale-redirect',
          innerHTML:
            "try{var p=location.pathname;var r=document.cookie.match(/(?:^|; )kadonext-root-locale=(ru|en)(?:;|$)/);if(!/^\\/(?:ru|en)(?:\\/|$)/.test(p)&&!(p==='/'&&r&&document.documentElement.lang===r[1])){var m=document.cookie.match(/(?:^|; )kadonext-locale=(ru|en)(?:;|$)/);var s=localStorage.getItem('kadonext-locale');var n=(navigator.languages&&navigator.languages[0])||navigator.language||'';var l=m?m[1]:(s==='ru'||s==='en'?s:(/^ru(?:-|$)/i.test(n)?'ru':'en'));document.cookie='kadonext-locale='+l+'; Path=/; Max-Age=31536000; SameSite=Lax';localStorage.setItem('kadonext-locale',l);location.replace('/'+l+(p==='/'?'/':p)+location.search+location.hash)}}catch(e){}",
          tagPosition: 'head',
        },
      ],
    },
  },

  nitro: {
    preset: 'static',
    // Emit Brotli/gzip siblings so static hosts can serve compressed text assets
    // without doing compression work at request time.
    compressPublicAssets: true,
    prerender: {
      routes: [...contentRoutes, ...localizedContentRoutes, '/robots.txt', '/sitemap.xml'],
    },
  },

  routeRules: {
    '/api/**': { prerender: false },
    '/_nuxt/**': {
      headers: { 'cache-control': 'public, max-age=31536000, immutable' },
    },
    '/fonts/**': {
      headers: { 'cache-control': 'public, max-age=31536000, immutable' },
    },
    '/**': {
      prerender: true,
      headers: { 'cache-control': 'public, max-age=0, must-revalidate' },
    },
  },
})
