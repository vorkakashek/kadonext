<script setup lang="ts">
import { IconCheck, IconRefresh, IconX } from '@tabler/icons-vue'
import { VOICE_MAX_COUNT, VOICE_MAX_SECONDS, voiceTime } from '~/utils/contactVoice'

const props = defineProps<{ formId: string; disabled?: boolean }>()
const emit = defineEmits<{ 'focus-record-button': [] }>()
const voice = useContactVoice()
const { t } = useI18n()
const { clips, status, error, notice, warning, level, elapsed, replacementId, totalSeconds, remaining, busy } = voice
const playingId = ref<string | null>(null)
const panelEl = ref<HTMLElement | null>(null)
const budget = computed(() => remaining.value + (clips.value.find(clip => clip.id === replacementId.value)?.seconds ?? 0))
const visible = computed(() => busy.value || clips.value.length > 0 || !!error.value || !!notice.value)
const warningText = computed(() => warning.value === 'silent'
  ? t('voice.noSignal')
  : t('voice.quiet'))

function pausePlayer(id: string) { if (playingId.value === id) playingId.value = null }
function start(replaceId: string) {
  playingId.value = null
  void voice.start(replaceId)
}
function focusControls() {
  const button = panelEl.value?.querySelector<HTMLButtonElement>('.voice-input__messages button:not(:disabled)')
  if (button) button.focus({ preventScroll: true })
  else emit('focus-record-button')
}
function remove(id: string) {
  if (playingId.value === id) playingId.value = null
  voice.remove(id)
  void nextTick(focusControls)
}
watch(status, async (value, previous) => {
  if (value !== 'idle') playingId.value = null
  else if (previous !== 'idle') { await nextTick(); focusControls() }
})
watch(() => props.disabled, () => { if (props.disabled) playingId.value = null })
</script>

<template>
  <section :id="`${formId}-voice`" ref="panelEl" v-show="visible" class="voice-input" :aria-label="t('voice.messages')">
    <div v-if="busy" class="voice-input__recording" :aria-busy="status !== 'recording'" :aria-label="status === 'requesting' ? t('voice.requesting') : status === 'stopping' ? t('voice.stopping') : t('voice.recording')">
      <div class="voice-input__live">
        <div class="voice-input__time">
          <span class="voice-input__clock" :aria-label="t('voice.recordingTime')">{{ voiceTime(elapsed) }}</span>
          <span class="voice-input__record-limit" :aria-label="t('voice.messageLimit', { time: voiceTime(budget) })">/ {{ voiceTime(budget) }}</span>
        </div>
        <div class="voice-input__meter" role="meter" :aria-label="t('voice.signalLevel')" aria-valuemin="0" aria-valuemax="100" :aria-valuenow="Math.round(level * 100)">
          <ContactVoiceFrog :level="level" :active="status === 'recording'" />
        </div>
        <div class="voice-input__live-actions">
          <button type="button" class="voice-input__round-button" :aria-label="t('voice.cancel')" :title="t('voice.cancel')" :disabled="status === 'stopping'" @click="voice.stop(true)"><IconX stroke="1.5" aria-hidden="true" /></button>
          <button type="button" class="voice-input__round-button" :aria-label="t('voice.finish')" :title="t('voice.finish')" :disabled="status !== 'recording'" @click="voice.stop()"><IconCheck stroke="1.5" aria-hidden="true" /></button>
        </div>
      </div>
      <p v-if="warning" class="voice-input__warning" role="status">{{ warningText }}</p>
    </div>

    <div v-else-if="clips.length" class="voice-input__budget" :aria-label="t('voice.savedBudget', { saved: voiceTime(totalSeconds), remaining: voiceTime(remaining) })">
      <span class="voice-input__budget-line"><span :style="{ transform: `scaleX(${totalSeconds / VOICE_MAX_SECONDS})` }" /></span>
      <span>{{ voiceTime(remaining) }}</span>
      <span class="voice-input__count" :aria-label="t('voice.savedCount', { count: clips.length, max: VOICE_MAX_COUNT })">{{ clips.length }} / {{ VOICE_MAX_COUNT }}</span>
    </div>

    <ol v-if="clips.length" class="voice-input__messages" :aria-label="t('voice.orderedMessages')">
      <li v-for="(clip, index) in clips" :key="clip.id" class="voice-input__message" :class="{ 'is-replacing': replacementId === clip.id }">
        <ContactVoicePlayer :clip="clip" :label="t('voice.message', { number: index + 1 })" :active="playingId === clip.id" :disabled="busy || disabled" @play="playingId = $event" @pause="pausePlayer">
          <template #actions>
            <button type="button" class="voice-input__round-button voice-input__round-button--small" :aria-label="t('voice.rerecord', { number: index + 1 })" :title="t('voice.rerecordTitle')" :disabled="busy || disabled" @click="start(clip.id)"><IconRefresh stroke="1.5" aria-hidden="true" /></button>
            <button type="button" class="voice-input__round-button voice-input__round-button--small" :aria-label="t('voice.remove', { number: index + 1 })" :title="t('voice.removeTitle')" :disabled="busy || disabled" @click="remove(clip.id)"><IconX stroke="1.5" aria-hidden="true" /></button>
          </template>
        </ContactVoicePlayer>
        <p v-if="clip.warning" class="voice-input__warning">{{ clip.warning === 'silent' ? t('voice.clipNoSignal') : t('voice.clipQuiet') }}</p>
      </li>
    </ol>
    <p v-if="notice" class="voice-input__notice" role="status">{{ notice }}</p>
    <p v-if="error" class="voice-input__warning" role="alert">{{ error }}</p>
  </section>
</template>

<style scoped>
.voice-input { --voice-line: color-mix(in srgb, var(--palette-forest) 22%, transparent); container-type: inline-size; margin-top: clamp(2rem, 4vw, 3rem); color: var(--palette-ink); }
.voice-input__count { font-size: 0.85rem; white-space: nowrap; }
.voice-input__budget { display: flex; align-items: center; gap: 1rem; color: var(--palette-moss); font-size: 0.75rem; font-variant-numeric: tabular-nums; white-space: nowrap; }
.voice-input__budget-line { flex: 1; height: 1px; background: var(--voice-line); }
.voice-input__budget-line > span { display: block; height: 2px; background: var(--palette-forest); transform-origin: left; }
.voice-input__recording { padding: clamp(1.1rem, 3cqi, 2.5rem); background: color-mix(in srgb, var(--palette-forest) 5%, transparent); border-inline: 1px solid var(--voice-line); }
.voice-input__live { display: flex; align-items: center; gap: clamp(0.75rem, 2cqi, 2rem); font-family: var(--font-display); font-size: clamp(3.4rem, 10cqi, 5.5rem); }
.voice-input__time { display: flex; align-items: baseline; gap: clamp(0.65rem, 1.5cqi, 1.4rem); white-space: nowrap; }
.voice-input__clock { font-weight: 400; line-height: 1; letter-spacing: -0.06em; font-variant-numeric: tabular-nums; }
.voice-input__meter { display: flex; flex: 1; justify-content: flex-end; align-items: center; min-width: 0; color: var(--palette-forest); }
.voice-input__record-limit { color: var(--palette-moss); font-size: 0.24em; line-height: 1; letter-spacing: -0.025em; font-variant-numeric: tabular-nums; }
.voice-input__live-actions { display: flex; align-items: center; gap: clamp(0.65rem, 1.3cqi, 1.2rem); }
.voice-input__round-button { display: inline-flex; align-items: center; justify-content: center; width: clamp(2.75rem, 7cqi, 4.25rem); aspect-ratio: 1; padding: 0; border: 1px solid var(--voice-line); border-radius: 50%; background: transparent; color: var(--palette-forest); cursor: pointer; transition: background 0.2s, color 0.2s, border-color 0.2s; }
.voice-input__round-button svg { width: 40%; height: 40%; }
.voice-input__round-button--small { width: 2.75rem; }
.voice-input__round-button:hover:not(:disabled) { background: var(--palette-forest); border-color: var(--palette-forest); color: var(--palette-sand); }
.voice-input__messages { display: grid; gap: 0.75rem; margin: 1.5rem 0 0; padding: 0; list-style: none; }
.voice-input__message { padding: clamp(1rem, 3cqi, 2rem); border: 1px solid var(--voice-line); border-radius: 2px; background: color-mix(in srgb, var(--palette-forest) 5%, transparent); }
.voice-input__message.is-replacing { opacity: 0.5; }
.voice-input__notice { margin: 0.9rem 0 0; color: var(--palette-moss); font-size: 0.75rem; line-height: 1.4; }
.voice-input__warning { margin: 1rem 0 0; padding-left: 0.85rem; border-left: 2px solid var(--palette-moss); color: var(--palette-forest); font-size: 0.85rem; line-height: 1.4; }
button:focus-visible { outline: 2px solid var(--palette-forest); outline-offset: 4px; }
button:disabled { opacity: 0.35; cursor: default; }
@container (max-width: 540px) {
  .voice-input__live { display: grid; grid-template-columns: 1fr auto; gap: 1.25rem 0.75rem; }
  .voice-input__time { grid-column: 1 / -1; }
  .voice-input__meter { justify-content: flex-start; }
}
@media not all { .voice-input__round-button { transition: none; } }
</style>
