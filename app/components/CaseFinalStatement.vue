<script setup lang="ts">
withDefaults(defineProps<{
  text: string
  variant?: 'default' | 'editorial' | 'interactive'
  description?: string
  action?: { to: string; label: string; external?: boolean }
}>(), {
  variant: 'default',
})
const localePath = useLocalePath()
</script>

<template>
  <section
    class="project-story project-story--final"
    :class="{
      'project-story--final-editorial audience-case audience-case--final': variant === 'editorial',
      'project-story--final-interactive': variant === 'interactive',
    }"
  >
    <h2 v-if="variant === 'interactive'" class="case-text-fill" :data-fill-source="text">{{ text }}</h2>
    <p v-else class="case-text-fill" :data-fill-source="text">{{ text }}</p>
    <p v-if="description" class="project-story__description">{{ description }}</p>
    <RoundAction v-if="action" :href="localePath(action.to)" :external="action.external">{{ action.label }}</RoundAction>
  </section>
</template>

<style scoped>
.project-story--final {
  display: grid;
  min-height: 0;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  column-gap: var(--layout-gutter);
  margin: var(--space-7) 0 var(--space-6);
  place-items: center;
  align-content: center;
}

.project-story--final p {
  grid-column: 2 / -2;
  max-width: 27ch;
  margin: 0;
  font-size: clamp(2.2rem, 5.4vw, 6.4rem);
  letter-spacing: -0.06em;
  line-height: 0.96;
  text-align: center;
}

.project-story--final p.case-text-fill {
  grid-column: 2 / -2;
  font-size: clamp(2.2rem, 5.4vw, 6.4rem);
}

.project-story--final-editorial {
  margin: var(--space-7) 0 var(--space-6);
}

.project-story--final-editorial p,
.project-story--final-editorial p.case-text-fill {
  grid-column: 2 / -2;
  max-width: none;
  font-size: clamp(2.2rem, 5vw, 6.2rem);
  letter-spacing: -0.02em;
  line-height: 0.98;
}

@media (max-width: 1279.98px) {
  .project-story--final p.case-text-fill { grid-column: 2 / -2; }
}

@media (max-width: 767.98px) {
  .project-story--final {
    min-height: 0;
    grid-template-columns: 1fr;
    margin: calc(var(--space-6) * 2) 0;
  }

  .project-story--final p,
  .project-story--final p.case-text-fill {
    grid-column: 1;
    font-size: clamp(1.75rem, 3.5vw, 4rem);
    text-align: left;
  }

  .project-story--final-editorial p,
  .project-story--final-editorial p.case-text-fill {
    font-size: clamp(1.75rem, 3.5vw, 4rem);
  }
}

.project-story--final-interactive {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  text-align: center;
}
.project-story--final-interactive h2 {
  width: 100%;
  max-width: 18ch;
  margin: 0;
  font-size: var(--type-case-title);
  font-weight: 400;
  letter-spacing: -.05em;
  line-height: .98;
  text-wrap: balance;
}
.project-story--final-interactive p.project-story__description {
  max-width: 42ch;
  font-size: var(--type-case-body);
  letter-spacing: -.02em;
  line-height: 1.4;
  text-align: center;
}
.project-story--final-interactive .round-action { margin-top: var(--space-2); }
</style>
