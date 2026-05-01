<script setup lang="ts">
const props = defineProps<{
  item?: any | null
}>()

function formatSize(value: any) {
  if (!value) return '—'
  if (Array.isArray(value)) return value.join(' / ')
  return String(value)
}

function formatAlignment(value: any) {
  if (!value) return '—'
  if (Array.isArray(value)) return value.join(' / ')
  return String(value)
}

function formatCreatureType(value: any) {
  if (!value) return '—'

  if (typeof value === 'string' && value.trim().startsWith('{')) {
    try {
      value = JSON.parse(value)
    } catch {}
  }

  if (typeof value === 'string') return value

  if (typeof value === 'object') {
    const baseType = String(value.type || '').trim()
    const tags = Array.isArray(value.tags)
      ? value.tags.filter(Boolean).map((t: any) => String(t))
      : []

    if (baseType && tags.length) return `${baseType} (${tags.join(', ')})`
    if (baseType) return baseType
  }

  return String(value)
}

function scoreMod(score: number | null | undefined) {
  if (typeof score !== 'number') return ''
  const mod = Math.floor((score - 10) / 2)
  return `${mod >= 0 ? '+' : ''}${mod}`
}

function actionTypeLabel(value: string) {
  if (value === 'trait') return 'Trait'
  if (value === 'bonus') return 'Bonus Action'
  if (value === 'reaction') return 'Reaction'
  if (value === 'legendary') return 'Legendary'
  if (value === 'mythic') return 'Mythic'
  if (value === 'lair') return 'Lair'
  return 'Action'
}

function imageUrlForItem(item: any) {
  const blocks = Array.isArray(item?.blocks) ? item.blocks : []

  for (const block of blocks) {
    const image = block?.data?.image
    if (!image) continue

    if (typeof image === 'string') return `/api/assets/${image}`

    if (typeof image === 'object') {
      if (image.image_url) return image.image_url
      if (image.file_id) return `/api/assets/${image.file_id}`
      if (image.id) return `/api/assets/${image.id}`
    }
  }

  return null
}

const imageUrl = computed(() => imageUrlForItem(props.item))

const overviewText = computed(() => {
  const blocks = Array.isArray(props.item?.blocks) ? props.item.blocks : []
  const overview = blocks.find((block: any) => block?.blockKey === 'overview' || block?.block_key === 'overview')
  return String(overview?.data?.text || props.item?.summary || '').trim()
})

const sourceBlock = computed(() => {
  const blocks = Array.isArray(props.item?.blocks) ? props.item.blocks : []
  return blocks.find((block: any) => block?.blockKey === 'source' || block?.block_key === 'source') || null
})

const statblock = computed(() => props.item?._monsterData?.statblock || props.item?.statblock || null)
const actions = computed(() => props.item?._monsterData?.actions || props.item?.actions || [])
const title = computed(() => String(props.item?.title || props.item?.name || 'Monster Preview'))
</script>

<template>
  <div class="space-y-6">
    <div class="rounded-[24px] border border-white/10 bg-[linear-gradient(to_bottom,rgba(24,28,34,0.44),rgba(12,16,22,0.30))] p-5 backdrop-blur-xl shadow-[0_18px_50px_rgba(0,0,0,0.18)]">
      <div class="flex items-start gap-4">
        <div class="h-28 w-28 shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-black/20">
          <img
            v-if="imageUrl"
            :src="imageUrl"
            :alt="title"
            class="h-full w-full object-cover object-top"
          >
          <div
            v-else
            class="flex h-full w-full items-center justify-center text-3xl font-semibold text-slate-400"
          >
            {{ title.slice(0, 2).toUpperCase() }}
          </div>
        </div>

        <div class="min-w-0 flex-1">
          <div class="text-xs uppercase tracking-[0.3em] text-slate-500">Monster Preview</div>
          <h2 class="mt-2 text-3xl font-semibold tracking-tight text-white">
            {{ title }}
          </h2>

          <div class="mt-3 flex flex-wrap gap-2 text-sm">
            <div
              v-if="sourceBlock?.data?.source"
              class="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-slate-300"
            >
              {{ String(sourceBlock.data.source).toUpperCase() }}
            </div>

            <div
              v-if="statblock?.challenge_rating"
              class="rounded-full border border-red-400/20 bg-red-400/10 px-3 py-1.5 text-red-200"
            >
              CR {{ statblock.challenge_rating }}
            </div>

            <div
              v-if="props.item?.entityType || props.item?.entity_type"
              class="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-slate-300"
            >
              {{ props.item?.entityType || props.item?.entity_type }}
            </div>
          </div>
        </div>
      </div>
    </div>

    <div
      v-if="overviewText"
      class="rounded-[24px] border border-white/10 bg-[linear-gradient(to_bottom,rgba(24,28,34,0.40),rgba(12,16,22,0.28))] p-5 backdrop-blur-xl"
    >
      <div class="text-xs uppercase tracking-[0.3em] text-slate-500">Summary</div>
      <p class="mt-4 whitespace-pre-wrap text-sm leading-7 text-slate-200">
        {{ overviewText }}
      </p>
    </div>

    <div
      v-if="statblock"
      class="rounded-[24px] border border-white/10 bg-[linear-gradient(to_bottom,rgba(24,28,34,0.40),rgba(12,16,22,0.28))] p-5 backdrop-blur-xl"
    >
      <div class="text-xs uppercase tracking-[0.3em] text-slate-500">Statblock</div>

      <div class="mt-4 grid grid-cols-2 gap-3 text-sm text-slate-200">
        <div><span class="text-slate-400">CR:</span> {{ statblock.challenge_rating || '—' }}</div>
        <div><span class="text-slate-400">AC:</span> {{ statblock.armor_class ?? '—' }}</div>
        <div><span class="text-slate-400">HP:</span> {{ statblock.hit_points_average ?? '—' }}</div>
        <div><span class="text-slate-400">Type:</span> {{ formatCreatureType(statblock.creature_type) }}</div>
        <div><span class="text-slate-400">Size:</span> {{ formatSize(statblock.size_json) }}</div>
        <div><span class="text-slate-400">Align:</span> {{ formatAlignment(statblock.alignment_json) }}</div>
      </div>

      <div class="mt-5 grid grid-cols-3 gap-3">
        <div class="rounded-2xl border border-white/10 bg-black/10 p-3 text-center">
          <div class="text-[11px] uppercase tracking-[0.2em] text-slate-500">STR</div>
          <div class="mt-2 text-2xl font-semibold text-white">{{ statblock.str_score ?? '—' }}</div>
          <div class="text-xs text-slate-400">{{ scoreMod(statblock.str_score) }}</div>
        </div>
        <div class="rounded-2xl border border-white/10 bg-black/10 p-3 text-center">
          <div class="text-[11px] uppercase tracking-[0.2em] text-slate-500">DEX</div>
          <div class="mt-2 text-2xl font-semibold text-white">{{ statblock.dex_score ?? '—' }}</div>
          <div class="text-xs text-slate-400">{{ scoreMod(statblock.dex_score) }}</div>
        </div>
        <div class="rounded-2xl border border-white/10 bg-black/10 p-3 text-center">
          <div class="text-[11px] uppercase tracking-[0.2em] text-slate-500">CON</div>
          <div class="mt-2 text-2xl font-semibold text-white">{{ statblock.con_score ?? '—' }}</div>
          <div class="text-xs text-slate-400">{{ scoreMod(statblock.con_score) }}</div>
        </div>
        <div class="rounded-2xl border border-white/10 bg-black/10 p-3 text-center">
          <div class="text-[11px] uppercase tracking-[0.2em] text-slate-500">INT</div>
          <div class="mt-2 text-2xl font-semibold text-white">{{ statblock.int_score ?? '—' }}</div>
          <div class="text-xs text-slate-400">{{ scoreMod(statblock.int_score) }}</div>
        </div>
        <div class="rounded-2xl border border-white/10 bg-black/10 p-3 text-center">
          <div class="text-[11px] uppercase tracking-[0.2em] text-slate-500">WIS</div>
          <div class="mt-2 text-2xl font-semibold text-white">{{ statblock.wis_score ?? '—' }}</div>
          <div class="text-xs text-slate-400">{{ scoreMod(statblock.wis_score) }}</div>
        </div>
        <div class="rounded-2xl border border-white/10 bg-black/10 p-3 text-center">
          <div class="text-[11px] uppercase tracking-[0.2em] text-slate-500">CHA</div>
          <div class="mt-2 text-2xl font-semibold text-white">{{ statblock.cha_score ?? '—' }}</div>
          <div class="text-xs text-slate-400">{{ scoreMod(statblock.cha_score) }}</div>
        </div>
      </div>
    </div>

    <div
      v-if="actions.length"
      class="rounded-[24px] border border-white/10 bg-[linear-gradient(to_bottom,rgba(24,28,34,0.40),rgba(12,16,22,0.28))] p-5 backdrop-blur-xl"
    >
      <div class="text-xs uppercase tracking-[0.3em] text-slate-500">Actions</div>

      <div class="mt-4 space-y-4">
        <div
          v-for="(action, index) in actions.slice(0, 6)"
          :key="action.id || `${action.name}-${index}`"
          class="rounded-2xl border border-white/10 bg-black/10 p-4"
        >
          <div class="flex items-center justify-between gap-3">
            <div class="font-medium text-white">{{ action.name }}</div>
            <div class="text-[11px] uppercase tracking-[0.15em] text-slate-500">
              {{ actionTypeLabel(action.actionType || action.action_type || 'action') }}
            </div>
          </div>

          <div class="mt-2 whitespace-pre-wrap text-sm leading-7 text-slate-200">
            {{ action.text }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
