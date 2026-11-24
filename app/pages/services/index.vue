<script setup lang="ts">
const content = await useServicePage('index')
</script>

<template>
  <ServicePage page-id="index" :content="content" />
</template>
