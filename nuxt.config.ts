import tailwindcss from '@tailwindcss/vite'
import { homeCaseIds } from './app/utils/homeCases'

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

  runtimeConfig: {
    public: {
      // Static hosting proxies this path to the separate SMTP gateway.
      // Alternatively set its HTTPS URL with NUXT_PUBLIC_CONTACT_ENDPOINT.
      contactEndpoint: '/api/contact',
      // Set false for preview builds; static hosts must publish a fresh build.
      siteIndexable: process.env.NUXT_PUBLIC_SITE_INDEXABLE !== 'false' && process.env.NODE_ENV !== 'development',
    },
  },

  modules: ['@nuxt/fonts'],

  css: ['~/assets/css/main.css', 'lenis/dist/lenis.css'],

  // Bind on all interfaces so phone can open the LAN IP.
  // Device motion on iOS: use a public HTTPS tunnel (see preview:tunnel), not LAN HTTP.
  devServer: {
    host: '0.0.0.0',
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
      host: true,
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

  fonts: {
    defaults: {
      // Preload only the face used by above-the-fold UI. Other weights load
      // when their sections approach instead of competing on mobile startup.
      preload: false,
    },
    // The site is fully self-hosted: avoid provider metadata requests during builds.
    providers: {
      adobe: false,
      bunny: false,
      fontshare: false,
      fontsource: false,
      google: false,
      googleicons: false,
      npm: false,
    },
    families: [
      {
        name: 'Fixel Text',
        provider: 'local',
        weights: [300, 400, 500, 600, 700],
        styles: ['normal'],
        display: 'swap',
        // The local WOFF2 files contain both extended Latin and Cyrillic.
        // `latin` is only the local provider's filename lookup key.
        subsets: ['latin'],
      },
      {
        name: 'Fixel Display',
        provider: 'local',
        weights: [300, 400, 500, 600, 700],
        styles: ['normal'],
        display: 'swap',
        subsets: ['latin'],
      },
    ],
  },

  app: {
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
        { key: 'favicon-ico', rel: 'icon', href: '/favicon.ico', sizes: '16x16 32x32 48x48 96x96', media: '(prefers-color-scheme: light)' },
        { key: 'favicon-png', rel: 'icon', href: '/favicon-96.png', type: 'image/png', sizes: '96x96', media: '(prefers-color-scheme: light)' },
        { key: 'favicon-dark-ico', rel: 'icon', href: '/favicon-dark.ico', sizes: '16x16 32x32 48x48 96x96', media: '(prefers-color-scheme: dark)' },
        { key: 'favicon-dark-png', rel: 'icon', href: '/favicon-dark-96.png', type: 'image/png', sizes: '96x96', media: '(prefers-color-scheme: dark)' },
        { rel: 'apple-touch-icon', href: '/apple-touch-icon.png', sizes: '180x180' },
      ],
      noscript: [{
        key: 'static-content-fallback',
        innerHTML: '<style>.brand-preload{display:none!important}.home-hero__copy--intro-hidden,.case-detail--entering h1,.case-detail--entering .case-detail__meta,.case-detail--entering .case-detail__media{opacity:1!important;visibility:visible!important;transform:none!important}</style>',
      }],
      // Before first paint: warm revisit shows full black macron, not empty gray track.
      script: [
        {
          key: 'preload-warm',
          innerHTML:
            "try{if(localStorage.getItem('kadonext-preload-seen')==='1')document.documentElement.setAttribute('data-preload-warm','1')}catch(e){}",
          tagPosition: 'head',
        },
      ],
      style: [
        {
          key: 'preload-warm-css',
          innerHTML:
            'html[data-preload-warm] .brand-preload__arc:not(.brand-preload__arc--track){stroke-dashoffset:0!important}',
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
      routes: ['/', '/projects', '/privacy', '/consent', '/robots.txt', '/sitemap.xml', ...homeCaseIds.map(id => `/projects/${id}`)],
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
