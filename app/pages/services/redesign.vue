<script setup lang="ts">
const content = await useServicePage('redesign')
</script>

<template>
  <ServicePage page-id="redesign" :content="content" />
</template>
