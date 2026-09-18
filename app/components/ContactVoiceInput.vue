<script setup lang="ts">
import { IconMicrophone, IconPlayerStop, IconPlus, IconRefresh, IconTrash, IconX } from '@tabler/icons-vue'
import { VOICE_MAX_COUNT, VOICE_MAX_SECONDS, voiceTime } from '~/utils/contactVoice'

const props = defineProps<{ formId: string; disabled?: boolean; visible?: boolean }>()
const voice = useContactVoice()
const { clips, draft, status, supported, error, notice, warning, level, elapsed, devices, deviceId, deviceLabel, replacementId, totalSeconds, remaining, busy } = voice
const playingId = ref<string | null>(null)
const controlEl = ref<HTMLButtonElement | null>(null)
const keepEl = ref<HTMLButtonElement | null>(null)
const headingEl = ref<HTMLHeadingElement | null>(null)
const budget = computed(() => remaining.value + (clips.value.find(clip => clip.id === replacementId.value)?.seconds ?? 0))
const occupied = computed(() => Math.min(VOICE_MAX_SECONDS, totalSeconds.value - (clips.value.find(clip => clip.id === replacementId.value)?.seconds ?? 0) + (draft.value?.seconds ?? elapsed.value)))
const canAdd = computed(() => supported.value && clips.value.length < VOICE_MAX_COUNT && remaining.value >= 1)
const warningText = computed(() => warning.value === 'silent'
  ? 'Не улавливаем звук. Проверьте микрофон или выберите другой после остановки записи.'
  : 'Звук очень тихий. Попробуйте говорить ближе к микрофону и прослушайте запись перед отправкой.')

function pausePlayer(id: string) { if (playingId.value === id) playingId.value = null }
function start(replaceId: string | null = null) {
  playingId.value = null
  void voice.start(replaceId)
}
function focusControls() { (controlEl.value?.disabled ? headingEl.value : controlEl.value)?.focus({ preventScroll: true }) }
function keep() { playingId.value = null; voice.keepDraft(); void nextTick(focusControls) }
function discard() { playingId.value = null; voice.discardDraft(); void nextTick(focusControls) }
function rerecord() {
  const previousId = replacementId.value
  playingId.value = null
  voice.discardDraft()
  start(previousId)
}
function remove(id: string) { if (playingId.value === id) playingId.value = null; voice.remove(id); void nextTick(() => controlEl.value?.focus({ preventScroll: true })) }
watch(status, async (value) => {
  if (value === 'review') { await nextTick(); keepEl.value?.focus({ preventScroll: true }) }
})
watch(() => props.disabled, () => { if (props.disabled) playingId.value = null })
watch(() => props.visible, () => { if (props.visible === false) playingId.value = null })
</script>

<template>
  <section class="voice-input" :aria-labelledby="`${formId}-voice-title`">
    <div class="voice-input__heading">
      <h3 :id="`${formId}-voice-title`" ref="headingEl" tabindex="-1">расскажите голосом</h3>
      <span class="voice-input__count">{{ clips.length }} / {{ VOICE_MAX_COUNT }}</span>
    </div>

    <div class="voice-input__budget" :aria-label="`Сохранено ${voiceTime(totalSeconds)}, осталось ${voiceTime(remaining)}`">
      <span class="voice-input__budget-line"><span :style="{ transform: `scaleX(${(busy ? occupied : totalSeconds) / VOICE_MAX_SECONDS})` }" /></span>
      <span>{{ busy ? voiceTime(Math.max(0, VOICE_MAX_SECONDS - occupied)) : voiceTime(remaining) }} осталось</span>
    </div>

    <div v-if="status === 'requesting'" class="voice-input__recording">
      <span class="voice-input__eyebrow">доступ к микрофону</span>
      <p class="voice-input__request">Разрешите запись<br>в окне браузера.</p>
      <button type="button" class="voice-input__text-button" @click="voice.stop(true)"><IconX :size="17" aria-hidden="true" />Отменить</button>
    </div>

    <div v-else-if="status === 'recording' || status === 'stopping'" class="voice-input__recording">
      <div class="voice-input__record-top">
        <span class="voice-input__eyebrow"><span class="voice-input__dot" /><span class="voice-input__status-label">{{ replacementId ? 'новая версия сообщения' : 'идёт запись' }}</span></span>
        <span class="voice-input__device-name">{{ deviceLabel }}</span>
      </div>
      <div class="voice-input__live">
        <span class="voice-input__clock" aria-label="Время записи">{{ voiceTime(elapsed) }}</span>
        <div class="voice-input__meter" role="meter" aria-label="Уровень сигнала микрофона" aria-valuemin="0" aria-valuemax="100" :aria-valuenow="Math.round(level * 100)">
          <ContactVoiceFrog :level="level" :active="status === 'recording'" />
        </div>
      </div>
      <span class="voice-input__record-limit">до {{ voiceTime(budget) }} в этом сообщении</span>
      <p v-if="warning" class="voice-input__warning" role="status">{{ warningText }}</p>
      <div class="voice-input__record-actions">
        <button ref="controlEl" class="voice-input__button voice-input__button--solid" type="button" :disabled="status === 'stopping'" @click="voice.stop()">
          <IconPlayerStop :size="17" stroke="1.5" aria-hidden="true" />{{ status === 'stopping' ? 'Готовим запись…' : 'Завершить запись' }}
        </button>
        <button type="button" class="voice-input__text-button" :disabled="status === 'stopping'" @click="voice.stop(true)">Отменить</button>
      </div>
    </div>

    <div v-else-if="draft" class="voice-input__draft">
      <span class="voice-input__eyebrow">{{ replacementId ? 'прослушайте новую версию' : 'сообщение записано' }}</span>
      <ContactVoicePlayer :clip="draft" label="Новая запись" :active="playingId === draft.id" @play="playingId = $event" @pause="pausePlayer" />
      <p v-if="draft.warning" class="voice-input__warning">{{ draft.warning === 'silent' ? 'В записи почти нет сигнала. Прослушайте её — возможно, стоит выбрать другой микрофон.' : 'Запись может быть очень тихой. Проверьте, слышно ли вас.' }}</p>
      <p v-else class="voice-input__draft-hint">{{ replacementId ? 'Старая версия останется, пока вы не сохраните новую.' : 'Можно прослушать, сохранить или записать ещё раз.' }}</p>
      <div class="voice-input__record-actions">
        <button ref="keepEl" type="button" class="voice-input__button voice-input__button--solid" @click="keep">
          <span class="voice-input__button-label">{{ replacementId ? 'Заменить сообщение' : 'Сохранить сообщение' }}</span>
        </button>
        <button type="button" class="voice-input__text-button" @click="rerecord"><IconRefresh :size="15" stroke="1.5" aria-hidden="true" />Записать заново</button>
        <button type="button" class="voice-input__text-button" @click="discard">{{ replacementId ? 'Оставить старое' : 'Удалить запись' }}</button>
      </div>
    </div>

    <ol v-if="clips.length" class="voice-input__messages" aria-label="Голосовые сообщения в порядке отправки">
      <li v-for="(clip, index) in clips" :key="clip.id" class="voice-input__message" :class="{ 'is-replacing': replacementId === clip.id }">
        <div class="voice-input__message-heading">
          <span class="voice-input__message-label">{{ String(index + 1).padStart(2, '0') }} <span>сообщение</span></span>
        </div>
        <ContactVoicePlayer :clip="clip" :label="`Сообщение ${index + 1}`" :active="playingId === clip.id" :disabled="busy || disabled" @play="playingId = $event" @pause="pausePlayer" />
        <div class="voice-input__message-actions">
          <button type="button" class="voice-input__text-button" :disabled="busy || disabled" @click="start(clip.id)"><IconRefresh :size="15" stroke="1.5" aria-hidden="true" />Перезаписать</button>
          <button type="button" class="voice-input__text-button" :disabled="busy || disabled" @click="remove(clip.id)"><IconTrash :size="15" stroke="1.5" aria-hidden="true" />Удалить</button>
          <span v-if="clip.warning" class="voice-input__quiet-label">{{ clip.warning === 'silent' ? 'проверьте звук' : 'тихий звук' }}</span>
        </div>
      </li>
    </ol>

    <template v-if="status === 'idle' || status === 'review'">
      <div class="voice-input__footer">
        <button v-if="status === 'idle'" ref="controlEl" type="button" class="voice-input__button" :disabled="!canAdd || disabled" @click="start()">
          <IconPlus v-if="clips.length" :size="19" stroke="1.5" aria-hidden="true" />
          <IconMicrophone v-else :size="19" stroke="1.5" aria-hidden="true" />
          {{ clips.length ? 'Ещё сообщение' : 'Записать сообщение' }}
        </button>
        <label v-if="devices.length > 1" class="voice-input__device">
          <span>микрофон</span>
          <select v-model="deviceId" :disabled="disabled">
            <option value="">По умолчанию</option>
            <option v-for="(device, index) in devices.filter(item => item.deviceId !== 'default')" :key="device.deviceId" :value="device.deviceId">{{ device.label || `Микрофон ${index + 1}` }}</option>
          </select>
        </label>
      </div>
      <p v-if="!supported" class="voice-input__footnote">Для записи нужен HTTPS (при локальной проверке — localhost) и браузер с доступом к микрофону. Можно рассказать о проекте текстом.</p>
      <p v-else-if="status === 'idle' && !canAdd" class="voice-input__footnote">Лимит достигнут. Можно удалить сообщение или перезаписать существующее.</p>
      <p v-else-if="status === 'idle'" class="voice-input__footnote">Микрофон включается только по кнопке. Аудио отправится вместе с заявкой.</p>
    </template>
    <p v-if="notice" class="voice-input__notice" role="status">{{ notice }}</p>
    <p v-if="error" class="voice-input__warning" role="alert">{{ error }}</p>
  </section>
</template>

<style scoped>
.voice-input { --voice-line: color-mix(in srgb, var(--palette-forest) 22%, transparent); color: var(--palette-ink); }
.voice-input__heading, .voice-input__record-top, .voice-input__message-heading, .voice-input__footer { display: flex; justify-content: space-between; align-items: center; gap: 1rem; }
.voice-input__heading h3 { margin: 0; font-size: clamp(1.65rem, 3vw, 3.5rem); font-weight: 500; line-height: 1.05; letter-spacing: -0.045em; }
.voice-input__count { color: var(--palette-moss); font-size: 0.85rem; white-space: nowrap; font-variant-numeric: tabular-nums; }
.voice-input__budget { display: flex; align-items: center; gap: 1rem; color: var(--palette-moss); font-size: 0.75rem; font-variant-numeric: tabular-nums; white-space: nowrap; }
.voice-input__budget-line { flex: 1; height: 1px; background: var(--voice-line); }
.voice-input__budget-line > span { display: block; height: 2px; background: var(--palette-forest); transform-origin: left; }
.voice-input__recording, .voice-input__draft { margin-top: 1.5rem; padding: clamp(1.1rem, 2vw, 1.75rem); background: color-mix(in srgb, var(--palette-forest) 5%, transparent); border: 1px solid var(--voice-line); border-radius: 2px; }
.voice-input__eyebrow { display: inline-flex; align-items: center; gap: 0.5rem; color: var(--palette-forest); font-size: 0.75rem; letter-spacing: 0.025em; }
.voice-input__dot { width: 6px; height: 6px; border-radius: 50%; background: var(--palette-forest); }
.voice-input__status-label { transform: translateY(0.12em); }
.voice-input__device-name { min-width: 0; max-width: 45%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--palette-moss); font-size: 0.7rem; }
.voice-input__live { display: flex; align-items: center; gap: 1.5rem; margin: 1.5rem 0 0.2rem; font-family: var(--font-display); font-size: clamp(3.4rem, 6vw, 5.5rem); }
.voice-input__clock { font-weight: 400; line-height: 1; letter-spacing: -0.06em; font-variant-numeric: tabular-nums; }
.voice-input__meter { display: flex; flex: 1; justify-content: flex-end; align-items: center; min-width: 0; color: var(--palette-forest); }
.voice-input__record-limit, .voice-input__draft-hint { color: var(--palette-moss); font-size: 0.8rem; line-height: 1.35; }
.voice-input__record-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 1rem; margin-top: 1.5rem; }
.voice-input__request { margin: 1.2rem 0; font-size: clamp(1.4rem, 2.1vw, 2.2rem); line-height: 1.15; letter-spacing: -0.035em; }
.voice-input__button { display: inline-flex; min-height: 2.9rem; align-items: center; justify-content: center; gap: 0.6rem; padding: 0.65rem 1.15rem; border: 1px solid var(--palette-forest); border-radius: 999px; background: transparent; color: var(--palette-forest); font: inherit; font-size: 0.9rem; line-height: 1.2; cursor: pointer; transition: background 0.2s, color 0.2s; }
.voice-input__button:hover { color: var(--palette-sand); background: var(--palette-forest); }
.voice-input__button--solid { background: var(--palette-forest); color: var(--palette-sand); }
.voice-input__button--solid:hover { background: var(--palette-ink); border-color: var(--palette-ink); }
.voice-input__button-label { display: block; line-height: 1.2; }
.voice-input__text-button { display: inline-flex; align-items: center; min-height: 2.75rem; gap: 0.4rem; border: 0; padding: 0; background: none; color: var(--palette-moss); font: inherit; font-size: 0.78rem; cursor: pointer; text-decoration: underline; text-underline-offset: 0.2em; text-decoration-thickness: 1px; }
.voice-input__messages { margin: 1.5rem 0 0; padding: 0; list-style: none; }
.voice-input__message { padding: 1rem 0 0.75rem; border-bottom: 1px solid var(--voice-line); }
.voice-input__message.is-replacing { opacity: 0.5; }
.voice-input__message-heading { margin-bottom: 0.4rem; }
.voice-input__message-label { font-size: 0.78rem; color: var(--palette-forest); font-variant-numeric: tabular-nums; }
.voice-input__message-label > span { margin-left: 0.5rem; color: var(--palette-moss); }
.voice-input__message-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 1.2rem; }
.voice-input__quiet-label { margin-left: auto; font-size: 0.72rem; color: var(--palette-moss); }
.voice-input__footer { margin-top: 1.5rem; flex-wrap: wrap; }
.voice-input__device { display: flex; min-width: 0; max-width: 100%; flex: 1 1 11rem; flex-direction: column; gap: 0.2rem; color: var(--palette-moss); font-size: 0.7rem; }
.voice-input__device select { width: 100%; min-height: 2.5rem; border: 0; border-bottom: 1px solid var(--voice-line); border-radius: 0; background: transparent; color: var(--palette-forest); font: inherit; font-size: 0.8rem; text-overflow: ellipsis; }
.voice-input__footnote, .voice-input__notice { margin: 0.9rem 0 0; color: var(--palette-moss); font-size: 0.75rem; line-height: 1.4; }
.voice-input__warning { margin: 1rem 0 0; padding-left: 0.85rem; border-left: 2px solid var(--palette-moss); color: var(--palette-forest); font-size: 0.85rem; line-height: 1.4; }
.voice-input__draft :deep(.voice-player) { margin-top: 1rem; }
button:focus-visible, select:focus-visible { outline: 2px solid var(--palette-forest); outline-offset: 4px; }
button:disabled { opacity: 0.35; cursor: default; }
@media (max-width: 767.98px) { .voice-input__heading h3 { font-size: clamp(1.45rem, 7.2vw, 2.3rem); } .voice-input__device-name { display: none; } .voice-input__live { gap: 1rem; } .voice-input__record-actions { gap: 0.5rem 1rem; } }
@media (prefers-reduced-motion: reduce) { .voice-input__button { transition: none; } }
</style>
