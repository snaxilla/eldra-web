<script setup lang="ts">
// Clean BlockRenderer for character/profile and other structured blocks
import { computed } from 'vue'

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

function resolveImage(value: any) {
  if (!value) return null
  if (typeof value === 'string') {
    if (value.startsWith('http') || value.startsWith('//')) return value
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

const overview = computed(() => {
  if (data.value.overview && typeof data.value.overview === 'object') {
    return data.value.overview
  }

  const keys = ['background','alignment','age','height','build','eyes','hair','marks','ancestry','culture','homeland','title','role']
  const out: Record<string, any> = {}
  keys.forEach(k => {
    if (data.value[k] !== undefined && data.value[k] !== null && data.value[k] !== '') out[k] = data.value[k]
  })

  return Object.keys(out).length ? out : null
})

const stats = computed(() => {
  if (data.value.stats && typeof data.value.stats === 'object') return data.value.stats
  if (data.value.values && typeof data.value.values === 'object') return data.value.values

  const common = ['level','hp','str','dex','con','int','wis','cha']
  const found: Record<string, any> = {}
  common.forEach(k => {
    if (data.value[k] !== undefined && data.value[k] !== null && data.value[k] !== '') found[k] = data.value[k]
  })
  return Object.keys(found).length ? found : null
})

const personality = computed(() => data.value.personality || data.value.persona || data.value.traits || null)
const inventory = computed(() => data.value.inventory || data.value.items || null)

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
  return Boolean(overview.value) || Boolean(stats.value) || Boolean(personality.value) || Boolean(inventory.value) || Boolean(title.value)
})

function prettyKey(k: string) {
  if (!k) return ''
  return k.replace(/_/g, ' ').replace(/\b\w/g, s => s.toUpperCase())
}
</script>

<template>
  <div class="mb-5 rounded-2xl border border-neutral-800 bg-neutral-900 p-5 shadow-sm">
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
              v-if="portrait"
              :src="portrait"
              :alt="title || 'Portrait'"
              class="h-[340px] w-full object-cover"
            />
            <div v-else class="flex h-[340px] items-center justify-center text-sm text-neutral-500">
              No portrait yet
            </div>
          </div>

          <div class="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
            <div class="mb-3 text-xs uppercase tracking-[0.2em] text-neutral-500">
              Character Details
            </div>

            <div v-if="title" class="mb-3">
              <div class="text-lg font-semibold text-neutral-100">{{ title }}</div>
              <div v-if="subtitleParts.length" class="mt-1 text-sm text-neutral-400">{{ subtitleParts.join(' • ') }}</div>
            </div>

            <div v-if="overview" class="space-y-3">
              <div
                v-for="(val, key) in overview"
                :key="key"
                class="rounded-xl border border-neutral-800 bg-neutral-900/40 px-3 py-3 text-sm"
              >
                <div class="text-xs text-neutral-500">{{ prettyKey(key) }}</div>
                <div class="mt-1 font-medium text-neutral-100">{{ val }}</div>
              </div>
            </div>

            <div v-else class="text-sm text-neutral-500">
              No additional overview fields found.
            </div>
          </div>
        </div>

        <!-- Right column: description, stats, personality, inventory -->
        <div class="space-y-5">
          <div>
            <h3 v-if="title" class="text-2xl font-bold text-neutral-100">{{ title }}</h3>

            <div v-if="data.body || data.description || data.summary || data.content" class="prose prose-invert mt-4 max-w-none text-neutral-200" v-html="data.body || data.description || data.summary || data.content"></div>
          </div>

          <div v-if="stats" class="space-y-3">
            <div class="text-xs uppercase tracking-[0.2em] text-neutral-500">
              Stats
            </div>

            <div class="grid gap-3 sm:grid-cols-4 lg:grid-cols-8">
              <div v-for="(value, key) in stats" :key="key" class="rounded-xl border border-neutral-800 bg-neutral-950 p-4 text-center">
                <div class="text-xs uppercase tracking-wide text-neutral-500">{{ key.toUpperCase() }}</div>
                <div class="mt-2 text-2xl font-semibold text-neutral-100">{{ value }}</div>
              </div>
            </div>
          </div>

          <div v-if="personality || inventory" class="grid gap-4 md:grid-cols-2">
            <div v-if="personality" class="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
              <div class="mb-2 text-xs uppercase tracking-[0.2em] text-neutral-500">Personality</div>
              <div class="text-sm text-neutral-200" v-html="personality"></div>
            </div>

            <div v-if="inventory" class="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
              <div class="mb-2 text-xs uppercase tracking-[0.2em] text-neutral-500">Inventory</div>
              <ul class="list-inside list-disc text-sm text-neutral-200">
                <li v-for="(it, idx) in (Array.isArray(inventory) ? inventory : Object.values(inventory))" :key="idx">
                  <!-- pretty-print simple objects -->
                  <template v-if="typeof it === 'object'">
                    {{ JSON.stringify(it) }}
                  </template>
                  <template v-else>
                    {{ it }}
                  </template>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- IMAGE block -->
    <template v-else-if="(templateName.includes('image') || data.image || data.image_url)">
      <div class="space-y-4">
        <h3 v-if="data.title" class="text-xl font-semibold text-neutral-100">{{ data.title }}</h3>

        <img v-if="resolveImage(data.image || data.image_url)" :src="resolveImage(data.image || data.image_url)" class="max-h-[28rem] w-full rounded-xl border border-neutral-800 object-cover" />

        <div v-if="data.body" class="prose prose-invert max-w-none text-neutral-200" v-html="data.body"></div>
      </div>
    </template>

    <!-- TEXT/RICH block -->
    <template v-else-if="data.body || data.content || data.text">
      <div class="space-y-4">
        <h3 v-if="data.title" class="text-xl font-semibold text-neutral-100">{{ data.title }}</h3>
        <div class="prose prose-invert max-w-none text-neutral-200" v-html="data.body || data.content || data.text"></div>
      </div>
    </template>

    <!-- stat-ish block -->
    <template v-else-if="data.stats || data.values">
      <div class="space-y-4">
        <h3 v-if="data.title" class="text-xl font-semibold text-neutral-100">{{ data.title }}</h3>
        <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div v-for="(v,k) in (data.stats || data.values)" :key="k" class="rounded-xl border border-neutral-800 bg-neutral-950 p-3">
            <div class="text-xs uppercase tracking-wide text-neutral-500">{{ k }}</div>
            <div class="mt-1 text-base font-semibold text-neutral-100">{{ v }}</div>
          </div>
        </div>
      </div>
    </template>

    <!-- fallback: pretty JSON -->
    <template v-else>
      <div>
        <div v-if="data.title" class="mb-3 text-lg font-semibold text-neutral-100">{{ data.title }}</div>
        <pre class="overflow-x-auto whitespace-pre-wrap rounded-xl border border-neutral-800 bg-neutral-950 p-4 text-xs text-neutral-400">{{ JSON.stringify(data, null, 2) }}</pre>
      </div>
    </template>
  </div>
</template>
