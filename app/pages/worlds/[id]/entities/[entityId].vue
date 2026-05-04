<script setup lang="ts">
definePageMeta({
  layout: 'world-workspace'
})

import { renderMarkdown } from '~/utils/renderMarkdown'

const route = useRoute()

const worldId = computed(() => String(route.params.id || ''))
const entityId = computed(() => String(route.params.entityId || ''))
const mode = useState<'play' | 'build'>('world-workspace-mode', () => 'play')

const uploadingImage = ref(false)
const imageError = ref('')
const imageSuccess = ref('')

const { data: world } = await useFetch(() => `/api/worlds/${worldId.value}`)

const { data: entity, refresh: refreshEntity } = await useAsyncData(
  `entity-${worldId.value}-${entityId.value}`,
  () => $fetch(`/api/worlds/${worldId.value}/entities/${entityId.value}`),
  {
    watch: [worldId, entityId]
  }
)

function blockByKey(key: string) {
  return entity.value?.blocks?.find?.((block: any) => {
    const blockKey = String(block?.block_key || block?.blockKey || '')
    return blockKey === key
  }) || null
}

const itemCore = computed(() => blockByKey('item_core')?.data || null)
const spellCore = computed(() => blockByKey('spell_core')?.data || null)
const speciesCore = computed(() => blockByKey('species_core')?.data || null)
const classCore = computed(() => blockByKey('class_core')?.data || null)
const backgroundCore = computed(() => blockByKey('background_core')?.data || null)

const entityImageUrl = computed(() => {
  if (entity.value?.imageUrl) return entity.value.imageUrl
  if (entity.value?.image_url) return entity.value.image_url
  if (entity.value?.image) return `/api/assets/${entity.value.image}`
  return ''
})

const articleMarkdown = computed(() => {
  if (!entity.value) return ''

  return (
    entity.value?.monsterProfile?.fluff_markdown ||
    entity.value?.fluff_markdown ||
    entity.value?.summary_markdown ||
    itemCore.value?.description ||
    spellCore.value?.description ||
    speciesCore.value?.description ||
    speciesCore.value?.traits ||
    classCore.value?.description ||
    classCore.value?.features ||
    backgroundCore.value?.description ||
    entity.value?.blocks?.find?.((block: any) => block?.block_key === 'overview' || block?.blockKey === 'overview')?.data?.text ||
    entity.value?.summary ||
    ''
  )
})

const articleHtml = computed(() => renderMarkdown(articleMarkdown.value || ''))

const derivedSummary = computed(() => {
  const explicit = String(entity.value?.summary || '').trim()
  if (explicit) return explicit

  const markdown = String(articleMarkdown.value || '').trim()
  if (!markdown) return ''

  const cleaned = markdown
    .replace(/^#.*$/gm, '')
    .replace(/^>.*$/gm, '')
    .replace(/[*_`#>-]/g, '')
    .replace(/\|/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  const firstSentence = cleaned.split(/(?<=[.!?])\s+/)[0] || ''
  return firstSentence.slice(0, 280).trim()
})

function parseJsonishValue(value: any): any {
  if (typeof value !== 'string') return value

  const trimmed = value.trim()
  if (!trimmed) return value

  if (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  ) {
    try {
      return JSON.parse(trimmed)
    } catch {
      return value
    }
  }

  return value
}

function formatSimpleValue(value: any): string {
  value = parseJsonishValue(value)

  if (value == null || value === '') return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number') return String(value)
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'

  if (Array.isArray(value)) {
    return value.map(formatSimpleValue).filter(Boolean).join(', ')
  }

  if (typeof value === 'object') {
    return Object.entries(value)
      .map(([k, v]) => `${k}: ${formatSimpleValue(v)}`)
      .filter(Boolean)
      .join(', ')
  }

  return String(value)
}

function formatSpeed(value: any): string {
  if (value == null || value === '') return ''

  if (typeof value === 'string' || typeof value === 'number') {
    return String(value)
  }

  if (Array.isArray(value)) {
    return value.map(formatSpeed).filter(Boolean).join(', ')
  }

  if (typeof value === 'object') {
    return Object.entries(value)
      .map(([k, v]) => {
        if (typeof v === 'boolean') return v ? k : ''
        return `${k}: ${formatSimpleValue(v)}`
      })
      .filter(Boolean)
      .join(', ')
  }

  return String(value)
}

function formatSize(value: any): string {
  return formatSimpleValue(value)
}

function formatPrimaryAbility(value: any): string {
  value = parseJsonishValue(value)

  if (value == null || value === '') return ''

  if (typeof value === 'string') return value.toUpperCase()

  if (Array.isArray(value)) {
    return value.map(formatPrimaryAbility).filter(Boolean).join(', ')
  }

  if (typeof value === 'object') {
    return Object.entries(value)
      .map(([k, v]) => {
        if (typeof v === 'boolean') return v ? k.toUpperCase() : ''
        return `${k.toUpperCase()}: ${formatSimpleValue(v)}`
      })
      .filter(Boolean)
      .join(', ')
  }

  return String(value)
}

function itemMetaLines() {
  const core = itemCore.value
  if (!core) return []

  return [
    core.item_type ? `Type: ${core.item_type}` : '',
    core.rarity ? `Rarity: ${core.rarity}` : '',
    core.damage ? `Damage: ${core.damage}${core.damage_type ? ` ${core.damage_type}` : ''}` : '',
    core.armor_class ? `Armor Class: ${core.armor_class}` : '',
    core.weight ? `Weight: ${core.weight}` : '',
    core.value ? `Value: ${core.value}` : '',
    core.attunement ? 'Requires Attunement' : ''
  ].filter(Boolean)
}

function spellMetaLines() {
  const core = spellCore.value
  if (!core) return []

  return [
    core.level !== undefined && core.level !== null ? `Level: ${core.level}` : '',
    core.school ? `School: ${core.school}` : '',
    core.casting_time ? `Casting Time: ${core.casting_time}` : '',
    core.range ? `Range: ${core.range}` : '',
    core.duration ? `Duration: ${core.duration}` : '',
    core.components ? `Components: ${core.components}` : '',
    core.ritual ? 'Ritual' : '',
    core.concentration ? 'Concentration' : '',
    core.higher_level ? `At Higher Levels: ${core.higher_level}` : ''
  ].filter(Boolean)
}

function speciesMetaLines() {
  const core = speciesCore.value
  if (!core) return []

  const size = formatSize(core.size ?? core.size_json ?? core.race_size)
  const speed = formatSpeed(core.speed ?? core.speed_json ?? core.race_speed)

  return [
    size ? `Size: ${size}` : '',
    speed ? `Speed: ${speed}` : ''
  ].filter(Boolean)
}

function classMetaLines() {
  const core = classCore.value
  if (!core) return []

  const hitDie = core.hit_die ?? core.hitDie ?? core.hd
  const primaryAbility = core.primary_ability ?? core.primaryAbility ?? core.spellcasting_ability

  return [
    hitDie ? `Hit Die: ${formatSimpleValue(hitDie)}` : '',
    primaryAbility ? `Primary Ability: ${formatPrimaryAbility(primaryAbility)}` : ''
  ].filter(Boolean)
}

function backgroundMetaLines() {
  const core = backgroundCore.value
  if (!core) return []

  return [
    core.feature ? `Feature: ${core.feature}` : ''
  ].filter(Boolean)
}

async function onImageSelected(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input?.files?.[0]

  if (!file) return

  imageError.value = ''
  imageSuccess.value = ''
  uploadingImage.value = true

  try {
    const formData = new FormData()
    formData.append('file', file)

    await $fetch(`/api/worlds/${worldId.value}/entities/${entityId.value}/apply-image`, {
      method: 'POST',
      body: formData
    })

    await refreshEntity()
    imageSuccess.value = 'Image applied.'
  } catch (error: any) {
    imageError.value =
      error?.data?.statusMessage ||
      error?.data?.message ||
      error?.message ||
      'Failed to upload image.'
  } finally {
    uploadingImage.value = false
    if (input) input.value = ''
  }
}
</script>

<template>
  <div class="h-full overflow-y-auto bg-transparent">
    <div class="mx-auto max-w-[1900px] p-6">
      <div class="pr-[380px] transition-all duration-200">
        <section class="rounded-[24px] border border-white/10 bg-[linear-gradient(to_bottom,rgba(26,30,38,0.40),rgba(12,16,22,0.28))] p-6 backdrop-blur-xl shadow-[0_18px_50px_rgba(0,0,0,0.16)]">
          <div class="text-xs uppercase tracking-[0.35em] text-slate-500">
            {{ world?.name || 'World' }}
          </div>

          <div class="mt-3 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div class="min-w-0">
              <h1 class="text-5xl font-semibold tracking-tight text-white">
                {{ entity?.title || 'Entity' }}
              </h1>

              <div class="mt-4 flex flex-wrap gap-2">
                <div class="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-sm text-slate-300">
                  {{ entity?.entity_type || 'entity' }}
                </div>

                <div class="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-sm text-slate-300">
                  {{ entity?.slug || 'no-slug' }}
                </div>

                <div
                  v-if="entity?.statblock?.challenge_rating"
                  class="rounded-full border border-red-400/20 bg-red-400/10 px-3 py-1.5 text-sm text-red-200"
                >
                  CR {{ entity.statblock.challenge_rating }}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section
          v-if="itemCore"
          class="mt-6 rounded-[28px] border border-white/10 bg-[linear-gradient(to_bottom,rgba(24,28,34,0.34),rgba(12,16,22,0.24))] p-7 backdrop-blur-xl shadow-[0_20px_60px_rgba(0,0,0,0.14)]"
        >
          <div class="text-xs uppercase tracking-[0.3em] text-slate-500">Item Details</div>
          <div class="mt-5 grid gap-3 text-sm text-slate-200">
            <div v-for="line in itemMetaLines()" :key="line">{{ line }}</div>
          </div>
        </section>

        <section
          v-if="spellCore"
          class="mt-6 rounded-[28px] border border-white/10 bg-[linear-gradient(to_bottom,rgba(24,28,34,0.34),rgba(12,16,22,0.24))] p-7 backdrop-blur-xl shadow-[0_20px_60px_rgba(0,0,0,0.14)]"
        >
          <div class="text-xs uppercase tracking-[0.3em] text-slate-500">Spell Details</div>
          <div class="mt-5 grid gap-3 text-sm text-slate-200">
            <div v-for="line in spellMetaLines()" :key="line">{{ line }}</div>
          </div>
        </section>

        <section
          v-if="speciesCore"
          class="mt-6 rounded-[28px] border border-white/10 bg-[linear-gradient(to_bottom,rgba(24,28,34,0.34),rgba(12,16,22,0.24))] p-7 backdrop-blur-xl shadow-[0_20px_60px_rgba(0,0,0,0.14)]"
        >
          <div class="text-xs uppercase tracking-[0.3em] text-slate-500">Species Details</div>
          <div class="mt-5 grid gap-3 text-sm text-slate-200">
            <div v-for="line in speciesMetaLines()" :key="line">{{ line }}</div>
          </div>
        </section>

        <section
          v-if="classCore"
          class="mt-6 rounded-[28px] border border-white/10 bg-[linear-gradient(to_bottom,rgba(24,28,34,0.34),rgba(12,16,22,0.24))] p-7 backdrop-blur-xl shadow-[0_20px_60px_rgba(0,0,0,0.14)]"
        >
          <div class="text-xs uppercase tracking-[0.3em] text-slate-500">Class Details</div>
          <div class="mt-5 grid gap-3 text-sm text-slate-200">
            <div v-for="line in classMetaLines()" :key="line">{{ line }}</div>
          </div>
        </section>

        <section
          v-if="backgroundCore"
          class="mt-6 rounded-[28px] border border-white/10 bg-[linear-gradient(to_bottom,rgba(24,28,34,0.34),rgba(12,16,22,0.24))] p-7 backdrop-blur-xl shadow-[0_20px_60px_rgba(0,0,0,0.14)]"
        >
          <div class="text-xs uppercase tracking-[0.3em] text-slate-500">Background Details</div>
          <div class="mt-5 grid gap-3 text-sm text-slate-200">
            <div v-for="line in backgroundMetaLines()" :key="line">{{ line }}</div>
          </div>
        </section>

        <section class="mt-6 rounded-[28px] border border-white/10 bg-[linear-gradient(to_bottom,rgba(24,28,34,0.34),rgba(12,16,22,0.24))] p-7 backdrop-blur-xl shadow-[0_20px_60px_rgba(0,0,0,0.14)]">
          <div class="text-xs uppercase tracking-[0.3em] text-slate-500">
            Article
          </div>

          <div
            v-if="articleMarkdown"
            class="markdown-content mt-6 text-[15px] leading-7 text-slate-200"
            v-html="articleHtml"
          ></div>

          <p
            v-else
            class="mt-4 whitespace-pre-wrap text-lg leading-8 text-slate-100"
          >
            No article content yet.
          </p>
        </section>
      </div>
    </div>

    <aside class="fixed right-0 top-0 z-30 h-full w-[360px] border-l border-white/10 bg-[linear-gradient(to_bottom,rgba(14,18,24,0.72),rgba(10,13,18,0.62))] backdrop-blur-xl">
      <div class="flex h-full flex-col">
        <div class="border-b border-white/10 px-5 py-5">
          <div class="text-xs uppercase tracking-[0.35em] text-slate-500">Entity</div>
          <h2 class="mt-3 truncate text-2xl font-semibold text-white">{{ entity?.title || 'Entity' }}</h2>
        </div>

        <div class="flex-1 overflow-y-auto px-5 py-5 space-y-5">
          <div class="overflow-hidden rounded-[28px] border border-white/10 bg-[linear-gradient(to_bottom,rgba(24,28,34,0.28),rgba(12,16,22,0.20))] backdrop-blur-lg">
            <div
              v-if="entityImageUrl"
              class="aspect-[4/3] w-full bg-black/20"
            >
              <img
                :src="entityImageUrl"
                :alt="entity?.title || 'Entity image'"
                class="h-full w-full object-cover object-[center_15%]"
              >
            </div>

            <div
              v-else
              class="flex aspect-[4/3] items-center justify-center bg-white/[0.03] text-4xl font-semibold text-slate-400"
            >
              {{ (entity?.title || 'E').slice(0, 2).toUpperCase() }}
            </div>

            <div v-if="mode === 'build'" class="border-t border-white/10 p-4">
              <label class="mb-2 block text-xs uppercase tracking-[0.25em] text-slate-500">
                Article Image
              </label>

              <input
                type="file"
                accept="image/*"
                class="block w-full text-sm text-slate-300 file:mr-4 file:rounded-xl file:border file:border-white/10 file:bg-white/[0.06] file:px-4 file:py-2 file:text-sm file:text-slate-100"
                @change="onImageSelected"
              >

              <div v-if="uploadingImage" class="mt-2 text-sm text-slate-300">
                Uploading image...
              </div>

              <div v-if="imageSuccess" class="mt-2 text-sm text-emerald-300">
                {{ imageSuccess }}
              </div>

              <div v-if="imageError" class="mt-2 text-sm text-red-300">
                {{ imageError }}
              </div>
            </div>
          </div>

          <WorldPagePresentationPanel
            v-if="mode === 'build'"
            :world-id="worldId"
            page-key="entity-article"
            title="Entity Article"
            description="Build-mode page controls live here for this article view."
          />

          <div class="rounded-[28px] border border-white/10 bg-[linear-gradient(to_bottom,rgba(24,28,34,0.30),rgba(12,16,22,0.22))] p-5 backdrop-blur-lg">
            <div class="text-xs uppercase tracking-[0.3em] text-slate-500">
              Summary
            </div>

            <p class="mt-4 whitespace-pre-wrap text-sm leading-7 text-slate-200">
              {{ derivedSummary || 'No summary yet.' }}
            </p>
          </div>

          <div
            v-if="itemCore"
            class="rounded-[28px] border border-white/10 bg-[linear-gradient(to_bottom,rgba(24,28,34,0.30),rgba(12,16,22,0.22))] p-5 backdrop-blur-lg"
          >
            <div class="text-xs uppercase tracking-[0.3em] text-slate-500">Item Details</div>
            <div class="mt-4 space-y-2 text-sm text-slate-200">
              <div v-for="line in itemMetaLines()" :key="line">{{ line }}</div>
            </div>
          </div>

          <div
            v-if="spellCore"
            class="rounded-[28px] border border-white/10 bg-[linear-gradient(to_bottom,rgba(24,28,34,0.30),rgba(12,16,22,0.22))] p-5 backdrop-blur-lg"
          >
            <div class="text-xs uppercase tracking-[0.3em] text-slate-500">Spell Details</div>
            <div class="mt-4 space-y-2 text-sm text-slate-200">
              <div v-for="line in spellMetaLines()" :key="line">{{ line }}</div>
            </div>
          </div>

          <div
            v-if="speciesCore"
            class="rounded-[28px] border border-white/10 bg-[linear-gradient(to_bottom,rgba(24,28,34,0.30),rgba(12,16,22,0.22))] p-5 backdrop-blur-lg"
          >
            <div class="text-xs uppercase tracking-[0.3em] text-slate-500">Species Details</div>
            <div class="mt-4 space-y-2 text-sm text-slate-200">
              <div v-for="line in speciesMetaLines()" :key="line">{{ line }}</div>
            </div>
          </div>

          <div
            v-if="classCore"
            class="rounded-[28px] border border-white/10 bg-[linear-gradient(to_bottom,rgba(24,28,34,0.30),rgba(12,16,22,0.22))] p-5 backdrop-blur-lg"
          >
            <div class="text-xs uppercase tracking-[0.3em] text-slate-500">Class Details</div>
            <div class="mt-4 space-y-2 text-sm text-slate-200">
              <div v-for="line in classMetaLines()" :key="line">{{ line }}</div>
            </div>
          </div>

          <div
            v-if="backgroundCore"
            class="rounded-[28px] border border-white/10 bg-[linear-gradient(to_bottom,rgba(24,28,34,0.30),rgba(12,16,22,0.22))] p-5 backdrop-blur-lg"
          >
            <div class="text-xs uppercase tracking-[0.3em] text-slate-500">Background Details</div>
            <div class="mt-4 space-y-2 text-sm text-slate-200">
              <div v-for="line in backgroundMetaLines()" :key="line">{{ line }}</div>
            </div>
          </div>

          <div
            v-if="entity?.statblock"
            class="rounded-[28px] border border-white/10 bg-[linear-gradient(to_bottom,rgba(24,28,34,0.30),rgba(12,16,22,0.22))] p-5 backdrop-blur-lg"
          >
            <div class="text-xs uppercase tracking-[0.3em] text-slate-500">
              Statblock
            </div>

            <div class="mt-4 grid grid-cols-2 gap-3 text-sm text-slate-200">
              <div><span class="text-slate-400">CR:</span> {{ entity.statblock.challenge_rating || '—' }}</div>
              <div><span class="text-slate-400">AC:</span> {{ entity.statblock.armor_class ?? '—' }}</div>
              <div><span class="text-slate-400">HP:</span> {{ entity.statblock.hit_points_average ?? '—' }}</div>
              <div><span class="text-slate-400">Type:</span> {{ entity.statblock.creature_type || '—' }}</div>
              <div><span class="text-slate-400">Size:</span> {{ Array.isArray(entity.statblock.size_json) ? entity.statblock.size_json.join(' / ') : (entity.statblock.size_json || '—') }}</div>
              <div><span class="text-slate-400">Align:</span> {{ Array.isArray(entity.statblock.alignment_json) ? entity.statblock.alignment_json.join(' / ') : (entity.statblock.alignment_json || '—') }}</div>
            </div>
          </div>

          <div
            v-if="entity?.actions?.length"
            class="rounded-[28px] border border-white/10 bg-[linear-gradient(to_bottom,rgba(24,28,34,0.30),rgba(12,16,22,0.22))] p-5 backdrop-blur-lg"
          >
            <div class="text-xs uppercase tracking-[0.3em] text-slate-500">
              Actions
            </div>

            <div class="mt-4 space-y-4">
              <div
                v-for="action in entity.actions"
                :key="action.id"
                class="rounded-2xl border border-white/10 bg-black/10 p-4"
              >
                <div class="flex items-center justify-between gap-3">
                  <div class="font-medium text-white">{{ action.name }}</div>
                  <div class="text-[11px] uppercase tracking-[0.15em] text-slate-500">
                    {{ action.action_type || 'action' }}
                  </div>
                </div>

                <div class="mt-2 whitespace-pre-wrap text-sm leading-7 text-slate-200">
                  {{ action.text }}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </aside>
  </div>
</template>

<style scoped>
:deep(.markdown-content) {
  color: rgb(226 232 240);
  font-size: 15px;
  line-height: 1.9;
}

:deep(.markdown-content > :first-child) {
  margin-top: 0 !important;
}

:deep(.markdown-content > :last-child) {
  margin-bottom: 0 !important;
}

:deep(.markdown-content h1) {
  margin: 0 0 0.9rem 0;
  font-size: 1.7rem;
  line-height: 1.2;
  font-weight: 700;
  color: white;
}

:deep(.markdown-content h2) {
  margin: 1.25rem 0 0.75rem 0;
  font-size: 1.3rem;
  line-height: 1.25;
  font-weight: 700;
  color: white;
}

:deep(.markdown-content h3) {
  margin: 1rem 0 0.55rem 0;
  font-size: 1.05rem;
  line-height: 1.3;
  font-weight: 600;
  color: white;
}

:deep(.markdown-content p) {
  margin: 0.9rem 0;
}

:deep(.markdown-content strong) {
  color: white;
  font-weight: 700;
}

:deep(.markdown-content em) {
  color: rgb(241 245 249);
  font-style: italic;
}

:deep(.markdown-content ul),
:deep(.markdown-content ol) {
  margin: 1rem 0;
  padding-left: 1.35rem;
}

:deep(.markdown-content li) {
  margin: 0.35rem 0;
}

:deep(.markdown-content blockquote) {
  margin: 1rem 0;
  padding: 0.9rem 1rem;
  border-left: 4px solid rgba(56, 189, 248, 0.35);
  background: rgba(255,255,255,0.04);
  border-radius: 0.85rem;
  color: rgb(226 232 240);
  font-style: italic;
}

:deep(.markdown-content hr) {
  margin: 1.25rem 0;
  border: 0;
  border-top: 1px solid rgba(255,255,255,0.08);
}

:deep(.markdown-content table) {
  width: 100%;
  margin: 1rem 0;
  border-collapse: collapse;
  overflow: hidden;
  border-radius: 0.85rem;
}

:deep(.markdown-content th) {
  padding: 0.65rem 0.75rem;
  border: 1px solid rgba(255,255,255,0.08);
  background: rgba(255,255,255,0.05);
  color: white;
  text-align: left;
  font-weight: 600;
}

:deep(.markdown-content td) {
  padding: 0.65rem 0.75rem;
  border: 1px solid rgba(255,255,255,0.08);
  color: rgb(203 213 225);
}

:deep(.markdown-content code) {
  border: 1px solid rgba(255,255,255,0.08);
  background: rgba(255,255,255,0.04);
  border-radius: 0.4rem;
  padding: 0.15rem 0.35rem;
  font-size: 0.9em;
}

:deep(.markdown-content pre) {
  overflow-x: auto;
  border: 1px solid rgba(255,255,255,0.08);
  background: rgba(255,255,255,0.04);
  border-radius: 1rem;
  padding: 0.9rem 1rem;
}

:deep(.markdown-content pre code) {
  border: 0;
  background: transparent;
  padding: 0;
}
</style>
