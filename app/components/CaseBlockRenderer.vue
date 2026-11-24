<script setup lang="ts">
import type { ProjectCaseBlock } from '~/utils/projectCaseDetails'

const props = withDefaults(defineProps<{
  block: ProjectCaseBlock
  first?: boolean
}>(), {
  first: false,
})

const emit = defineEmits<{
  layoutChange: []
}>()
</script>

<template>
  <CaseStorySection
    v-if="block.type === 'story'"
    :section="block"
    :class="{ 'case-block--first': props.first }"
  />
  <CaseIntroRailBlock
    v-else-if="block.type === 'intro-rail'"
    :block="block"
    :class="{ 'case-block--first': props.first }"
  />
  <CaseDisclosureMediaBlock
    v-else-if="block.type === 'disclosure-media'"
    :block="block"
    :class="{ 'case-block--first': props.first }"
    @layout-change="emit('layoutChange')"
  />
  <CaseContentMosaicBlock
    v-else-if="block.type === 'content-mosaic'"
    :block="block"
    :class="{ 'case-block--first': props.first }"
  />
  <CaseTextMediaRailBlock
    v-else-if="block.type === 'text-media-rail'"
    :block="block"
    :class="{ 'case-block--first': props.first }"
  />
  <CaseFinalStatement
    v-else-if="block.type === 'final'"
    :text="block.text"
    :variant="block.variant"
    :description="block.description"
    :action="block.action"
    :class="{ 'case-block--first': props.first }"
  />
</template>

<style>
.case-block--first {
  margin-top: 0 !important;
}
</style>
