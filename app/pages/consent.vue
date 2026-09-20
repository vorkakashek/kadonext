<script setup lang="ts">
import {
  CONTACT_CONSENT_DATE, CONTACT_CONSENT_TITLE, CONTACT_CONSENT_OPERATOR,
  CONTACT_CONSENT_EMAIL, CONTACT_CONSENT_SECTIONS,
} from '../../contact-api/consent.mjs'

const currentYear = new Date().getFullYear()
</script>

<template>
  <main class="privacy-page pointer-events-auto">
    <header class="privacy-page__hero">
      <NuxtLink class="privacy-page__brand" to="/">KADO</NuxtLink>
      <p class="privacy-page__eyebrow">документы</p>
      <h1>{{ CONTACT_CONSENT_TITLE }}</h1>
      <div class="privacy-page__meta">
        <p>Редакция от {{ CONTACT_CONSENT_DATE }}</p>
        <p>Сайт: <a href="https://kadonext.com">kadonext.com</a></p>
      </div>
    </header>

    <article class="privacy-page__body">
      <section v-for="(section, index) in CONTACT_CONSENT_SECTIONS" :key="section.title">
        <h2><span>{{ String(index + 1).padStart(2, '0') }}</span> {{ section.title }}</h2>
        <div class="privacy-page__section-copy">
          <p v-for="paragraph in section.paragraphs" :key="paragraph">{{ paragraph }}</p>
        </div>
      </section>
      <section>
        <h2><span>06</span> Политика обработки данных</h2>
        <div class="privacy-page__section-copy">
          <p>
            Общие сведения об обработке и защите данных размещены в
            <NuxtLink to="/privacy">Политике обработки персональных данных</NuxtLink>.
          </p>
        </div>
      </section>

      <aside class="privacy-page__operator" aria-label="Реквизиты оператора">
        <strong>Сведения об операторе</strong>
        <p>Оператор персональных данных: {{ CONTACT_CONSENT_OPERATOR }}</p>
        <p>
          Электронная почта для обращений по персональным данным:
          <a :href="`mailto:${CONTACT_CONSENT_EMAIL}`">{{ CONTACT_CONSENT_EMAIL }}</a>.
        </p>
      </aside>
    </article>

    <footer class="privacy-page__footer">
      <span>{{ currentYear }} KADO</span>
      <NuxtLink to="/">на главную</NuxtLink>
      <a :href="`mailto:${CONTACT_CONSENT_EMAIL}`">{{ CONTACT_CONSENT_EMAIL }}</a>
    </footer>
  </main>
</template>

<style scoped src="../styles/legal-document.css"></style>
