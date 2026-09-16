<script setup lang="ts">
defineProps<{ surfaceReady?: boolean }>()

const projectTypes = [
  'сайт под ключ',
  'дизайн и арт-дирекция',
  'разработка и motion',
  'развитие существующего сайта',
  'пока не знаю',
] as const

const rootEl = ref<HTMLElement | null>(null)
const surfaceEl = ref<HTMLElement | null>(null)
const fieldsEl = ref<HTMLElement | null>(null)
const taskInputEl = ref<HTMLInputElement | null>(null)
const projectType = useState('home-contact-project-type', () => '')
const projectTypeError = useState('home-contact-project-type-error', () => false)
const formHeight = useState('home-contact-form-height', () => 0)

const taskIsRaised = computed(() => projectType.value.length > 0)
const hasProjectType = computed(() => projectType.value.trim().length > 0)

function appendProjectType(type: string) {
  const current = projectType.value.trimEnd()
  if (!current) {
    projectType.value = type
  } else if (!current.toLocaleLowerCase('ru').includes(type.toLocaleLowerCase('ru'))) {
    projectType.value = `${current}${/[,:;.!?—-]$/.test(current) ? ' ' : ', '}${type}`
  }
  projectTypeError.value = false
  void nextTick(() => taskInputEl.value?.focus())
}

defineExpose({ rootEl, surfaceEl, fieldsEl, taskInputEl })
</script>

<template>
  <section
    id="contact"
    ref="rootEl"
    class="home-contact pointer-events-auto relative z-10 w-full"
    aria-label="Обсудить проект"
  >
    <div class="home-contact__lead">
      <header class="home-contact__intro">
        <h2>
          если вам близок такой подход,<br>
          расскажите о проекте.
        </h2>
        <p>Я читаю каждое обращение сам<br>и отвечаю лично.</p>
      </header>

      <div
        class="home-contact__task"
        :class="{ 'has-value': taskIsRaised, 'has-error': projectTypeError }"
      >
        <label for="home-contact-task">Что нужно сделать?</label>
        <input
          id="home-contact-task"
          ref="taskInputEl"
          v-model="projectType"
          name="project-type"
          type="text"
          placeholder="Что нужно сделать?"
          autocomplete="off"
          :aria-invalid="projectTypeError"
          :aria-describedby="projectTypeError
            ? 'home-contact-task-suggestions home-contact-task-error'
            : 'home-contact-task-suggestions'"
          @input="projectTypeError = false"
        >
        <div id="home-contact-task-suggestions" class="home-contact__suggestions" aria-label="Подсказки">
          <button
            v-for="type in projectTypes"
            :key="type"
            type="button"
            @click="appendProjectType(type)"
          >
            {{ type }}
          </button>
        </div>
        <p
          v-if="projectTypeError"
          id="home-contact-task-error"
          class="home-contact__task-error"
          aria-live="polite"
        >
          Напишите задачу или выберите подсказку.
        </p>
      </div>
    </div>

    <div
      class="home-contact__reveal"
      :class="{ 'is-expanded': hasProjectType }"
      :inert="!hasProjectType"
    >
      <div class="home-contact__clip">
        <div
          ref="fieldsEl"
          class="home-contact__fields"
          :style="formHeight > 0 ? { '--contact-form-height': `${formHeight}px` } : undefined"
        >
          <HomeContactForm v-if="!surfaceReady" class="relative z-[1]" form-id="contact-fallback" />
        </div>
      </div>
    </div>

    <div
      ref="surfaceEl"
      class="home-contact__surface"
      :class="{ 'is-surface-ready': surfaceReady }"
    />
  </section>
</template>

<style scoped>
.home-contact {
  padding: calc(var(--space-section) * 0.5) var(--layout-margin-content)
    clamp(1.5rem, 2vw, 2.5rem);
}

.home-contact__lead {
  position: relative;
  z-index: 1;
  display: grid;
  width: 100%;
  max-width: var(--layout-content-max);
  margin-inline: auto;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  column-gap: var(--layout-gutter);
}

.home-contact__intro {
  grid-column: 3 / span 8;
}

.home-contact__task {
  grid-column: 4 / span 6;
}

.home-contact__intro h2 {
  margin: 0;
  font-size: clamp(2.4rem, 4.35vw, 5.2rem);
  font-weight: 400;
  letter-spacing: -0.055em;
  line-height: 0.98;
}

.home-contact__intro p {
  margin: clamp(1.5rem, 2.25vw, 2.5rem) 0 0;
  font-size: var(--type-case-body-large);
  letter-spacing: -0.025em;
  line-height: 1.3;
}

.home-contact__task {
  position: relative;
  margin-top: clamp(4rem, 7vw, 8rem);
}

.home-contact__task label {
  position: absolute;
  top: clamp(0.8rem, 1.2vw, 1.25rem);
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

.home-contact__task:focus-within label,
.home-contact__task.has-value label {
  color: var(--palette-forest);
  transform: translateY(clamp(-2.1rem, -2.7vw, -1.5rem)) scale(0.43);
}

.home-contact__task input {
  width: 100%;
  min-height: clamp(4.25rem, 6vw, 6.8rem);
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

.home-contact__task input::placeholder {
  color: transparent;
}

.home-contact__task:focus-within input {
  border-bottom-color: var(--palette-forest);
  box-shadow: 0 1px 0 var(--palette-forest);
}

.home-contact__task.has-error input {
  border-bottom-color: var(--palette-forest);
}

.home-contact__suggestions {
  display: flex;
  padding-top: 0.85rem;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem 0;
}

.home-contact__suggestions button {
  border: 0;
  padding: 0;
  background: transparent;
  color: color-mix(in srgb, var(--palette-ink) 46%, transparent);
  cursor: pointer;
  font: inherit;
  font-size: clamp(0.88rem, 1vw, 1.05rem);
  letter-spacing: -0.02em;
  line-height: 1.25;
  transition: color 0.22s ease;
}

.home-contact__suggestions button:not(:last-child)::after {
  margin-inline: 0.62rem;
  color: color-mix(in srgb, var(--palette-ink) 30%, transparent);
  content: '•';
}

.home-contact__suggestions button:hover,
.home-contact__suggestions button:focus-visible {
  color: var(--palette-forest);
}

.home-contact__suggestions button:focus-visible {
  border-radius: 0.15rem;
  outline: 2px solid var(--palette-forest);
  outline-offset: 0.25rem;
}

.home-contact__task-error {
  margin: 0.7rem 0 0;
  color: var(--palette-forest);
  font-size: 0.88rem;
}

.home-contact__reveal {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows 0.65s var(--motion-ease, ease);
}

.home-contact__reveal.is-expanded {
  grid-template-rows: 1fr;
}

.home-contact__clip {
  min-height: 0;
  overflow: hidden;
}

.home-contact__fields {
  position: relative;
  width: 100%;
  min-height: var(--contact-form-height, 52rem);
  margin-top: clamp(1.25rem, 2vw, 2.5rem);
}

.home-contact__surface {
  /* The same docking box frames both the first input and the expanded form. */
  position: absolute;
  inset: 0 var(--layout-margin-content);
  overflow: hidden;
  border-radius: var(--flow-surface-radius, 24px);
  background: var(--palette-stone);
}

.home-contact__surface.is-surface-ready {
  background: transparent;
}

@media (max-width: 767.98px) {
  .home-contact {
    padding: calc(var(--space-section) * 1.125) var(--layout-margin-content)
      1.5rem;
  }

  .home-contact__lead {
    display: block;
  }

  .home-contact__intro h2 {
    font-size: clamp(2rem, 9.5vw, 3.25rem);
  }

  .home-contact__task {
    margin-top: clamp(4rem, 20vw, 6rem);
  }

  .home-contact__task label,
  .home-contact__task input {
    font-size: clamp(1.45rem, 7.2vw, 2.3rem);
  }

  .home-contact__task:focus-within label,
  .home-contact__task.has-value label {
    transform: translateY(-1.8rem) scale(0.5);
  }

  .home-contact__surface {
    inset-inline: 0;
  }

  .home-contact__reveal {
    margin-inline: calc(-1 * var(--layout-margin-content));
  }

  .home-contact__fields {
    width: auto;
    min-height: 69rem;
    margin-top: 1.5rem;
  }
}

@media (max-width: 389.98px) {
  .home-contact__fields {
    min-height: 74rem;
  }
}

@media (prefers-reduced-motion: reduce) {
  .home-contact__reveal,
  .home-contact__task label,
  .home-contact__suggestions button {
    transition: none;
  }
}
</style>
