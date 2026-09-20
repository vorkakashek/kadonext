<script setup lang="ts">
import type { ProjectCaseMedia } from '~/utils/projectCaseDetails'

defineProps<{
  media: ProjectCaseMedia
}>()
</script>

<template>
  <CaseAutoplayVideo
    v-if="media.type === 'video'"
    :src="media.src"
    :mobile-src="media.mobileSrc"
    :poster="media.poster"
    :mobile-poster="media.mobilePoster"
    :width="media.width"
    :height="media.height"
    :alt="media.alt"
    :class="`project-story__image--${media.shape ?? 'wide'}`"
    :style="{
      '--case-video-aspect-ratio': media.aspectRatio,
      '--case-video-mobile-aspect-ratio': media.mobileAspectRatio,
    }"
  />
  <picture v-else class="project-story__picture">
    <source v-if="media.mobileAvifSrcset" type="image/avif" :srcset="media.mobileAvifSrcset" :sizes="media.sizes" media="(max-width: 767.98px)">
    <source v-if="media.mobileWebpSrcset" type="image/webp" :srcset="media.mobileWebpSrcset" :sizes="media.sizes" media="(max-width: 767.98px)">
    <source v-if="media.mobileSrc" :srcset="media.mobileSrc" media="(max-width: 767.98px)">
    <source v-if="media.avifSrcset" type="image/avif" :srcset="media.avifSrcset" :sizes="media.sizes">
    <source v-if="media.webpSrcset" type="image/webp" :srcset="media.webpSrcset" :sizes="media.sizes">
    <img
      :src="media.src"
      :alt="media.alt"
      :width="media.width"
      :height="media.height"
      :class="`project-story__image--${media.shape ?? 'wide'}`"
      :style="media.aspectRatio ? { aspectRatio: media.aspectRatio } : undefined"
      loading="lazy"
      decoding="async"
    >
  </picture>
</template>
