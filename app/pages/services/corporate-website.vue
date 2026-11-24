<script setup lang="ts">
const content = await useServicePage('corporate')
</script>

<template>
  <ServicePage page-id="corporate" :content="content" />
</template>
