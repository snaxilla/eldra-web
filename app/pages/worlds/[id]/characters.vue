<script setup lang="ts">
definePageMeta({
  layout: 'world-workspace'
})

const route = useRoute()
const worldId = computed(() => String(route.params.id || ''))

const search = ref('')
const typeFilter = ref<'all' | 'npc' | 'npc_sheet' | 'pc'>('all')

const { data: world } = await useFetch(() => `/api/worlds/${worldId.value}`)

const {
  data: entities,
  pending,
  refresh
} = await useFetch(() => `/api/worlds/${worldId.value}/entities`, {
  default: () => []
})

function normalizeCharacterType(entity: any): 'npc' | 'npc_sheet' | 'pc' | 'unknown' {
  const explicit = String(entity?.character_type || '').toLowerCase()
  if (explicit === 'npc') return 'npc'
  if (explicit === 'npc_sheet') return 'npc_sheet'
  if (explicit === 'pc') return 'pc'

  const entityType = String(entity?.entity_type || '').toLowerCase()
  if (entityType === 'pc') return 'pc'
  if (entityType === 'player_character') return 'pc'
  if (entityType === 'npc_sheet') return 'npc_sheet'
  if (entityType === 'character') return 'npc'
  if (entityType === 'npc') return 'npc'

  const hasSheet = entity?.has_sheet === true || entity?.has_sheet === 1
  if (hasSheet) return 'npc_sheet'

  return 'unknown'
}

function isCharacterEntity(entity: any) {
  const entityType = String(entity?.entity_type || '').toLowerCase()
  const characterType = String(entity?.character_type || '').toLowerCase()

  return [
    'character',
    'npc',
    'npc_sheet',
    'pc',
    'player_character'
  ].includes(entityType) || [
    'npc',
    'npc_sheet',
    'pc'
  ].includes(characterType)
}

function initialsFor(name: string) {
  const words = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)

  if (!words.length) return '?'
  return words.map(w => w[0]?.toUpperCase() || '').join('')
}

function typeLabel(type: string) {
  if (type === 'npc') return 'NPC'
  if (type === 'npc_sheet') return 'NPC + Sheet'
  if (type === 'pc') return 'Player Character'
  return 'Character'
}

function typeBadgeClass(type: string) {
  if (type === 'pc') {
    return 'border-sky-400/20 bg-sky-400/10 text-sky-200'
  }
  if (type === 'npc_sheet') {
    return 'border-violet-400/20 bg-violet-400/10 text-violet-200'
  }
  return 'border-white/10 bg-white/[0.05] text-slate-300'
}

function imageUrlFor(entity: any) {
  if (entity?.image_url) return String(entity.image_url)
  if (entity?.imageUrl) return String(entity.imageUrl)
  if (entity?.image) return `/api/assets/${entity.image}`
  return null
}

const characterEntities = computed(() => {
  return (entities.value || [])
    .filter(isCharacterEntity)
    .map((entity: any) => {
      const normalizedType = normalizeCharacterType(entity)
      return {
        ...entity,
        normalizedType,
        imageUrl: imageUrlFor(entity),
        displayTitle: String(entity?.title || 'Untitled Character'),
        displaySummary: String(entity?.summary || '').trim(),
      }
    })
})

const filteredCharacters = computed(() => {
  const q = search.value.trim().toLowerCase()

  return characterEntities.value
    .filter((character: any) => {
      if (typeFilter.value !== 'all' && character.normalizedType !== typeFilter.value) {
        return false
      }

      if (!q) return true

      return [
        character.displayTitle,
        character.displaySummary,
        character.role,
        character.entity_type,
        character.character_type
      ]
        .filter(Boolean)
        .some((value: any) => String(value).toLowerCase().includes(q))
    })
    .sort((a: any, b: any) => a.displayTitle.localeCompare(b.displayTitle))
})

const characterCounts = computed(() => {
  const list = characterEntities.value
  return {
    all: list.length,
    npc: list.filter((c: any) => c.normalizedType === 'npc').length,
    npc_sheet: list.filter((c: any) => c.normalizedType === 'npc_sheet').length,
    pc: list.filter((c: any) => c.normalizedType === 'pc').length,
  }
})
</script>

<template>
  <div class="h-full overflow-y-auto bg-transparent">
    <div class="mx-auto max-w-[1700px] space-y-6 p-6">
      <section class="rounded-[24px] border border-white/10 eldra-panel p-6 shadow-xl">
        <div class="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div class="text-xs uppercase tracking-[0.35em] text-slate-500">Characters</div>
            <h1 class="mt-2 text-3xl font-semibold text-white">{{ world?.name || 'World' }}</h1>
            <p class="mt-2 max-w-3xl text-sm text-slate-400">
              Browse player characters, NPCs, and sheet-enabled combatants in one roster-first view.
            </p>
          </div>

          <div class="flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              class="rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-2.5 text-sm font-medium text-emerald-100 transition hover:bg-emerald-400/20"
            >
              Add Character
            </button>

            <button
              type="button"
              class="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-slate-200 transition hover:bg-white/[0.08]"
              @click="refresh()"
            >
              Refresh
            </button>
          </div>
        </div>

        <div class="mt-5 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
          <input
            v-model="search"
            type="text"
            placeholder="Search characters..."
            class="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white placeholder-slate-500 outline-none transition focus:border-sky-400/30 focus:bg-white/[0.06]"
          >

          <div class="flex flex-wrap gap-2">
            <button
              type="button"
              class="rounded-full border px-3 py-2 text-xs font-medium transition"
              :class="typeFilter === 'all'
                ? 'border-sky-300/30 bg-sky-400/15 text-sky-100'
                : 'border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/[0.08]'"
              @click="typeFilter = 'all'"
            >
              All ({{ characterCounts.all }})
            </button>

            <button
              type="button"
              class="rounded-full border px-3 py-2 text-xs font-medium transition"
              :class="typeFilter === 'npc'
                ? 'border-sky-300/30 bg-sky-400/15 text-sky-100'
                : 'border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/[0.08]'"
              @click="typeFilter = 'npc'"
            >
              NPCs ({{ characterCounts.npc }})
            </button>

            <button
              type="button"
              class="rounded-full border px-3 py-2 text-xs font-medium transition"
              :class="typeFilter === 'npc_sheet'
                ? 'border-sky-300/30 bg-sky-400/15 text-sky-100'
                : 'border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/[0.08]'"
              @click="typeFilter = 'npc_sheet'"
            >
              NPC + Sheet ({{ characterCounts.npc_sheet }})
            </button>

            <button
              type="button"
              class="rounded-full border px-3 py-2 text-xs font-medium transition"
              :class="typeFilter === 'pc'
                ? 'border-sky-300/30 bg-sky-400/15 text-sky-100'
                : 'border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/[0.08]'"
              @click="typeFilter = 'pc'"
            >
              PCs ({{ characterCounts.pc }})
            </button>
          </div>
        </div>
      </section>

      <section
        v-if="pending"
        class="rounded-[24px] border border-white/10 eldra-panel p-6 text-slate-400 shadow-xl"
      >
        Loading characters...
      </section>

      <section
        v-else-if="!filteredCharacters.length"
        class="rounded-[24px] eldra-empty p-10 text-center shadow-xl"
      >
        <div class="text-lg font-medium text-white">No characters found</div>
        <p class="mt-2 text-sm text-slate-400">
          Add characters manually or import supporting content, then come back here to manage the roster.
        </p>
      </section>

      <section
        v-else
        class="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3"
      >
        <NuxtLink
          v-for="character in filteredCharacters"
          :key="character.id"
          :to="`/worlds/${worldId}/entities/${character.id}`"
          class="group overflow-hidden rounded-[24px] border border-white/10 eldra-panel shadow-xl transition hover:-translate-y-0.5 hover:border-white/20 hover:bg-[rgba(10,20,34,0.88)]"
        >
          <div class="flex min-h-[168px]">
            <div class="relative w-[112px] shrink-0 border-r border-white/10 bg-black/20">
              <img
                v-if="character.imageUrl"
                :src="character.imageUrl"
                :alt="character.displayTitle"
                class="h-full w-full object-cover"
              >
              <div
                v-else
                class="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-800/80 to-slate-950 text-2xl font-semibold text-slate-300"
              >
                {{ initialsFor(character.displayTitle) }}
              </div>
            </div>

            <div class="flex min-w-0 flex-1 flex-col p-5">
              <div class="flex flex-wrap items-center gap-2">
                <div class="truncate text-lg font-semibold text-white">
                  {{ character.displayTitle }}
                </div>

                <span
                  class="rounded-full border px-2.5 py-1 text-[11px] font-medium"
                  :class="typeBadgeClass(character.normalizedType)"
                >
                  {{ typeLabel(character.normalizedType) }}
                </span>
              </div>

              <div class="mt-2 flex flex-wrap gap-2 text-xs text-slate-400">
                <span
                  v-if="character.role"
                  class="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1"
                >
                  {{ character.role }}
                </span>

                <span
                  v-if="character.has_sheet || character.normalizedType === 'npc_sheet' || character.normalizedType === 'pc'"
                  class="rounded-full border border-violet-400/20 bg-violet-400/10 px-2.5 py-1 text-violet-200"
                >
                  Sheet Enabled
                </span>
              </div>

              <p class="mt-4 line-clamp-3 text-sm leading-6 text-slate-300">
                {{ character.displaySummary || 'No summary yet.' }}
              </p>

              <div class="mt-auto pt-4 text-xs font-medium text-sky-200 transition group-hover:text-sky-100">
                Open Character →
              </div>
            </div>
          </div>
        </NuxtLink>
      </section>
    </div>
  </div>
</template>
