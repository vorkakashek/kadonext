export type ServicePageId = 'index' | 'redesign' | 'corporate' | 'landing'

export interface ServicePageCopy {
  label: string
  title: string[]
  intro: string
  tags: string[]
  statement: string[]
  statementCopy: string
  scopeTitle: string[]
  scopeIntro: string
  scope: Array<{ title: string; text: string; to: string }>
  processTitle: string[]
  processIntro: string
  steps: Array<{ title: string; text: string }>
  projects: Array<{ id: string; text: string }>
  pricingTitle: string[]
  pricingIntro: string
  pricing: Array<{ title: string; value: string; detail: string }>
  faq: Array<{ question: string; answer: string }>
  seo: { title: string; description: string }
}

export interface ServicePageMessages {
  shared: {
    breadcrumb: string
    allServices: string
    studio: string
    discuss: string
    explore: string
    heroCaption: string
    scopeLabel: string
    processLabel: string
    projectsLabel: string
    projectsTitle: string
    projectLink: string
    pricingLabel: string
    faqLabel: string
    faqTitle: string
    relatedLabel: string
    contactTitle: string[]
    contactCopy: string
    contactLink: string
    privacy: string
    footer: string
  }
  pages: Record<ServicePageId, ServicePageCopy>
}
