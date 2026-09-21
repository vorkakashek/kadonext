<script setup lang="ts">
import type { ProjectCaseContentMosaicBlock, ProjectCaseMosaicRow } from '~/utils/projectCaseDetails'

const props = defineProps<{
  block: ProjectCaseContentMosaicBlock
}>()

function rowItems(row: ProjectCaseMosaicRow) {
  return row.featureSide === 'start'
    ? [{ kind: 'feature' as const, media: row.feature }, { kind: 'detail' as const, media: row.detail }]
    : [{ kind: 'detail' as const, media: row.detail }, { kind: 'feature' as const, media: row.feature }]
}
</script>

<template>
  <section class="case-content-mosaic audience-case audience-case--menu">
    <h2 v-html="props.block.title" />
    <div class="audience-case__menu-lead">
      <CaseResponsivePicture :media="props.block.lead.media" class="audience-case__menu-lead-media" />
      <p>{{ props.block.lead.text }}</p>
    </div>
    <p
      class="audience-case__menu-secondary case-text-fill"
      :data-fill-source="props.block.fillText"
    >{{ props.block.fillText }}</p>
    <div class="audience-case__media-mosaic">
      <div
        v-for="(row, rowIndex) in props.block.rows"
        :key="`${props.block.id}-${rowIndex}`"
        class="audience-case__menu-row"
        :class="rowIndex === 0 ? 'audience-case__menu-row--top' : 'audience-case__menu-row--bottom'"
      >
        <CaseHorizontalRail class="audience-case__menu-media-pair">
          <template v-for="item in rowItems(row)" :key="`${item.kind}-${item.media.src}`">
            <div
              class="audience-case__mosaic-cell"
              :class="`audience-case__mosaic-cell--${item.kind}`"
            >
              <CaseResponsivePicture
                :media="item.media"
                class="audience-case__mosaic-picture"
                :class="[
                  `audience-case__mosaic-picture--${item.kind}`,
                  row.featureSide === 'start'
                    ? 'audience-case__mosaic-picture--top'
                    : 'audience-case__mosaic-picture--bottom',
                ]"
              />
              <p
                v-if="item.kind === 'detail'"
                class="audience-case__statement audience-case__statement--desktop"
              >
                {{ row.statement }}
              </p>
            </div>
          </template>
        </CaseHorizontalRail>
        <p class="audience-case__statement audience-case__statement--mobile">{{ row.statement }}</p>
      </div>
    </div>
  </section>
</template>

<style scoped>
.case-content-mosaic {
  display: grid;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  column-gap: var(--layout-gutter);
  margin-top: var(--space-section);
}

h2 {
  grid-column: 1 / -1;
  max-width: none;
  margin: 0 auto;
  font-size: clamp(2.75rem, 6.5vw, 7.5rem);
  font-weight: 400;
  letter-spacing: -0.01em;
  line-height: 0.91;
  text-align: center;
}

p { margin: 0; }

.audience-case__menu-lead,
.audience-case__media-mosaic { grid-column: 1 / -1; }

.audience-case__menu-lead {
  display: grid;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  align-items: end;
  column-gap: var(--layout-gutter);
  margin-top: var(--space-6);
}

.audience-case__menu-lead-media {
  display: block;
  grid-column: 1 / span 6;
  aspect-ratio: 16 / 10;
  overflow: hidden;
}

.audience-case__menu-lead-media :deep(img) {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.audience-case__menu-lead p {
  grid-column: 8 / span 4;
  color: color-mix(in srgb, var(--palette-milk, #f5f1e8) 78%, #0a0501);
  font-size: clamp(1.25rem, 2.1vw, 2rem);
  letter-spacing: -0.01em;
  line-height: 1.18;
}

.audience-case p.audience-case__menu-secondary {
  grid-column: 3 / -3;
  box-sizing: border-box;
  max-width: none;
  margin: var(--space-section) 0;
  font-size: clamp(1.75rem, 3.5vw, 4rem);
  font-weight: 300;
  letter-spacing: -0.01em;
  line-height: 1.04;
  text-align: center;
}

.audience-case__media-mosaic {
  display: grid;
  row-gap: calc(var(--space-7) / 4);
}

.audience-case__menu-media-pair :deep(.case-horizontal-rail__content) {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-items: start;
  gap: var(--layout-gutter);
}

.audience-case__mosaic-picture {
  display: block;
  min-width: 0;
  overflow: hidden;
}

.audience-case__mosaic-cell { min-width: 0; }

.audience-case__mosaic-picture :deep(img) {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.audience-case__menu-media-pair { display: contents; }
.audience-case__menu-media-pair :deep(.case-horizontal-rail__viewport) { display: contents; }
.audience-case__mosaic-picture--feature { aspect-ratio: 4 / 5; }
.audience-case__mosaic-picture--detail { aspect-ratio: 16 / 10; }
.audience-case__menu-row--top .audience-case__mosaic-picture--detail { margin-top: 100%; }
.audience-case__menu-row--bottom .audience-case__mosaic-picture--detail { margin-top: 8%; }
.audience-case__menu-row--bottom .audience-case__mosaic-picture--feature { margin-top: 16%; }
.audience-case__statement {
  max-width: none;
  margin: 0;
  color: color-mix(in srgb, var(--palette-milk, #f5f1e8) 78%, #0a0501);
  font-size: clamp(1.125rem, 1.7vw, 1.6rem);
  letter-spacing: -0.01em;
  line-height: 1.28;
  text-align: left;
  opacity: 0.7;
}

.audience-case__statement--desktop {
  width: 66.6667%;
  margin-top: var(--space-3);
  margin-left: 16.6667%;
}

.audience-case__statement--mobile { display: none; }

@media (max-width: 767.98px) {
  .case-content-mosaic { grid-template-columns: 1fr; }
  h2 {
    grid-column: 1;
    font-size: clamp(1.875rem, 8vw, 2.25rem);
  }
  .audience-case__menu-lead,
  .audience-case__menu-secondary,
  .audience-case__media-mosaic { grid-column: 1; }
  .audience-case__media-mosaic { row-gap: var(--space-6); }
  .audience-case__menu-lead {
    grid-template-columns: 1fr;
    margin-top: calc(var(--space-6) * 0.5);
  }
  .audience-case__menu-lead-media { aspect-ratio: 2444 / 2160; }
  .audience-case__menu-lead-media,
  .audience-case__menu-lead p { grid-column: 1; }
  .audience-case__menu-lead p { margin-top: var(--space-5); }
  .audience-case__menu-lead p,
  .audience-case__statement { font-size: var(--type-case-body); }
  .audience-case p.audience-case__menu-secondary {
    grid-column: 1;
    margin-top: var(--space-7);
    margin-bottom: var(--space-7);
  }
  .audience-case__menu-row { display: block; }
  .audience-case__menu-media-pair { display: block; }
  .audience-case__menu-media-pair :deep(.case-horizontal-rail__viewport) {
    display: block;
    width: 100vw;
    margin-inline: calc(50% - 50vw);
  }
  .audience-case__menu-media-pair :deep(.case-horizontal-rail__content) {
    --case-rail-mobile-media-height: min(93svh, 108vw);
    display: flex;
    width: max-content;
    align-items: flex-start;
    gap: var(--space-1);
  }
  .audience-case__menu-media-pair .audience-case__mosaic-cell {
    flex: 0 0 auto;
    width: auto;
    height: var(--case-rail-mobile-media-height);
    overflow: hidden;
    margin-top: 0;
  }
  .audience-case__menu-media-pair .audience-case__mosaic-cell--feature { aspect-ratio: 4 / 5; }
  .audience-case__menu-media-pair .audience-case__mosaic-cell--detail { aspect-ratio: 16 / 10; }
  .audience-case__menu-media-pair .audience-case__mosaic-picture {
    width: 100%;
    height: 100%;
    margin-top: 0;
    aspect-ratio: auto;
  }
  .audience-case__menu-media-pair .audience-case__mosaic-picture :deep(img) {
    width: 100%;
    max-width: none;
    height: 100%;
    object-fit: contain;
  }
  .audience-case__menu-media-pair :deep(.case-horizontal-rail__bar) {
    width: 80vw;
    margin-inline: calc(50% - 40vw);
  }
  .audience-case__statement--desktop { display: none; }
  .audience-case__statement--mobile {
    display: block;
    width: 100%;
    max-width: none;
    margin: var(--space-2) 0 0;
  }
}
</style>
