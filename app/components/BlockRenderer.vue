<script setup lang="ts">
// BlockRenderer — smarter renderer for character/profile and other structured blocks

const props = defineProps<{
  block: {
    id: string
    template?: string
    data?: Record<string, any>
    sort?: number
    visibility?: string
  }
}>()

const config = useRuntimeConfig()
const directusBase = (config.public?.directusUrl || '').replace(/\/$/, '')

const data = computed(() => props.block?.data || {})
const templateName = computed(() => String(props.block?.template || '').toLowerCase())

// portrait detection: accept a full URL string, a file id, or an object with id/url
function resolveImage(value: any) {
  if (!value) return null
  if (typeof value === 'string') {
    if (value.startsWith('http') || value.startsWith('//')) return value
    // assume it's a Directus asset id
    return `${directusBase}/assets/${value}`
  }
  if (typeof value === 'object') {
    if (value.url) return value.url
    if (value.data && value.data.id) return `${directusBase}/assets/${value.data.id}`
    if (value.id) return `${directusBase}/assets/${value.id}`
  }
  return null
}

const portrait = computed(() => {
  return (
    resolveImage(data.value.portrait) ||
    resolveImage(data.value.avatar) ||
    resolveImage(data.value.image) ||
    resolveImage(data.value.image_url) ||
    null
  )
})

// Detect an 'overview' object or map several common flat keys into an overview
const overview = computed(() => {
  if (data.value.overview && typeof data.value.overview === 'object') {
    return data.value.overview
  }

  // try to pull common fields into an overview object if present
  const keys = ['background','alignment','age','height','build','eyes','hair','marks','ancestry','culture','homeland','title','role']
  const out: Record<string, any> = {}
  keys.forEach(k => {
    if (data.value[k] !== undefined && data.value[k] !== null && data.value[k] !== '') out[k] = data.value[k]
  })

  // also common flattened labels
  if (Object.keys(out).length) return out
  return null
})

// Stats detection: look for stats object or keys
const stats = computed(() => {
  if (data.value.stats && typeof data.value.stats === 'object') return data.value.stats
  // sometimes called values
  if (data.value.values && typeof data.value.values === 'object') return data.value.values

  // flatten common stat keys if present
  const common = ['level','hp','str','dex','con','int','wis','cha']
  const found: Record<string, any> = {}
  common.forEach(k => {
    if (data.value[k] !== undefined && data.value[k] !== null && data.value[k] !== '') found[k] = data.value[k]
  })
  return Object.keys(found).length ? found : null
})

// personality & inventory
const personality = computed(() => data.value.personality || data.value.persona || data.value.traits || null)
const inventory = computed(() => data.value.inventory || data.value.items || null)

// Title & summary fields
const title = computed(() => data.value.name || data.value.character_name || data.value.title || '')
const subtitleParts = computed(() => {
  const parts: string[] = []
  if (data.value.alias) parts.push(`Alias: ${data.value.alias}`)
  if (data.value.pronouns) parts.push(data.value.pronouns)
  if (data.value.ancestry || data.value.race || data.value.species) parts.push(data.value.ancestry || data.value.race || data.value.species)
  if (data.value.class || data.value.archetype) parts.push(data.value.class || data.value.archetype)
  return parts.filter(Boolean)
})

const hasCharacterShape = computed(() => {
  return boolean(overview.value) || boolean(stats.value) || boolean(personality.value) || boolean(inventory.value) || Boolean(title.value)
})

// helper bool
function boolean(v: any) { return v !== undefined && v !== null && (typeof v !== 'string' || v !== '') }

</script>

<template>
  <div class="mb-5 rounded-2xl border border-neutral-800 bg-neutral-900 p-5 shadow-sm block-card">
    <div class="mb-3 flex items-center justify-between">
      <div class="text-xs uppercase tracking-[0.2em] text-neutral-400">
        {{ props.block.template || 'block' }}
      </div>
      <div class="text-xs text-neutral-500">
        {{ props.block.visibility || 'visible' }}
      </div>
    </div>

    <!-- CHARACTER / PROFILE SHAPE -->
    <template v-if="hasCharacterShape">
      <div class="grid gap-6 lg:grid-cols-[280px_1fr]">
        <!-- Left column: portrait + overview cards -->
        <div class="space-y-4">
          <div class="overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-950">
            <img
