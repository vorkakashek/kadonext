<script setup lang="ts">
const currentYear = new Date().getFullYear()
const localePath = useLocalePath()

const sections = [
  {
    title: 'General provisions',
    paragraphs: [
      'This Policy sets out how the operator processes and protects personal data when visitors use kadonext.com, use its features or contact the operator.',
      'The Policy has been prepared under Federal Law No. 152-FZ “On Personal Data” dated 27 July 2006. The operator processes only the data needed for specified purposes and does not process it in a manner incompatible with those purposes.',
      'The website can be viewed without providing a name, telephone number or email address. The website uses no advertising or analytics cookies and connects no third-party web analytics service.',
    ],
  },
  {
    title: 'Data processed',
    subtitles: [
      {
        title: 'Inquiry data',
        paragraphs: [
          'A name or chosen identifier, email address, telephone number, messenger username, information about the project, its stage, timing and budget, links to materials, and any other information a visitor voluntarily includes in an inquiry.',
          'The operator also records the fact that consent was given, the version and text of that consent, and the date and time the inquiry was submitted.',
          'A visitor may optionally attach voice messages. Recordings contain the visitor’s voice and any sounds captured by the microphone. They are used to understand and answer the inquiry, not to identify the person by their voice.',
        ],
      },
      {
        title: 'Technical data',
        paragraphs: [
          'To deliver pages and protect the website, the web server receives request data including the IP address, date and time, requested address and browser headers. It is used only as necessary to return the response, prevent abuse and diagnose faults.',
          'The first-party traffic counter records only the calendar date, requested page path without query parameters, browser family, two-letter country code and a broad referrer category. The full User-Agent and referrer URL are immediately reduced to categories. Country is resolved from the IP address on the server, after which the IP address itself is not written to the counter log. The log also contains no search query, cookies or another visitor identifier. It counts page loads, not unique people, and cannot link separate loads to one visitor.',
          'The operator does not intend to process special categories of personal data or biometric personal data. Visitors should not include such information in free-text fields or emails unless it is necessary for the inquiry.',
        ],
      },
    ],
  },
  {
    title: 'Purposes and legal grounds',
    purpose: true,
    subtitles: [
      { title: 'Responding to an inquiry', paragraphs: ['Discussing a project, preparing a proposal, contacting the visitor and taking steps at the visitor’s request before entering into a contract. The legal basis is the visitor’s consent and, where applicable, the need to take pre-contractual steps at the visitor’s request.'] },
      { title: 'Operation and security', paragraphs: ['Displaying pages correctly, remembering visitor choices, preventing abuse and diagnosing errors. Only the minimum technical data needed to operate the website and protect the legitimate interests of the operator and visitors is processed.'] },
      { title: 'Traffic measurement', paragraphs: ['Measuring page loads and improving the website’s structure, content and performance. A minimised first-party log includes broad browser and referrer categories and a country code but uses no cookies or visitor profiles and is not disclosed to web analytics services. The minimum technical processing is necessary to operate the website and protect the operator’s legitimate interests without overriding visitor rights and freedoms.'] },
    ],
  },
  {
    title: 'How data is processed',
    paragraphs: [
      'Processing may be automated and, when handling inquiries, non-automated. It may include collection, recording, organization, accumulation, storage, correction, retrieval, use, providing processors with necessary access, restriction, deletion and destruction.',
      'Before the form is submitted, text and voice messages remain in browser memory. The microphone is activated only after a visitor action and browser permission. Sound-level analysis occurs on the visitor’s device. Unsent recordings are deleted when the page reloads and are not written to local storage.',
      'When the form is submitted, the entered information and selected voice messages are sent to the inquiry processor. Audio files are stored temporarily for validation and conversion to MP3, then the temporary files are deleted. The inquiry, recordings and a consent snapshot are delivered over an encrypted SMTP connection to the operator’s private mailbox and remain there until the operator deletes them. When a visitor uses the direct email link, the visitor sends the message from their own email application.',
      'The operator does not publish or sell personal data and does not make solely automated decisions based on it that produce legal effects for the visitor.',
    ],
  },
  {
    title: 'Cookies and local storage',
    html: [
      'The website uses essential browser storage. The <code>kado_motion_intro</code> cookie, retained for up to 7 days, records whether motion-control guidance has been shown. The <code>kado_cookie_notice</code> cookie, retained for up to 30 days, records that the cookie notice has been seen. The <code>kadonext-case-gesture-hint-v2</code> cookie, retained for up to 7 days, prevents the case-navigation hint from being shown repeatedly.',
      'The <code>kadonext-locale</code> and <code>kadonext-root-locale</code> cookies, retained for up to one year, and the <code>kadonext-locale</code> browser local-storage entry remember the selected language and prevent an unnecessary redirect. The local entry remains until the visitor or browser deletes it. All these entries contain only a setting value, no name or contact details, and are required for interface features requested by the visitor.',
      'The first-party traffic counter uses no cookies, local storage or device fingerprint. If analytics using identifiers or third-party cookies is introduced later, it will not run before separate visitor consent is obtained and this Policy is updated.',
      'Blocking all cookies may affect remembered interface settings but does not prevent access to website content.',
    ],
  },
  {
    title: 'Hosting, email and other parties',
    html: [
      'Traffic measurement runs on the KADO server. No data is sent to Yandex Metrica, Google Analytics or another web analytics service. The Russian hosting provider operates the server and may process technical data only as needed to supply and secure the service.',
      'Country is resolved using the local <a href="https://db-ip.com" target="_blank" rel="noopener noreferrer">DB-IP Country Lite</a> database. The IP address is not sent to DB-IP or another party.',
      'The operator uses a server-side processor and the REG.RU email service, supplied by Registrar of Domain Names REG.RU LLC, with a private mailbox to deliver inquiries. Those providers receive information voluntarily included in the inquiry, selected voice messages, the submission date and confirmation of consent only to the extent needed to deliver and store the email.',
      'REG.RU processing is governed by its <a href="https://www.reg.ru/company/privacy" target="_blank" rel="noopener noreferrer">personal-data processing policy</a>. This Policy is updated before another provider is enabled. If the new provider’s infrastructure involves a cross-border transfer, the channel is enabled only after the applicable processor-engagement and cross-border-transfer requirements have been met.',
      'Hosting, information-security, email and message-delivery providers may also access data to the extent necessary to provide their services, perform their contract with the operator and comply with law. The operator requires confidentiality and appropriate protection. Data is disclosed to other parties only with the data subject’s consent or on another legal basis.',
    ],
  },
  {
    title: 'Retention, storage and destruction',
    paragraphs: [
      'Inquiry data is processed until correspondence ends and then for no more than three years after the last substantive contact, unless a contract or law requires longer retention. When the purpose has been fulfilled, data is deleted or anonymized unless another lawful basis for storage applies.',
      'The traffic log containing the date, page path, country code and broad browser and referrer categories is stored in Russia for the configured server-log rotation period and deleted automatically; it is not used to build visitor profiles. Other technical logs are retained only as long as needed for security, diagnostics and legal compliance.',
      'When personal data of Russian citizens is collected, its recording, organization, accumulation, storage, correction and retrieval are performed using databases located in the Russian Federation, except where the law expressly provides otherwise. If email delivery involves a cross-border transfer of the information and files supplied by the visitor, it occurs only after the statutory requirements have been met.',
    ],
  },
  {
    title: 'Visitor rights',
    paragraphs: [
      'A visitor may obtain information about processing; request correction, restriction or deletion; withdraw consent; object where lawful grounds exist; and lodge a complaint with Roskomnadzor or a court.',
      'A request or withdrawal may be sent to <a href="mailto:hello@kadonext.com?subject=Personal%20data">hello@kadonext.com</a> with the subject “Personal data”. The operator may request information needed to verify the applicant’s identity and connection to the data. Withdrawal does not affect processing lawfully carried out before it was received and does not prevent processing under another legal basis.',
    ],
    htmlParagraphs: true,
  },
  {
    title: 'Data protection',
    paragraphs: [
      'The operator takes the necessary legal, organizational and technical measures to protect personal data against unlawful or accidental access, destruction, alteration, restriction, copying, disclosure, distribution and other unlawful acts. Access is granted only to people who need it for a specific task.',
    ],
  },
  {
    title: 'Changes to this Policy',
    paragraphs: [
      'The operator updates this Policy when the scope of processing, services used or legal requirements change. A new version takes effect when published on this page. The date of the current version appears at the beginning of the document.',
    ],
  },
] as const
</script>

<template>
  <main class="privacy-page pointer-events-auto">
    <header class="privacy-page__hero">
      <NuxtLink class="privacy-page__brand" :to="localePath('/')">KADO</NuxtLink>
      <p class="privacy-page__eyebrow">documents</p>
      <h1>Personal data processing policy</h1>
      <div class="privacy-page__meta">
        <p>Version dated 2 October 2026</p>
        <p>Website: <a href="https://kadonext.com">kadonext.com</a></p>
      </div>
    </header>

    <article class="privacy-page__body">
      <aside class="privacy-page__operator" aria-label="Translation status">This English translation is provided for convenience. If it differs from the <NuxtLink to="/ru/privacy">Russian version</NuxtLink>, the Russian version governs.</aside>
      <section v-for="(section, index) in sections" :key="section.title">
        <h2><span>{{ String(index + 1).padStart(2, '0') }}</span> {{ section.title }}</h2>
        <div class="privacy-page__section-copy" :class="{ 'privacy-page__purposes': 'purpose' in section }">
          <template v-if="'subtitles' in section">
            <div v-for="group in section.subtitles" :key="group.title">
              <h3>{{ group.title }}</h3>
              <p v-for="paragraph in group.paragraphs" :key="paragraph">{{ paragraph }}</p>
            </div>
          </template>
          <template v-if="'paragraphs' in section">
            <template v-if="'htmlParagraphs' in section">
              <p v-for="paragraph in section.paragraphs" :key="paragraph" v-html="paragraph" />
            </template>
            <template v-else>
              <p v-for="paragraph in section.paragraphs" :key="paragraph">{{ paragraph }}</p>
            </template>
          </template>
          <p v-for="paragraph in ('html' in section ? section.html : [])" :key="paragraph" v-html="paragraph" />
        </div>
      </section>

      <aside class="privacy-page__operator" aria-label="Operator details">
        <strong>Operator details</strong>
        <p>Personal data operator: Anton Alekseevich Khokhlov (Хохлов Антон Алексеевич), a payer of tax on professional income (self-employed).</p>
        <p>Personal-data inquiries: <a href="mailto:hello@kadonext.com">hello@kadonext.com</a>.</p>
      </aside>
    </article>

    <footer class="privacy-page__footer">
      <span>{{ currentYear }} KADO</span>
      <NuxtLink :to="localePath('/')">home</NuxtLink>
      <a href="mailto:hello@kadonext.com">hello@kadonext.com</a>
    </footer>
  </main>
</template>

<style scoped src="../styles/legal-document.css"></style>
