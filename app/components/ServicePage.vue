<script setup lang="ts">
import serviceRoutes from '~/data/serviceRoutes.json'
import type { ServicePageId, ServicePageMessages } from '~/utils/servicePages'

const props = defineProps<{
  pageId: ServicePageId
  content: { page: ServicePageMessages['pages'][ServicePageId]; shared: ServicePageMessages['shared']; pages: ServicePageMessages['pages'] }
}>()

const localePath = useLocalePath()
const assetUrl = useCdnAsset()
const cases = useHomeCases()
const { navigateToSection } = useHomeSectionNavigation()
const page = computed(() => props.content.page)
const shared = computed(() => props.content.shared)
const number = computed(() => String(serviceRoutes.findIndex(item => item.id === props.pageId) + 1).padStart(2, '0'))
const related = computed(() => serviceRoutes.filter(item => item.id !== props.pageId).map(item => ({
  ...item,
  label: props.content.pages[item.id as ServicePageId].label,
})))
const projects = computed(() => page.value.projects.flatMap((entry) => {
  const project = cases.value.find(item => item.id === entry.id)
  return project ? [{ ...project, serviceText: entry.text }] : []
}))

function discuss(event: MouseEvent) {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
  event.preventDefault()
  void navigateToSection('contact')
}

const year = new Date().getFullYear()
</script>

<template>
  <main class="service-page" :class="`service-page--${pageId}`">
    <header class="service-hero service-container">
      <div class="service-hero__meta service-caption">
        <nav class="service-breadcrumb" :aria-label="shared.breadcrumb">
          <NuxtLink :to="localePath('/')">KADO</NuxtLink>
          <span aria-hidden="true">/</span>
          <NuxtLink v-if="pageId !== 'index'" :to="localePath('/services')">{{ shared.breadcrumb }}</NuxtLink>
          <span v-else>{{ shared.breadcrumb }}</span>
          <template v-if="pageId !== 'index'">
            <span aria-hidden="true">/</span>
            <span aria-current="page">{{ page.label }}</span>
          </template>
        </nav>
        <span class="service-hero__edition">{{ number }} / 04</span>
      </div>

      <nav class="service-sections" :aria-label="shared.breadcrumb">
        <NuxtLink
          v-for="service in serviceRoutes"
          data-button-hover
          :key="service.id"
          :to="localePath(service.path)"
          :aria-current="service.id === pageId ? 'page' : undefined"
        >{{ service.id === 'index' ? shared.allServices : content.pages[service.id as ServicePageId].label }}</NuxtLink>
      </nav>

      <h1 class="service-hero__title">
        <template v-for="(line, index) in page.title" :key="line">
          <br v-if="index > 0">
          <span>{{ line }}</span>
        </template>
      </h1>

      <div class="service-hero__lower">
        <div class="service-hero__copy">
          <p class="service-caption service-hero__studio">{{ shared.studio }}</p>
          <p class="service-hero__intro">{{ page.intro }}</p>
          <RoundAction class="service-action" :href="localePath('/#contact')" @click="discuss">{{ shared.discuss }}</RoundAction>
          <a class="service-hero__explore service-caption" href="#scope">
            {{ shared.explore }} <SiteIcon name="arrow-down-left" :size="18" />
          </a>
        </div>
        <figure class="service-hero__figure">
          <div class="service-hero__image">
            <img
              :src="assetUrl('/home/work/001-960.webp')"
              :alt="shared.heroCaption"
              width="960" height="960" fetchpriority="high" decoding="async"
            >
            <span class="service-hero__image-index service-caption" aria-hidden="true">K / {{ number }}</span>
          </div>
          <figcaption class="service-caption">{{ shared.heroCaption }}</figcaption>
        </figure>
      </div>
      <ul class="service-tags service-caption" :aria-label="shared.scopeLabel">
        <li v-for="tag in page.tags" :key="tag">{{ tag }}</li>
      </ul>
    </header>

    <section id="scope" class="service-scope">
      <div class="service-container">
        <div class="service-section-head">
          <p class="service-caption">(01) &nbsp; {{ shared.scopeLabel }}</p>
          <h2 class="service-heading"><span v-for="line in page.scopeTitle" :key="line">{{ line }}</span></h2>
          <p class="service-section-head__copy">{{ page.scopeIntro }}</p>
        </div>
        <div class="service-scope__rows">
          <div v-for="(item, index) in page.scope" :key="item.title" class="service-scope__row" :class="{ 'has-link': item.to }">
            <span class="service-caption service-scope__number">{{ String(index + 1).padStart(2, '0') }}</span>
            <h3>
              <NuxtLink v-if="item.to" :to="localePath(item.to)">{{ item.title }}</NuxtLink>
              <span v-else>{{ item.title }}</span>
            </h3>
            <p>{{ item.text }}</p>
            <SiteIcon v-if="item.to" name="arrow-up-right" class="service-scope__arrow" />
          </div>
        </div>
      </div>
    </section>

    <section class="service-statement service-container" :aria-label="page.statement.join(' ')">
      <p class="service-statement__mark service-caption" aria-hidden="true">KADŌ —</p>
      <h2 class="service-statement__title"><span v-for="line in page.statement" :key="line">{{ line }}</span></h2>
      <p class="service-statement__copy">{{ page.statementCopy }}</p>
      <svg class="service-statement__line" viewBox="0 0 240 120" fill="none" aria-hidden="true">
        <path d="M4 101C38 103 51 12 95 18c41 6 10 90 51 81 28-6 27-68 61-61 17 3 19 19 29 10" stroke="currentColor" stroke-width="1.5" />
      </svg>
    </section>

    <section class="service-work service-container">
      <div class="service-work__head">
        <p class="service-caption">(02) &nbsp; {{ shared.projectsLabel }}</p>
        <h2 class="service-heading">{{ shared.projectsTitle }}</h2>
      </div>
      <div class="service-work__grid">
        <article v-for="(project, index) in projects" :key="project.id" class="service-project">
          <NuxtLink :to="localePath(`/projects/${project.id}`)" class="service-project__image" :aria-label="`${shared.projectLink}: ${project.title}`">
            <picture>
              <source v-if="project.media.avifSrcset" type="image/avif" :srcset="project.media.avifSrcset" sizes="(max-width: 767px) 94vw, 58vw">
              <source v-if="project.media.webpSrcset" type="image/webp" :srcset="project.media.webpSrcset" sizes="(max-width: 767px) 94vw, 58vw">
              <img :src="project.media.src" :alt="project.media.alt" :width="project.media.width" :height="project.media.height" loading="lazy" decoding="async">
            </picture>
            <span class="service-project__open"><SiteIcon name="arrow-up-right" :size="30" /></span>
          </NuxtLink>
          <div class="service-project__meta">
            <span class="service-caption">0{{ index + 1 }}</span>
            <h3><NuxtLink :to="localePath(`/projects/${project.id}`)">{{ project.title }}</NuxtLink></h3>
            <span class="service-caption">{{ project.year }}</span>
          </div>
          <p class="service-project__copy">{{ project.serviceText }}</p>
        </article>
      </div>
    </section>

    <section class="service-process service-container">
      <div class="service-process__intro">
        <p class="service-caption">(03) &nbsp; {{ shared.processLabel }}</p>
        <h2 class="service-heading"><span v-for="line in page.processTitle" :key="line">{{ line }}</span></h2>
        <p>{{ page.processIntro }}</p>
      </div>
      <ol class="service-process__steps">
        <li v-for="(step, index) in page.steps" :key="step.title">
          <span class="service-caption">{{ String(index + 1).padStart(2, '0') }}</span>
          <div><h3>{{ step.title }}</h3><p>{{ step.text }}</p></div>
        </li>
      </ol>
    </section>

    <section class="service-pricing">
      <div class="service-container service-pricing__inner">
        <div class="service-pricing__intro">
          <p class="service-caption">(04) &nbsp; {{ shared.pricingLabel }}</p>
          <h2 class="service-heading"><span v-for="line in page.pricingTitle" :key="line">{{ line }}</span></h2>
          <p>{{ page.pricingIntro }}</p>
        </div>
        <div class="service-pricing__items">
          <div v-for="item in page.pricing" :key="item.title" class="service-price">
            <h3 class="service-caption">{{ item.title }}</h3>
            <p class="service-price__value">{{ item.value }}</p>
            <p class="service-price__detail">{{ item.detail }}</p>
          </div>
          <a class="service-inline-link" :href="localePath('/#contact')" @click="discuss">{{ shared.discuss }} <SiteIcon name="arrow-up-right" :size="20" /></a>
        </div>
      </div>
    </section>

    <section class="service-faq service-container">
      <div class="service-faq__intro">
        <p class="service-caption">(05) &nbsp; {{ shared.faqLabel }}</p>
        <h2 class="service-heading">{{ shared.faqTitle }}</h2>
      </div>
      <div class="service-faq__items">
        <details v-for="item in page.faq" :key="item.question">
          <summary>{{ item.question }}<span class="service-faq__toggle" aria-hidden="true" /></summary>
          <p>{{ item.answer }}</p>
        </details>
      </div>
    </section>

    <nav class="service-related service-container" :aria-label="shared.relatedLabel">
      <p class="service-caption">{{ shared.relatedLabel }}</p>
      <NuxtLink v-for="item in related" :key="item.id" :to="localePath(item.path)">{{ item.label }}<SiteIcon name="arrow-up-right" :size="22" /></NuxtLink>
    </nav>

    <section class="service-contact">
      <div class="service-container">
        <p class="service-caption">KADO / {{ shared.discuss }}</p>
        <a class="service-contact__title" :href="localePath('/#contact')" @click="discuss">
          <span><span v-for="line in shared.contactTitle" :key="line">{{ line }}</span></span>
          <SiteIcon name="arrow-up-right" />
        </a>
        <div class="service-contact__bottom">
          <p>{{ shared.contactCopy }}</p>
          <a class="service-inline-link" :href="localePath('/#contact')" @click="discuss">{{ shared.contactLink }} <SiteIcon name="arrow-up-right" :size="20" /></a>
        </div>
      </div>
    </section>

    <footer class="service-footer service-container service-caption">
      <NuxtLink :to="localePath('/')">{{ year }} KADŌ</NuxtLink>
      <p>{{ shared.footer }}</p>
      <LanguageSwitch />
      <a href="mailto:hello@kadonext.com">hello@kadonext.com</a>
      <NuxtLink :to="localePath('/privacy')">{{ shared.privacy }}</NuxtLink>
    </footer>
  </main>
</template>

<style scoped>
.service-page { --service-rule: color-mix(in srgb, var(--palette-ink) 22%, transparent); min-height: var(--app-screen); background: var(--palette-sand); color: var(--palette-ink); }
.service-container { width: min(var(--layout-content-max), calc(100% - var(--layout-margin-content, var(--layout-margin)) * 2)); margin-inline: auto; }
.service-caption { margin: 0; font-size: var(--type-case-body-small); line-height: 1.3; font-weight: 400; letter-spacing: -.02em; }
.service-heading { margin: 0; font-size: var(--type-display); font-weight: 400; line-height: .99; letter-spacing: -.055em; }
.service-heading > span, .service-statement__title > span { display: block; }
.service-hero { padding-top: calc(var(--layout-surface-top) + var(--space-block)); }
.service-hero__meta { display: flex; justify-content: space-between; gap: var(--space-3); margin-bottom: var(--space-5); }
.service-breadcrumb { display: flex; flex-wrap: wrap; gap: .55em; color: var(--palette-ash); }
.service-breadcrumb a { color: var(--palette-ink); }
.service-breadcrumb a:hover { text-decoration: underline; text-underline-offset: .2em; }
.service-hero__edition { flex-shrink: 0; font-variant-numeric: tabular-nums; }
.service-hero__title { position: relative; z-index: 1; margin: 0; font-size: calc(var(--type-catalog-title) * .64); font-weight: 400; line-height: .91; letter-spacing: -.065em; }
.service-hero__lower { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); column-gap: var(--layout-gutter); align-items: start; margin-top: var(--space-5); }
.service-hero__copy { grid-column: 2 / span 5; padding-top: var(--space-4); }
.service-hero__studio { max-width: 19em; color: var(--palette-ash); }
.service-hero__intro { max-width: 27em; margin: var(--space-3) 0 0; font-size: var(--type-lead); line-height: 1.35; letter-spacing: -.025em; }
.service-action { margin-top: var(--space-4); }
.service-sections { display: flex; flex-wrap: wrap; gap: .5rem; margin-bottom: var(--space-4); }
.service-sections a { display: inline-flex; min-height: 44px; align-items: center; padding: .55em 1em; border: 1px solid var(--service-rule); border-radius: 999px; font-size: var(--type-case-body-small); color: inherit; text-decoration: none; }
.service-sections a[aria-current='page'] { border-color: var(--palette-forest); background: var(--palette-forest); color: var(--palette-milk); }
.service-sections a:hover { border-color: var(--palette-forest); }
.service-sections a:focus-visible { outline: 2px solid var(--palette-forest); outline-offset: 3px; }
.service-hero__explore { display: flex; align-items: center; gap: .65em; width: fit-content; margin-top: var(--space-4); color: var(--palette-ash); }
.service-hero__figure { grid-column: 9 / -1; margin: calc(var(--space-6) * -1) 0 0; }
.service-hero__image { position: relative; aspect-ratio: .9; overflow: hidden; border-radius: var(--radius-surface); background: var(--palette-stone); }
.service-hero__image img { width: 100%; height: 100%; object-fit: cover; }
.service-hero__image-index { position: absolute; right: var(--space-2); bottom: var(--space-2); padding: .4em .6em; border-radius: var(--radius-surface); background: var(--palette-sand); }
.service-hero__figure figcaption { padding-top: var(--space-2); color: var(--palette-ash); }
.service-tags { display: flex; flex-wrap: wrap; gap: var(--space-2) var(--space-4); margin: var(--space-6) 0 var(--space-6); padding: var(--space-3) 0 0; border-top: 1px solid var(--service-rule); list-style: none; }
.service-tags li::before { display: inline-block; width: .3em; height: .3em; margin-right: .65em; border-radius: 50%; background: var(--palette-forest); content: ''; vertical-align: .15em; }
.service-scope { padding-block: var(--space-6); border-radius: var(--flow-surface-radius); background: var(--palette-forest); color: var(--palette-milk); scroll-margin-top: var(--layout-surface-top); }
.service-section-head { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); gap: var(--space-4) var(--layout-gutter); align-items: start; }
.service-section-head > .service-caption { grid-column: 1 / -1; }
.service-section-head > h2 { grid-column: 1 / span 7; }
.service-section-head__copy { grid-column: 9 / -1; margin: .2em 0 0; font-size: var(--type-body); line-height: 1.45; }
.service-scope__rows { margin-top: var(--space-5); }
.service-scope__row { position: relative; display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); gap: var(--space-2) var(--layout-gutter); align-items: start; padding: var(--space-4) 0; border-top: 1px solid color-mix(in srgb, var(--palette-milk) 30%, transparent); }
.service-scope__number { grid-column: 1; padding-top: .45em; }
.service-scope__row h3 { grid-column: 2 / span 5; margin: 0; font-size: calc(var(--type-case-title) * .8); line-height: 1; letter-spacing: -.05em; }
.service-scope__row h3 a::after { position: absolute; inset: 0; content: ''; }
.service-scope__row p { grid-column: 8 / span 4; margin: .2em 0 0; font-size: var(--type-body); line-height: 1.45; }
.service-scope__arrow { grid-column: 12; justify-self: end; width: var(--type-slogan); height: var(--type-slogan); transition: transform .3s ease; }
.service-scope__row:has(a:hover) .service-scope__arrow { transform: translate(4px, -4px); }
.service-statement { position: relative; display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); gap: var(--space-4) var(--layout-gutter); padding-block: var(--space-section); }
.service-statement__mark { grid-column: 1 / -1; color: var(--palette-ash); }
.service-statement__title { grid-column: 2 / -1; margin: 0; font-size: var(--type-case-title); line-height: 1.03; font-weight: 400; letter-spacing: -.055em; }
.service-statement__copy { grid-column: 8 / -1; margin: var(--space-2) 0 0; font-size: var(--type-lead); line-height: 1.4; letter-spacing: -.025em; }
.service-statement__line { grid-column: 2 / span 3; grid-row: 3; align-self: center; width: 100%; max-width: 240px; color: var(--palette-forest); }
.service-work__head { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); gap: var(--space-3) var(--layout-gutter); margin-bottom: var(--space-5); }
.service-work__head > p { grid-column: 1 / -1; }
.service-work__head h2 { grid-column: 1 / span 8; }
.service-work__grid { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); gap: var(--layout-gutter); align-items: start; }
.service-project:first-child { grid-column: 1 / span 7; }
.service-project:nth-child(2) { grid-column: 9 / -1; margin-top: var(--space-7); }
.service-project__image { position: relative; display: block; aspect-ratio: 1.2; overflow: hidden; border-radius: var(--radius-surface); background: var(--palette-stone); }
.service-project:nth-child(2) .service-project__image { aspect-ratio: .8; }
.service-project__image picture { display: contents; }
.service-project__image img { width: 100%; height: 100%; object-fit: cover; transition: transform .7s cubic-bezier(.22, 1, .36, 1); }
.service-project__open { position: absolute; right: var(--space-2); bottom: var(--space-2); display: grid; width: 3.4rem; height: 3.4rem; place-items: center; border-radius: 50%; background: var(--palette-milk); color: var(--palette-ink); }
.service-project__image:hover img { transform: scale(1.035); }
.service-project__meta { display: flex; align-items: baseline; gap: var(--space-2); padding-top: var(--space-3); }
.service-project__meta h3 { margin: 0; font-size: var(--type-lead); line-height: 1; letter-spacing: -.035em; }
.service-project__meta > :last-child { margin-left: auto; }
.service-project__copy { max-width: 32em; margin: var(--space-2) 0 0; padding-left: 2.25em; font-size: var(--type-case-body-small); line-height: 1.5; color: var(--palette-ash); }
.service-process { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); gap: var(--space-5) var(--layout-gutter); padding-block: var(--space-section); }
.service-process__intro { grid-column: 1 / span 6; }
.service-process__intro h2 { margin-top: var(--space-4); }
.service-process__intro > p:last-child { max-width: 28em; margin: var(--space-4) 0 0; font-size: var(--type-body); line-height: 1.45; }
.service-process__steps { grid-column: 7 / -1; margin: 0; padding: 0; list-style: none; }
.service-process__steps li { display: grid; grid-template-columns: auto 1fr; column-gap: var(--space-3); padding-block: var(--space-3); border-top: 1px solid var(--service-rule); }
.service-process__steps li > span { padding-top: .3em; color: var(--palette-ash); }
.service-process__steps h3 { margin: 0; font-size: var(--type-lead); line-height: 1.15; letter-spacing: -.035em; }
.service-process__steps p { margin: var(--space-2) 0 0; font-size: var(--type-body); line-height: 1.45; color: var(--palette-ash); }
.service-pricing { padding-block: var(--space-6); background: var(--palette-stone); border-radius: var(--flow-surface-radius); }
.service-pricing__inner { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); gap: var(--space-5) var(--layout-gutter); }
.service-pricing__intro { grid-column: 1 / span 6; }
.service-pricing__intro h2 { margin-top: var(--space-4); }
.service-pricing__intro > p:last-child { max-width: 27em; margin: var(--space-4) 0 0; font-size: var(--type-body); line-height: 1.45; }
.service-pricing__items { grid-column: 8 / -1; padding-top: .15em; }
.service-price { padding-block: var(--space-3); border-top: 1px solid var(--service-rule); }
.service-price__value { margin: var(--space-3) 0 0; font-size: var(--type-slogan); line-height: 1.1; letter-spacing: -.045em; }
.service-price__detail { margin: var(--space-2) 0 0; font-size: var(--type-case-body-small); line-height: 1.5; color: var(--palette-ash); }
.service-inline-link { display: inline-flex; align-items: center; gap: var(--space-2); padding-block: .6em; font-size: var(--type-nav); border-bottom: 1px solid currentColor; }
.service-faq { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); gap: var(--space-5) var(--layout-gutter); padding-block: var(--space-section); }
.service-faq__intro { grid-column: 1 / span 5; }
.service-faq__intro h2 { margin-top: var(--space-4); }
.service-faq__items { grid-column: 7 / -1; }
.service-faq details { border-top: 1px solid var(--service-rule); }
.service-faq details:last-child { border-bottom: 1px solid var(--service-rule); }
.service-faq summary { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); padding-block: var(--space-3); cursor: pointer; list-style: none; font-size: var(--type-lead); line-height: 1.2; letter-spacing: -.03em; }
.service-faq summary::-webkit-details-marker { display: none; }
.service-faq__toggle { position: relative; flex-shrink: 0; width: 1.3rem; height: 1.3rem; }
.service-faq__toggle::before, .service-faq__toggle::after { position: absolute; top: 50%; left: 0; width: 100%; height: 1px; background: currentColor; content: ''; }
.service-faq__toggle::after { transform: rotate(90deg); transition: transform .25s ease; }
.service-faq details[open] .service-faq__toggle::after { transform: rotate(0); }
.service-faq details > p { max-width: 36em; margin: 0 0 var(--space-3); padding-right: var(--space-4); font-size: var(--type-body); line-height: 1.5; color: var(--palette-ash); }
.service-related { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--space-3) var(--layout-gutter); align-items: start; padding-bottom: var(--space-6); }
.service-related > p { color: var(--palette-ash); }
.service-related > a { display: flex; justify-content: space-between; gap: var(--space-2); padding-bottom: var(--space-2); border-bottom: 1px solid var(--service-rule); font-size: var(--type-body); line-height: 1.3; }
.service-contact { padding-block: var(--space-6); background: var(--palette-forest); color: var(--palette-milk); border-radius: var(--flow-surface-radius); }
.service-contact__title { display: flex; align-items: center; justify-content: space-between; gap: var(--layout-gutter); margin-top: var(--space-5); font-size: calc(var(--type-catalog-title) * .56); line-height: .95; letter-spacing: -.06em; }
.service-contact__title > span > span { display: block; }
.service-contact__title > svg { flex-shrink: 0; width: .85em; height: .85em; stroke-width: .8; transition: transform .35s ease; }
.service-contact__title:hover > svg { transform: translate(8px, -8px); }
.service-contact__bottom { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); column-gap: var(--layout-gutter); align-items: end; margin-top: var(--space-5); }
.service-contact__bottom > p { grid-column: 1 / span 5; max-width: 27em; margin: 0; font-size: var(--type-body); line-height: 1.45; }
.service-contact__bottom > a { grid-column: 9 / -1; justify-self: start; }
.service-footer { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-3); padding-block: var(--space-4); padding-bottom: max(var(--space-4), calc(var(--safe-bottom) + 6rem)); }
.service-footer > p { margin: 0; color: var(--palette-ash); }
.service-page a:focus-visible, .service-page summary:focus-visible { outline: 2px solid currentColor; outline-offset: 5px; border-radius: 2px; }
@media (min-width: 768px) and (max-width: 1100px) {
  .service-hero__copy { grid-column: 1 / span 6; }
  .service-hero__figure { grid-column: 9 / -1; margin-top: 0; }
  .service-section-head > h2 { grid-column: 1 / span 7; }
  .service-section-head__copy { grid-column: 8 / -1; }
  .service-statement__title { grid-column: 1 / -1; }
  .service-statement__copy { grid-column: 6 / -1; }
  .service-pricing__intro { grid-column: 1 / span 6; }
  .service-pricing__items { grid-column: 8 / -1; }
}
@media (max-width: 767px) {
  .service-container { width: calc(100% - max(var(--layout-margin), 1rem) * 2); }
  .service-hero { padding-top: calc(var(--layout-surface-top) + var(--space-block)); }
  .service-hero__meta { margin-bottom: var(--space-4); }
  .service-breadcrumb { max-width: 80%; font-size: .85em; }
  .service-hero__title { font-size: min(calc(var(--type-catalog-title) * .82), 13.4vw); line-height: .96; }
  .service-page--corporate .service-hero__title { font-size: min(calc(var(--type-catalog-title) * .7), 11vw); }
  .service-hero__lower { grid-template-columns: repeat(6, minmax(0, 1fr)); row-gap: var(--space-4); margin-top: var(--space-4); }
  .service-hero__copy { grid-column: 1 / -1; padding-top: 0; }
  .service-hero__intro { max-width: 30em; }
  .service-hero__figure { grid-column: 3 / -1; margin: 0; }
  .service-hero__image { aspect-ratio: 1.1; }
  .service-hero__studio { max-width: none; }
  .service-hero__explore { margin-top: var(--space-3); }
  .service-tags { gap: var(--space-2); margin-top: var(--space-4); font-size: .8rem; }
  .service-section-head { grid-template-columns: 1fr; row-gap: var(--space-3); }
  .service-section-head > h2, .service-section-head__copy { grid-column: 1; }
  .service-section-head__copy { max-width: 30em; }
  .service-scope__row { grid-template-columns: 1.4rem 1fr auto; column-gap: var(--space-2); }
  .service-scope__number { grid-column: 1; padding-top: .2em; font-size: .8rem; }
  .service-scope__row h3 { grid-column: 2; font-size: calc(var(--type-display) * .85); }
  .service-scope__row p { grid-column: 2 / -1; max-width: 30em; margin-top: var(--space-2); }
  .service-scope__arrow { grid-column: 3; grid-row: 1; }
  .service-statement { grid-template-columns: repeat(6, minmax(0, 1fr)); }
  .service-statement__title { grid-column: 1 / -1; font-size: var(--type-display); }
  .service-statement__copy { grid-column: 2 / -1; margin-top: var(--space-3); font-size: var(--type-body); }
  .service-statement__line { grid-column: 1 / span 2; grid-row: 4; max-width: 140px; }
  .service-work__head { grid-template-columns: 1fr; }
  .service-work__head h2 { grid-column: 1; }
  .service-work__grid { grid-template-columns: repeat(6, minmax(0, 1fr)); row-gap: var(--space-5); }
  .service-project:first-child { grid-column: 1 / -1; }
  .service-project:nth-child(2) { grid-column: 2 / -1; margin-top: 0; }
  .service-project:nth-child(2) .service-project__image { aspect-ratio: 1.1; }
  .service-process, .service-pricing__inner, .service-faq { grid-template-columns: 1fr; }
  .service-process__intro, .service-process__steps, .service-pricing__intro, .service-pricing__items, .service-faq__intro, .service-faq__items { grid-column: 1; }
  .service-process__intro > p:last-child, .service-pricing__intro > p:last-child { max-width: 30em; }
  .service-related { grid-template-columns: 1fr; }
  .service-related > p { margin-bottom: var(--space-2); }
  .service-contact__title { align-items: start; font-size: calc(var(--type-catalog-title) * .68); }
  .service-contact__title > svg { width: .65em; height: .65em; margin-top: .12em; }
  .service-contact__bottom { grid-template-columns: 1fr; row-gap: var(--space-3); }
  .service-contact__bottom > p, .service-contact__bottom > a { grid-column: 1; }
  .service-footer { display: grid; grid-template-columns: 1fr auto; font-size: .8rem; }
  .service-footer > p { grid-column: 1; grid-row: 2; }
  .service-footer > :nth-child(3) { grid-column: 2; grid-row: 1; justify-self: end; }
  .service-footer > :nth-child(4), .service-footer > :nth-child(5) { grid-column: 1 / -1; }
}
</style>
