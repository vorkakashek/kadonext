<script setup lang="ts">
import { CONTACT_CONSENT_EMAIL } from '../../contact-api/consent.mjs'

const currentYear = new Date().getFullYear()
const localePath = useLocalePath()
const sections = [
  {
    title: 'Giving consent',
    paragraphs: [
      'Freely, voluntarily and in my own interest, I consent to the processing by Anton Alekseevich Khokhlov of the personal data I submit through the inquiry form on kadonext.com.',
      'I give consent by selecting the relevant checkbox and submitting the form. It covers reviewing and responding to my inquiry and does not include advertising mailings, web analytics or public distribution of my data.',
    ],
  },
  { title: 'Purpose of processing', paragraphs: ['Reviewing the inquiry, understanding the project brief, contacting me using the details provided, discussing the project and preparing a proposal in response to my inquiry.'] },
  {
    title: 'Data involved',
    paragraphs: [
      'My name or chosen identifier, email address, messenger username and telephone number, to the extent I include them in the contact field; the project brief and description; and other information about me that I voluntarily include in the inquiry.',
      'If I attach voice messages, this consent covers the selected recordings containing my voice and project description. They are used to understand and answer the inquiry, not to identify me by my voice. Voice messages are optional; I may describe the project in writing.',
      'The fact that consent was given, the consent text and version, and the date and time of submission are retained as evidence. I should not include passport data, health information, other special categories of personal data or another person’s data without a lawful basis.',
    ],
  },
  {
    title: 'Actions involving the data',
    paragraphs: [
      'Processing may be automated or non-automated and may include collection, recording, organization, accumulation, storage, correction, retrieval, use, providing processors with necessary access, restriction, deletion and destruction.',
      'After submission, data is sent to a server-side processor and delivered over an encrypted SMTP connection to the operator’s private mailbox. Voice messages are temporarily stored on the server for validation and MP3 conversion. Temporary files are deleted after processing; delivered text, recordings and the consent snapshot remain in the mailbox until the operator deletes them.',
      'Hosting, SMTP delivery and mailbox providers may process the data to the extent required to receive, deliver and store the inquiry and enable a reply. Such processing must have a lawful basis and meet the applicable confidentiality and security requirements.',
    ],
  },
  {
    title: 'Delivery by email',
    paragraphs: [
      'I have been informed that a server-side processor and the REG.RU email service with the operator’s private mailbox are used to deliver and store the inquiry. The providers receive the inquiry and attachments only to the extent needed to deliver and store the email.',
      'If the selected provider’s infrastructure involves a cross-border transfer, that delivery channel is enabled only after the operator has complied with the applicable requirements of Russian law.',
    ],
  },
  {
    title: 'Duration and withdrawal',
    paragraphs: [
      'This consent remains valid until the processing purpose is fulfilled, but for no more than three years after the last substantive contact concerning the inquiry, or until I withdraw consent, whichever comes first.',
      'I may withdraw consent by emailing hello@kadonext.com with the subject “Withdrawal of consent to personal data processing” and information that allows my inquiry to be located.',
      'After the purpose is fulfilled or consent is withdrawn, the operator stops processing and deletes the data within the periods required by law unless another lawful basis applies. If I enter into a contract with the operator, data required to perform it may be processed on the corresponding legal basis.',
    ],
  },
] as const
</script>

<template>
  <main class="privacy-page pointer-events-auto">
    <header class="privacy-page__hero">
      <NuxtLink class="privacy-page__brand" :to="localePath('/')">KADO</NuxtLink>
      <p class="privacy-page__eyebrow">documents</p>
      <h1>Consent to personal data processing</h1>
      <div class="privacy-page__meta">
        <p>Version dated 22 September 2026</p>
        <p>Website: <a href="https://kadonext.com">kadonext.com</a></p>
      </div>
    </header>

    <article class="privacy-page__body">
      <aside class="privacy-page__operator" aria-label="Translation status">This English translation is provided for convenience. If it differs from the <NuxtLink to="/ru/consent">Russian version</NuxtLink>, the Russian version governs.</aside>
      <section v-for="(section, index) in sections" :key="section.title">
        <h2><span>{{ String(index + 1).padStart(2, '0') }}</span> {{ section.title }}</h2>
        <div class="privacy-page__section-copy">
          <p v-for="paragraph in section.paragraphs" :key="paragraph">{{ paragraph }}</p>
        </div>
      </section>
      <section>
        <h2><span>07</span> Data processing policy</h2>
        <div class="privacy-page__section-copy">
          <p>General information about data processing and protection appears in the <NuxtLink :to="localePath('/privacy')">Personal data processing policy</NuxtLink>.</p>
        </div>
      </section>

      <aside class="privacy-page__operator" aria-label="Operator details">
        <strong>Operator details</strong>
        <p>Personal data operator: Anton Alekseevich Khokhlov (Хохлов Антон Алексеевич), a payer of tax on professional income (self-employed).</p>
        <p>Personal-data inquiries: <a :href="`mailto:${CONTACT_CONSENT_EMAIL}`">{{ CONTACT_CONSENT_EMAIL }}</a>.</p>
      </aside>
    </article>

    <footer class="privacy-page__footer">
      <span>{{ currentYear }} KADO</span>
      <NuxtLink :to="localePath('/')">home</NuxtLink>
      <a :href="`mailto:${CONTACT_CONSENT_EMAIL}`">{{ CONTACT_CONSENT_EMAIL }}</a>
    </footer>
  </main>
</template>

<style scoped src="../styles/legal-document.css"></style>
