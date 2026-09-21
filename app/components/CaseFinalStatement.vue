<script setup lang="ts">
withDefaults(defineProps<{
  text: string
  variant?: 'default' | 'editorial'
}>(), {
  variant: 'default',
})
</script>

<template>
  <section
    class="project-story project-story--final"
    :class="{ 'project-story--final-editorial audience-case audience-case--final': variant === 'editorial' }"
  >
    <p class="case-text-fill" :data-fill-source="text">{{ text }}</p>
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
</style>
