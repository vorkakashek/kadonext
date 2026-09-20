<script setup lang="ts">
import { IconMicrophone } from '@tabler/icons-vue'
import { VOICE_MAX_COUNT, voiceExtension } from '~/utils/contactVoice'
import { CONTACT_CONSENT_VERSION } from '../../contact-api/consent.mjs'

const props = withDefaults(defineProps<{ formId?: string }>(), {
  formId: 'contact',
})

const projectType = useState('home-contact-project-type', () => '')
const projectTypeError = useState('home-contact-project-type-error', () => false)
const description = useState('home-contact-description', () => '')
const contact = useState('home-contact-channel', () => '')
const consent = useState('home-contact-consent', () => false)
const submitting = useState('home-contact-submitting', () => false)
const submitted = useState('home-contact-submitted', () => false)
const submitError = useState('home-contact-submit-error', () => '')
const descriptionError = useState('home-contact-description-error', () => '')
const voice = useContactVoice()
const runtimeConfig = useRuntimeConfig()
const voiceBusy = voice.busy
const voiceCount = computed(() => voice.clips.value.length)
const includedVoiceClips = voice.clips
const { devices, deviceId } = voice
const recordingLimitReached = computed(() => voiceCount.value >= VOICE_MAX_COUNT || voice.remaining.value < 1)
const formLocked = computed(() => submitting.value || voiceBusy.value)
const formHeight = useState('home-contact-form-height', () => 0)
const successHeight = useState('home-contact-success-height', () => 0)
const shellEl = ref<HTMLElement | null>(null)
const formEl = ref<HTMLFormElement | null>(null)
const descriptionEl = ref<HTMLTextAreaElement | null>(null)
const modeButtonEl = ref<HTMLButtonElement | null>(null)
const modeHintVisible = ref(false)
const modeHint = computed(() => voiceCount.value === 1 ? 'Добавить еще сообщение' : 'Записать голосовое сообщение')
let sizeObserver: ResizeObserver | null = null
let descriptionWidth = 0

function hideModeHint() {
  modeHintVisible.value = false
}

function showModeHint() {
  modeHintVisible.value = true
}

function resizeDescription() {
  const field = descriptionEl.value
  if (!field || !field.getClientRects().length) return
  field.style.height = 'auto'
  const style = getComputedStyle(field)
  field.style.height = `${field.scrollHeight + parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth)}px`
}

watch([description, projectType], resizeDescription, { flush: 'post' })
watch([description, voice.clips], () => { descriptionError.value = '' })
watch(projectType, value => {
  if (!value.trim() && (voice.status.value === 'recording' || voice.status.value === 'requesting')) voice.stop()
})

onMounted(() => {
  const shell = shellEl.value
  const form = formEl.value
  if (!shell || !form) return

  // The live form sits in a separate surface layer. Reserve only its content
  // height in the page, including growing textareas.
  sizeObserver = new ResizeObserver(([entry]) => {
    if (!projectType.value.trim()) return
    const width = descriptionEl.value?.clientWidth ?? 0
    if (width !== descriptionWidth) {
      descriptionWidth = width
      resizeDescription()
    }
    const style = getComputedStyle(shell)
    formHeight.value = Math.ceil(
      (entry?.borderBoxSize[0]?.blockSize ?? form.offsetHeight)
      + parseFloat(style.paddingTop)
      + parseFloat(style.paddingBottom),
    )
  })
  sizeObserver.observe(form)
  resizeDescription()
})

onUnmounted(() => {
  sizeObserver?.disconnect()
  hideModeHint()
})

function startVoice() {
  if (formLocked.value || recordingLimitReached.value) return
  descriptionError.value = ''
  hideModeHint()
  // Keep microphone permission and audio resume in the click gesture on iOS.
  void voice.start()
}

async function submitForm() {
  if (!import.meta.client || formLocked.value || submitted.value) return
  submitError.value = ''
  if (!projectType.value.trim()) {
    projectTypeError.value = true
    const taskInput = document.querySelector<HTMLInputElement>('#home-contact-task')
    taskInput?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    window.setTimeout(() => taskInput?.focus(), 280)
    return
  }
  if (!description.value.trim() && !includedVoiceClips.value.length) {
    descriptionError.value = 'Расскажите о проекте текстом или запишите голосовое сообщение.'
    descriptionEl.value?.focus()
    return
  }
  if (!contact.value.trim() || !consent.value) return
  const payload = new FormData()
  for (const [name, value] of Object.entries({
    projectType: projectType.value, description: description.value, contact: contact.value,
    consent: String(consent.value), consentVersion: CONTACT_CONSENT_VERSION, website: '',
  })) payload.append(name, value)
  payload.set('website', (formEl.value?.elements.namedItem('website') as HTMLInputElement | null)?.value ?? '')
  includedVoiceClips.value.forEach((clip, index) => {
    payload.append('audio', clip.blob, `message-${index + 1}.${voiceExtension(clip.blob.type)}`)
  })
  submitting.value = true
  hideModeHint()
  try {
    const response = await $fetch<{ ok: boolean }>(runtimeConfig.public.contactEndpoint, { method: 'POST', body: payload, timeout: 120000, retry: 0 })
    if (!response?.ok) throw new Error('Unexpected contact response')
    successHeight.value = formEl.value?.offsetHeight ?? 0
    submitted.value = true
  } catch (cause) {
    const data = (cause as { data?: { message?: string } }).data
    submitError.value = data?.message || 'Не удалось отправить заявку. Текст и записи сохранены на этой странице — попробуйте ещё раз или напишите на hello@kadonext.com.'
  } finally {
    submitting.value = false
  }
}

function focusConfirmation() {
  if (submitted.value) formEl.value?.querySelector<HTMLElement>('.contact-form__success')?.focus({ preventScroll: true })
}
</script>

<template>
  <div ref="shellEl" class="contact-form-shell">
    <form
      ref="formEl"
      v-show="projectType.trim().length > 0"
      :id="props.formId"
      class="contact-form"
      :class="{ 'is-submitting': submitting, 'is-submitted': submitted }"
      :style="submitted && successHeight ? { minHeight: `${successHeight}px` } : undefined"
      :action="runtimeConfig.public.contactEndpoint"
      method="post"
      enctype="multipart/form-data"
      @submit.prevent="submitForm"
    >
      <span class="contact-form__status" role="status" aria-live="polite" aria-atomic="true">{{ submitting ? 'Отправляем сообщение…' : submitted ? 'Сообщение отправлено. Спасибо! Отвечу лично по указанному контакту.' : '' }}</span>
      <Transition name="contact-result" mode="out-in" @after-enter="focusConfirmation">
      <fieldset v-if="!submitted" class="contact-form__fieldset" :disabled="submitting" :aria-busy="submitting" aria-label="Данные проекта">
      <div class="contact-form__description">
        <div class="contact-form__editor">
          <div class="contact-form__mode-control">
            <Transition name="mode-tip">
              <span v-show="modeHintVisible" class="contact-form__mode-hint" aria-hidden="true">{{ modeHint }}</span>
            </Transition>
            <button
              ref="modeButtonEl"
              type="button"
              class="contact-form__mode-button"
              :aria-label="modeHint"
              :aria-controls="`${props.formId}-voice`"
              :disabled="formLocked || recordingLimitReached"
              @pointerenter="showModeHint"
              @pointerleave="hideModeHint"
              @focus="showModeHint"
              @blur="hideModeHint"
              @keydown.esc="hideModeHint"
              @click="startVoice"
            >
              <IconMicrophone :size="24" stroke="1.5" aria-hidden="true" />
            </button>
          </div>
        <div
        :id="`${props.formId}-text`"
        class="contact-form__row"
        :class="{ 'has-value': description.length > 0 }"
      >
        <label class="contact-form__field">
          <span class="contact-form__label">коротко о проекте</span>
          <textarea
            ref="descriptionEl"
            v-model="description"
            name="description"
            rows="1"
            maxlength="10000"
            :aria-invalid="!!descriptionError"
            placeholder="коротко о проекте"
            :aria-describedby="descriptionError ? `${props.formId}-description-hint ${props.formId}-description-error` : `${props.formId}-description-hint`"
          />
        </label>
        <FieldClearButton
          v-if="description.length > 0"
          label="Очистить описание проекта"
          @clear="description = ''"
        />
        </div>
        <div class="contact-form__description-meta">
          <span :id="`${props.formId}-description-hint`" class="contact-form__hint">
            Что вы создаёте и какую задачу должен решить сайт?<br>
            Достаточно нескольких предложений. Можно добавить голосовое сообщение.
          </span>
          <ContactVoiceDeviceSelect v-model="deviceId" class="contact-form__voice-device" :devices="devices" :disabled="formLocked" @refresh="voice.refreshDevices()" />
        </div>
        <ContactVoiceInput :form-id="props.formId" :disabled="submitting" @focus-record-button="modeButtonEl?.focus({ preventScroll: true })" />
        </div>
        <p v-if="descriptionError" :id="`${props.formId}-description-error`" class="contact-form__error" role="alert">{{ descriptionError }}</p>
      </div>

      <div
        class="contact-form__row"
        :class="{ 'has-value': contact.length > 0 }"
      >
        <label class="contact-form__field">
          <span class="contact-form__label">как с вами связаться?</span>
          <input
            v-model="contact"
            name="contact"
            type="text"
            autocomplete="email"
            maxlength="500"
            pattern=".*\S.*"
            title="Укажите контакт, по которому можно связаться с вами."
            required
            placeholder="как с вами связаться?"
            :aria-describedby="`${props.formId}-channel-hint`"
          >
          <span :id="`${props.formId}-channel-hint`" class="contact-form__hint">имя, telegram или email</span>
        </label>
        <FieldClearButton
          v-if="contact.length > 0"
          label="Очистить контактные данные"
          @clear="contact = ''"
        />
      </div>

      <div class="contact-form__row contact-form__row--consent">
        <div class="contact-form__field">
          <label class="contact-form__consent">
            <input v-model="consent" name="consent" type="checkbox" required>
            <span class="contact-form__checkbox" aria-hidden="true" />
            <span>
              Даю <NuxtLink to="/consent">согласие на обработку персональных данных</NuxtLink>
              для рассмотрения заявки и ответа на неё.
            </span>
          </label>
          <NuxtLink class="contact-form__policy" to="/privacy">Политика обработки персональных данных</NuxtLink>
        </div>
      </div>

      <label class="contact-form__honeypot" aria-hidden="true">Ваш сайт<input name="website" type="text" tabindex="-1" autocomplete="off"></label>
      <div class="contact-form__actions">
        <button class="contact-form__submit" type="submit" :disabled="formLocked" :aria-label="submitting ? 'Отправляем сообщение' : 'Продолжить разговор'">
          <span class="contact-form__submit-label">{{ submitting ? 'Отправляем…' : 'Продолжить разговор' }}</span>
          <span v-if="submitting" class="contact-form__sending" aria-hidden="true" />
        </button>
        <span class="contact-form__email"><span>Или напишите напрямую:</span> <a href="mailto:hello@kadonext.com">hello@kadonext.com</a></span>
      </div>
      <p v-if="submitError" class="contact-form__error" role="alert">{{ submitError }}</p>
      </fieldset>
      <div v-else class="contact-form__success" tabindex="-1" role="region" :aria-labelledby="`${props.formId}-success-title`">
        <svg class="contact-form__success-mark" viewBox="0 0 80 80" fill="none" aria-hidden="true">
          <circle class="contact-form__success-ring" cx="40" cy="40" r="37" pathLength="1" />
          <path class="contact-form__success-check" d="M23 40.5 35 52 57 29" pathLength="1" />
        </svg>
        <span class="contact-form__success-eyebrow">спасибо за рассказ</span>
        <h3 :id="`${props.formId}-success-title`">Сообщение<br>отправлено.</h3>
        <p>Прочитаю вводные{{ includedVoiceClips.length ? ', прослушаю сообщения' : '' }} и отвечу лично по указанному контакту.</p>
      </div>
      </Transition>
    </form>
  </div>
</template>

<style scoped>
.contact-form-shell {
  display: grid;
  width: 100%;
  max-width: var(--layout-content-max);
  height: 100%;
  min-height: inherit;
  margin-inline: auto;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  align-content: start;
  column-gap: var(--layout-gutter);
  padding: calc(clamp(2rem, 3vw, 3.5rem) * 1.2) 0
    clamp(3.5rem, 5vw, 6rem);
  color: var(--palette-ink);
}

.contact-form {
  grid-column: 4 / span 6;
}

.contact-form,
.contact-form__fieldset {
  --contact-form-row-gap: clamp(2.5rem, 3.25vw, 4rem);
  display: flex;
  flex-direction: column;
  gap: var(--contact-form-row-gap);
}

.contact-form__description + .contact-form__row {
  margin-top: calc(var(--contact-form-row-gap) * 0.2);
}

.contact-form__fieldset { min-width: 0; margin: 0; padding: 0; border: 0; }
.contact-form__editor {
  position: relative;
  --description-font-size: clamp(1.65rem, 3vw, 3.5rem);
}
.contact-form__description-meta { display: flex; align-items: flex-start; justify-content: space-between; gap: 1.5rem; margin-top: 0.8rem; }
.contact-form__description-meta .contact-form__hint { flex: 1; min-width: 0; margin-top: 0; }
.contact-form__voice-device { width: clamp(8rem, 20%, 12rem); flex: none; }
.contact-form__mode-control {
  position: absolute;
  z-index: 3;
  top: calc(clamp(0.64rem, 0.96vw, 1rem) + var(--description-font-size) * 1.05 / 2);
  right: -0.5rem;
  transform: translateY(-50%);
}
.contact-form__mode-button {
  display: grid;
  width: 2.75rem;
  height: 2.75rem;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: 50%;
  color: var(--palette-sand);
  background: var(--palette-forest);
  cursor: pointer;
}
.contact-form__mode-button :deep(svg) { grid-area: 1 / 1; }
.contact-form__mode-button:hover:not(:disabled) { background: var(--palette-moss); }
.contact-form__mode-button:disabled { opacity: 0.35; cursor: default; }
.contact-form__mode-button:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; }
.contact-form__mode-hint {
  position: absolute;
  right: 0.5rem;
  bottom: calc(100% + 0.5rem);
  padding: 0.5rem 0.75rem;
  border-radius: 0.35rem;
  background: #000;
  color: #fff;
  font-size: 0.75rem;
  line-height: 1.3;
  white-space: nowrap;
  pointer-events: none;
}
.contact-form__mode-hint::after {
  position: absolute;
  top: 100%;
  right: 0.5rem;
  width: 0;
  height: 0;
  border: 0.3rem solid transparent;
  border-top-color: #000;
  content: '';
}
.mode-tip-enter-active,
.mode-tip-leave-active {
  transition: opacity 0.25s ease, transform 0.25s ease;
}
.mode-tip-enter-from,
.mode-tip-leave-to {
  opacity: 0;
  transform: translateY(0.3rem);
}
.contact-form__editor .contact-form__row textarea { padding-right: 3.5rem; }
.contact-form__editor .contact-form__row { --field-clear-top: calc(clamp(0.64rem, 0.96vw, 1rem) + var(--description-font-size) * 1.05 / 2); }
.contact-form__editor .contact-form__row.has-value textarea { padding-right: 6rem; }
.contact-form__editor :deep(.field-clear) { right: 3rem; }
.contact-form__editor .contact-form__label { max-width: calc(100% - 3.5rem); }
.contact-form__error { margin: 1rem 0 0; border-left: 2px solid var(--palette-moss); padding-left: 0.85rem; color: var(--palette-forest); font-size: 0.9rem; line-height: 1.4; }
.contact-form__honeypot { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
.contact-form__status { position: absolute; width: 1px; height: 1px; padding: 0; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
.contact-form__success { padding-block: 0.5rem 3rem; outline: none; }
.contact-form__success-mark { display: block; width: clamp(4rem, 6vw, 5rem); height: auto; margin-bottom: 2rem; color: var(--palette-forest); }
.contact-form__success-ring { stroke: currentColor; stroke-width: 1; transform-origin: center; transform: rotate(-90deg); animation: contact-draw 700ms cubic-bezier(0.22, 1, 0.36, 1) both; }
.contact-form__success-check { stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; animation: contact-draw 450ms 250ms cubic-bezier(0.22, 1, 0.36, 1) both; }
.contact-form__success-eyebrow { display: block; color: var(--palette-moss); font-size: 0.8rem; }
.contact-form__success h3 { margin: 1rem 0 1.5rem; font-size: clamp(2.5rem, 4.5vw, 4.5rem); font-weight: 500; letter-spacing: -0.045em; line-height: 1.05; }
.contact-form__success p { max-width: 30rem; margin: 0; color: var(--palette-moss); font-size: clamp(1rem, 1.2vw, 1.15rem); line-height: 1.5; }
.contact-result-leave-active { transition: opacity 200ms ease, transform 200ms ease; }
.contact-result-enter-active { transition: opacity 450ms ease, transform 600ms cubic-bezier(0.22, 1, 0.36, 1); }
.contact-result-leave-to { opacity: 0; transform: translateY(-0.5rem); }
.contact-result-enter-from { opacity: 0; transform: translateY(1rem); }
@keyframes contact-draw { from { stroke-dasharray: 1; stroke-dashoffset: 1; } to { stroke-dasharray: 1; stroke-dashoffset: 0; } }
@keyframes contact-orbit { to { transform: rotate(360deg); } }
.contact-form button:disabled { opacity: 0.4; cursor: default; }

.contact-form__row {
  position: relative;
}

.contact-form__field {
  position: relative;
  display: flex;
  min-width: 0;
  flex-direction: column;
}

.contact-form__label {
  position: absolute;
  z-index: 1;
  top: clamp(0.64rem, 0.96vw, 1rem);
  left: 0;
  color: color-mix(in srgb, var(--palette-ink) 48%, transparent);
  cursor: text;
  font-size: clamp(1.65rem, 3vw, 3.5rem);
  font-weight: 500;
  letter-spacing: -0.045em;
  line-height: 1;
  pointer-events: none;
  transform-origin: left top;
  transition:
    color 0.28s var(--motion-ease, ease),
    transform 0.32s var(--motion-ease, ease);
}

.contact-form__row:focus-within .contact-form__label,
.contact-form__row.has-value .contact-form__label {
  color: var(--palette-forest);
  transform: translateY(clamp(-2.1rem, -2.7vw, -1.5rem)) scale(0.43);
}

.contact-form textarea,
.contact-form__field > input {
  box-sizing: border-box;
  width: 100%;
  min-height: clamp(3.4rem, 4.8vw, 5.44rem);
  padding: clamp(0.64rem, 0.96vw, 1rem) 0;
  border: 0;
  border-bottom: 1.5px solid var(--palette-ink);
  border-radius: 0;
  outline: 0;
  background: transparent;
  color: var(--palette-ink);
  font: inherit;
  font-size: clamp(1.65rem, 3vw, 3.5rem);
  font-weight: 500;
  letter-spacing: -0.045em;
  line-height: 1.05;
}

.contact-form textarea {
  overflow: hidden;
  resize: none;
}

.contact-form textarea::placeholder,
.contact-form__field > input::placeholder {
  color: transparent;
}

.contact-form textarea:focus,
.contact-form__field > input:focus {
  border-bottom-color: var(--palette-forest);
  box-shadow: 0 1px 0 var(--palette-forest);
}

.contact-form__hint {
  display: block;
  margin-top: 0.8rem;
  color: var(--palette-moss);
  font-size: clamp(0.88rem, 1vw, 1.05rem);
  letter-spacing: -0.02em;
  line-height: 1.28;
}

.contact-form__row--consent {
  --consent-checkbox-size: 1.35rem;
  --consent-checkbox-gap: 0.9rem;
}

.contact-form__consent {
  display: grid;
  grid-template-columns: var(--consent-checkbox-size) minmax(0, 1fr);
  column-gap: var(--consent-checkbox-gap);
  align-items: start;
  color: var(--palette-moss);
  cursor: pointer;
  font-size: clamp(1rem, 1.15vw, 1.15rem);
  letter-spacing: -0.015em;
  line-height: 1.4;
}

.contact-form__consent input {
  position: absolute;
  opacity: 0;
}

.contact-form__checkbox {
  box-sizing: border-box;
  width: var(--consent-checkbox-size);
  height: var(--consent-checkbox-size);
  border: 1.5px solid var(--palette-ink);
  margin-top: calc((1.4em - var(--consent-checkbox-size)) / 2);
}

.contact-form__consent input:checked + .contact-form__checkbox {
  background: var(--palette-moss);
  box-shadow: inset 0 0 0 0.28rem var(--palette-stone);
}

.contact-form__consent input:focus-visible + .contact-form__checkbox {
  outline: 2px solid var(--palette-moss);
  outline-offset: 3px;
}

.contact-form__policy {
  display: block;
  width: fit-content;
  margin-top: 0.65rem;
  margin-left: calc(var(--consent-checkbox-size) + var(--consent-checkbox-gap));
  color: var(--palette-moss);
}

.contact-form__consent a,
.contact-form__policy,
.contact-form__actions a {
  border: 0;
  padding: 0;
  background: none;
  color: inherit;
  cursor: pointer;
  font: inherit;
  text-decoration: underline;
  text-decoration-thickness: 1px;
  text-underline-offset: 0.16em;
}

.contact-form__policy {
  color: var(--palette-moss);
  font-size: clamp(0.88rem, 1vw, 1.05rem);
  line-height: 1.4;
  text-decoration-color: color-mix(in srgb, currentColor 45%, transparent);
}

.contact-form__actions {
  display: grid;
  gap: var(--space-2);
}

.contact-form__submit {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  justify-self: center;
  box-sizing: border-box;
  width: 50%;
  min-width: min(100%, calc(12em + 2 * var(--space-3)));
  max-width: 100%;
  min-height: var(--layout-contact-action-height);
  border: 1.5px solid var(--palette-ink);
  border-radius: 999px;
  padding: var(--space-2) var(--space-3);
  background: var(--palette-ink);
  color: var(--palette-sand);
  cursor: pointer;
  font: inherit;
  font-size: var(--type-contact-action);
  font-weight: 500;
  letter-spacing: -0.025em;
  line-height: 1.2;
  text-align: center;
  transition: background-color 0.2s ease, border-color 0.2s ease;
}

.contact-form__submit:hover:not(:disabled) {
  background: var(--palette-moss);
  border-color: var(--palette-moss);
}

.contact-form__submit:focus-visible {
  outline: 2px solid var(--palette-forest);
  outline-offset: 4px;
}

.contact-form__submit:disabled {
  background: var(--palette-forest);
  border-color: var(--palette-forest);
  cursor: default;
}

.is-submitting .contact-form__submit:disabled { opacity: 1; }
.is-submitting .contact-form__submit-label { padding-inline: 1.5rem; }
.contact-form__sending { position: absolute; right: var(--space-3); width: 1em; height: 1em; border: 1.5px solid color-mix(in srgb, currentColor 25%, transparent); border-top-color: currentColor; border-radius: 50%; animation: contact-orbit 900ms linear infinite; }

.contact-form__email {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  column-gap: 0.35em;
  row-gap: 0.25rem;
  color: var(--palette-moss);
  font-size: 0.9rem;
  line-height: 1.5;
  text-align: center;
}

.contact-form__email a {
  text-decoration-color: color-mix(in srgb, currentColor 45%, transparent);
}

.contact-form__policy:hover,
.contact-form__email a:hover {
  color: var(--palette-forest);
  text-decoration-color: currentColor;
}

.contact-form__policy:focus-visible,
.contact-form__email a:focus-visible {
  outline: 2px solid var(--palette-forest);
  outline-offset: 3px;
}

@media (max-width: 767.98px) {
  .contact-form__editor { --description-font-size: clamp(1.45rem, 7.2vw, 2.3rem); }
  .contact-form__description-meta { flex-direction: column; gap: 0.75rem; }
  .contact-form__voice-device { align-self: flex-end; width: clamp(8rem, 40vw, 12rem); }
  .contact-form-shell {
    display: block;
    max-width: none;
    /* Keep the microphone hint above the first row inside the clipped surface. */
    padding: calc(3.5rem * 1.2) var(--layout-margin-content) 3rem;
  }

  .contact-form,
  .contact-form__fieldset {
    --contact-form-row-gap: 2.75rem;
  }

  .contact-form__row {
    --field-clear-top: calc(clamp(0.64rem, 0.96vw, 1rem) - 1.8rem + clamp(1.45rem, 7.2vw, 2.3rem) * 0.5 / 2);
  }

  .contact-form__label,
  .contact-form textarea,
  .contact-form__field > input {
    font-size: clamp(1.45rem, 7.2vw, 2.3rem);
  }

  .contact-form__row:focus-within .contact-form__label,
  .contact-form__row.has-value .contact-form__label {
    transform: translateY(-1.8rem) scale(0.5);
  }

  .contact-form__row--consent .contact-form__field {
    min-width: 0;
  }

  .contact-form__row--consent {
    --consent-checkbox-gap: 0.75rem;
  }

  .contact-form__consent {
    font-size: 1rem;
  }

}

@media (prefers-reduced-motion: reduce) {
  .contact-form__label,
  .contact-form__submit,
  .contact-form__mode-control,
  .contact-result-enter-active,
  .contact-result-leave-active,
  .mode-tip-enter-active,
  .mode-tip-leave-active { transition: none; }
  .contact-form__sending,
  .contact-form__success-ring,
  .contact-form__success-check { animation: none; }
}
</style>
