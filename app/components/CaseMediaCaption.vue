<script setup lang="ts">
defineProps<{
  text: string
}>()
</script>

<template>
  <p
    class="project-story__statement case-text-fill"
    :data-fill-source="text"
  >{{ text }}</p>
</template>
