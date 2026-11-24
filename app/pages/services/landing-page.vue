<script setup lang="ts">
const content = await useServicePage('landing')
</script>

<template>
  <ServicePage page-id="landing" :content="content" />
</template>
