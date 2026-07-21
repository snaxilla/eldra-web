<script setup lang="ts">
const props = withDefaults(defineProps<{
  result?: any | null
  item?: any | null
  importType?: string
  sourceDisplay?: string
}>(), {
  result: null,
  item: null,
  importType: '',
  sourceDisplay: ''
})

function asArray(value: any) {
  return Array.isArray(value) ? value : value === undefined || value === null ? [] : [value]
}

function titleCase(value: any) {
  return String(value || '')
    .replace(/_/g, ' ')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function clean5eText(value: any): string {
  if (value === null || value === undefined) return ''

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }

  if (Array.isArray(value)) {
    return value.map(clean5eText).filter(Boolean).join('\n\n')
  }

  if (typeof value === 'object') {
    const parts: string[] = []

    if (value.name) parts.push(clean5eText(value.name))
    if (value.entry) parts.push(clean5eText(value.entry))
    if (value.entries) parts.push(clean5eText(value.entries))
    if (value.items) parts.push(clean5eText(value.items))
    if (value.rows) parts.push(clean5eText(value.rows))

    if (parts.length) return parts.filter(Boolean).join('\n\n')

    return Object.values(value)
      .map(clean5eText)
      .filter(Boolean)
      .slice(0, 4)
      .join(' · ')
  }

  return String(value || '')
    .replace(/\{#(?:itemEntry|itemSubEntry|entry)\s+([^|}]+)(?:\|[^}]*)?\}/gi, '$1')
    .replace(/\{@(?:filter|spell|item|creature|class|race|variantrule|condition|skill|action|sense|damage|book|hazard|reward|feat|classFeature|subclassFeature|optionalfeature|status|itemProperty)\s+([^|}]+)(?:\|[^}]*)?\}/gi, '$1')
    .replace(/\{@(?:i|b|dice|damage|hit|dc|scaledice|scaledamage)\s+([^}]+)\}/gi, '$1')
    .replace(/\{@[^}]+\}/g, '')
    .replace(/\{#[^}]+\}/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function blockKey(block: any) {
  return String(block?.blockKey || block?.block_key || block?.key || '').trim()
}

function blockLabel(block: any) {
  return titleCase(blockKey(block) || 'Block')
}

function blockData(block: any) {
  return block?.data && typeof block.data === 'object' ? block.data : {}
}

function imageFromBlock(block: any) {
  const image = blockData(block)?.image

  if (!image) return ''

  if (typeof image === 'string') {
    if (/^https?:\/\//i.test(image) || image.startsWith('/')) return image
    return `/api/assets/${image}`
  }

  if (typeof image === 'object') {
    if (image.image_url) return image.image_url
    if (image.url) return image.url
    if (image.file_id) return `/api/assets/${image.file_id}`
    if (image.id) return `/api/assets/${image.id}`
  }

  return ''
}

const previewItems = computed(() => {
  const result = props.result || {}

  return [
    ...asArray(result.items),
    ...asArray(result.entities),
    ...asArray(result.results),
    ...asArray(result.data)
  ].filter((item) => item && typeof item === 'object')
})

const previewItem = computed(() =>
  props.item ||
  previewItems.value[0] ||
  props.result?.item ||
  null
)

const itemBlocks = computed(() =>
  Array.isArray(previewItem.value?.blocks) ? previewItem.value.blocks : []
)

const rawPayload = computed(() =>
  previewItem.value?.raw ||
  previewItem.value?.raw_json ||
  previewItem.value?.rawJson ||
  {}
)

const imageUrl = computed(() => {
  const direct =
    previewItem.value?.imageUrl ||
    previewItem.value?.image_url ||
    previewItem.value?.previewImageUrl ||
    previewItem.value?.preview_image_url ||
    ''

  if (direct) return String(direct)

  for (const block of itemBlocks.value) {
    const image = imageFromBlock(block)
    if (image) return image
  }

  const imagePath =
    rawPayload.value?.fluff?.images?.[0]?.href?.path ||
    rawPayload.value?.images?.[0]?.href?.path ||
    rawPayload.value?.token?.path ||
    ''

  return imagePath ? `/api/5etools-img/${imagePath}` : ''
})

const title = computed(() =>
  String(
    previewItem.value?.title ||
    previewItem.value?.name ||
    previewItem.value?.slug ||
    props.result?.title ||
    'Preview'
  )
)

const entityType = computed(() =>
  titleCase(
    previewItem.value?.entityType ||
    previewItem.value?.entity_type ||
    props.result?.entityType ||
    props.importType ||
    'Entity'
  )
)

const sourceCode = computed(() =>
  String(
    previewItem.value?.sourceBook ||
    previewItem.value?.source ||
    previewItem.value?.source_code ||
    rawPayload.value?.source ||
    props.result?.source ||
    ''
  ).trim().toUpperCase()
)

const slug = computed(() =>
  String(previewItem.value?.slug || '').trim()
)

const countText = computed(() => {
  const count = Number(props.result?.count ?? previewItems.value.length)
  return Number.isFinite(count) && count > 0 ? `${count} preview item${count === 1 ? '' : 's'}` : ''
})

const metaChips = computed(() => {
  const coreBlocks = itemBlocks.value.map(blockKey).filter(Boolean)

  return [
    entityType.value,
    sourceCode.value,
    props.sourceDisplay && props.sourceDisplay !== sourceCode.value ? props.sourceDisplay : '',
    rawPayload.value?.cr !== undefined ? `CR ${rawPayload.value.cr}` : '',
    rawPayload.value?.level !== undefined ? `Level ${rawPayload.value.level}` : '',
    rawPayload.value?.school ? `School ${clean5eText(rawPayload.value.school)}` : '',
    slug.value,
    coreBlocks.length ? `${coreBlocks.length} blocks` : '',
    countText.value
  ]
    .map((chip) => String(chip || '').trim())
    .filter(Boolean)
    .filter((chip, index, list) => list.indexOf(chip) === index)
    .slice(0, 8)
})

function overviewFromBlocks() {
  for (const block of itemBlocks.value) {
    const key = blockKey(block)
    const data = blockData(block)

    if (key === 'overview' && data.text) return clean5eText(data.text)
    if (key === 'summary' && data.text) return clean5eText(data.text)
    if (data.summary) return clean5eText(data.summary)
    if (data.description) return clean5eText(data.description)
  }

  return ''
}

const summary = computed(() => {
  return (
    clean5eText(previewItem.value?.summary) ||
    overviewFromBlocks() ||
    clean5eText(previewItem.value?.description) ||
    clean5eText(rawPayload.value?.fluff?.entries) ||
    clean5eText(rawPayload.value?.entries) ||
    clean5eText(rawPayload.value?.entriesHigherLevel) ||
    ''
  )
})

function dataPreview(block: any) {
  const key = blockKey(block)
  const data = blockData(block)

  if (key === 'import_source') {
    return [
      data.provider ? `Provider: ${data.provider}` : '',
      data.source_book ? `Source: ${data.source_book}` : '',
      data.external_id ? `External ID: ${data.external_id}` : ''
    ].filter(Boolean).join(' · ') || 'Raw import data stored for traceability.'
  }

  const preferred = [
    data.text,
    data.summary,
    data.description,
    data.name,
    data.type,
    data.level,
    data.school,
    data.rarity,
    data.item_type,
    data.damage,
    data.armor_class,
    data.size,
    data.speed,
    data.hit_die,
    data.saves,
    data.prerequisites
  ]

  const found = preferred.map(clean5eText).find(Boolean)
  if (found) return found

  return Object.entries(data)
    .filter(([key]) => !['raw_json', 'rawJson', 'image'].includes(key))
    .map(([key, value]) => `${titleCase(key)}: ${clean5eText(value)}`)
    .filter((line) => !line.endsWith(':'))
    .slice(0, 4)
    .join(' · ')
}

const displayBlocks = computed(() =>
  itemBlocks.value
    .filter((block: any) => blockKey(block) !== 'import_source' || itemBlocks.value.length <= 4)
    .slice(0, 8)
)

const initials = computed(() =>
  title.value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('') || '?'
)

const hasPreview = computed(() => !!previewItem.value)
</script>

<template>
  <div
    v-if="hasPreview"
    class="space-y-4"
    data-importer-generic-preview
  >
    <section class="overflow-hidden rounded-none border border-[rgba(201,164,90,0.20)] bg-[rgba(8,17,27,0.38)]">
      <div
        v-if="imageUrl"
        class="border-b border-[rgba(201,164,90,0.16)] bg-black/20"
      >
        <img
          :src="imageUrl"
          :alt="title"
          class="h-44 w-full object-cover object-top"
        >
      </div>

      <div
        v-else
        class="flex h-44 items-center justify-center border-b border-[rgba(201,164,90,0.16)] bg-[rgba(8,17,27,0.46)] text-4xl font-semibold text-[#d8ceb8]"
      >
        {{ initials }}
      </div>

      <div class="min-w-0 p-4">
        <div class="text-[10px] uppercase tracking-[0.32em] text-[#9f9278]">
          {{ entityType }} Preview
        </div>

        <h3 class="mt-2 break-words text-2xl font-semibold leading-tight text-white">
          {{ title }}
        </h3>

        <div
          v-if="metaChips.length"
          class="mt-4 flex flex-wrap gap-2"
        >
          <span
            v-for="chip in metaChips"
            :key="chip"
            class="max-w-full rounded-none border border-[rgba(201,164,90,0.18)] bg-[rgba(201,164,90,0.08)] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#d8ceb8]"
          >
            {{ chip }}
          </span>
        </div>

        <p
          v-if="summary"
          class="mt-4 text-sm leading-7 text-[#d8ceb8]"
        >
          {{ summary }}
        </p>

        <p
          v-else
          class="mt-4 text-sm leading-7 text-[#9f9278]"
        >
          This preview has structured blocks, but no readable summary field yet.
        </p>
      </div>
    </section>

    <section class="rounded-none border border-[rgba(201,164,90,0.20)] bg-[rgba(20,17,12,0.52)] p-4">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div class="text-[10px] uppercase tracking-[0.3em] text-[#9f9278]">Import Plan</div>
          <h4 class="mt-1 text-xl font-semibold text-white">Blocks to Create / Update</h4>
        </div>

        <span class="rounded-none border border-[rgba(201,164,90,0.18)] bg-[rgba(201,164,90,0.08)] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#d8ceb8]">
          {{ itemBlocks.length }} blocks
        </span>
      </div>

      <div
        v-if="displayBlocks.length"
        class="mt-4 grid gap-3"
      >
        <article
          v-for="block in displayBlocks"
          :key="`${blockKey(block)}-${block.sort || ''}`"
          class="rounded-none border border-[rgba(201,164,90,0.12)] bg-[rgba(4,8,14,0.46)] p-3"
        >
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div class="text-xs font-semibold uppercase tracking-[0.18em] text-[#fff7df]">
              {{ blockLabel(block) }}
            </div>
            <div
              v-if="block.sort !== undefined"
              class="text-[10px] uppercase tracking-[0.16em] text-[#9f9278]"
            >
              Sort {{ block.sort }}
            </div>
          </div>

          <p
            v-if="dataPreview(block)"
            class="mt-2 text-xs leading-5 text-[#d8ceb8]"
          >
            {{ dataPreview(block) }}
          </p>
        </article>
      </div>

      <div
        v-else
        class="mt-4 rounded-none border border-dashed border-[rgba(201,164,90,0.20)] p-4 text-sm text-[#9f9278]"
      >
        No block plan was returned by the preview route.
      </div>
    </section>
  </div>

  <div
    v-else
    class="rounded-none border border-[rgba(201,164,90,0.16)] bg-[rgba(8,17,27,0.38)] p-4 text-sm text-[#9f9278]"
  >
    No preview item returned.
  </div>
</template>

<style scoped>
[data-importer-generic-preview] {
  min-width: 0;
}

[data-importer-generic-preview] * {
  min-width: 0;
}
</style>
