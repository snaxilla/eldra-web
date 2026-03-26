<script setup lang="ts">
const route = useRoute()
const worldId = route.params.id
const entityId = route.params.entityId

const { data: world } = await useFetch(`/api/worlds/${worldId}`)
const {
  data: entity,
  refresh: refreshEntity
} = await useFetch(`/api/worlds/${worldId}/entities/${entityId}`)

const selectedFile = ref<File | null>(null)
const uploadedFileId = ref<string | null>(null)
const uploadedPreviewUrl = ref<string | null>(null)
const uploadProgress = ref(0)
const uploadState = ref<'idle' | 'uploading' | 'uploaded' | 'applying' | 'done' | 'error'>('idle')
const uploadMessage = ref('')

function prettyLabel(value?: string) {
  if (!value) return ''
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase())
}

function displayValue(value: any) {
  if (value === null || value === undefined || value === '') return null

  if (typeof value === 'object') {
    if (value.image_url) return value.image_url
    if (value.file_id) return `/api/assets/${value.file_id}`
    if (value.id) return `/api/assets/${value.id}`
    return JSON.stringify(value, null, 2)
  }

  return String(value)
}

function isLikelyImage(value: any) {
  const resolved = String(displayValue(value) || '')
  return resolved.startsWith('/api/assets/') || resolved.startsWith('http')
}

function isLongText(value: any) {
  const resolved = String(displayValue(value) || '')
  return resolved.length > 140 || resolved.includes('\n')
}

function asArray(value: any) {
  if (Array.isArray(value)) return value
  if (value === null || value === undefined || value === '') return []
  return [value]
}

function joinList(value: any) {
  const arr = asArray(value)
  if (!arr.length) return null
  return arr.join(', ')
}

function hasValue(value: any) {
  return !(value === null || value === undefined || value === '')
}

const entityType = computed(() => String(entity.value?.entity_type || '').toLowerCase())

const typeTheme = computed(() => {
  const type = entityType.value

  if (type === 'spell') {
    return {
      accent: '#7c5cff',
      soft: '#f1ecff',
      border: '#d8cbff',
      tag: '#ede7ff'
    }
  }

  if (type === 'item') {
    return {
      accent: '#b38a2e',
      soft: '#fbf2de',
      border: '#dcc28a',
      tag: '#f7efdf'
    }
  }

  if (['character', 'npc', 'person', 'hero', 'species'].includes(type)) {
    return {
      accent: '#8d5a3d',
      soft: '#f5e8df',
      border: '#d8b49c',
      tag: '#f6ede7'
    }
  }

  if (type === 'location') {
    return {
      accent: '#3d7c6a',
      soft: '#e4f3ee',
      border: '#abd3c6',
      tag: '#eef8f4'
    }
  }

  return {
    accent: '#90704a',
    soft: '#f3eadc',
    border: '#d7c4a0',
    tag: '#f7efdf'
  }
})

const heroImage = computed(() => {
  return uploadedPreviewUrl.value || entity.value?.image_url || world.value?.banner_image_url || null
})

const summaryText = computed(() => {
  if (entity.value?.summary) return entity.value.summary

  for (const block of entity.value?.blocks || []) {
    if (block?.data?.summary) return block.data.summary
    if (block?.data?.description) return block.data.description
    if (block?.data?.bio) return block.data.bio
    if (block?.data?.text) return block.data.text
  }

  return null
})

const isCharacterLike = computed(() => {
  return ['character', 'npc', 'person', 'hero', 'species'].includes(entityType.value)
})

const rawBlocks = computed(() => {
  return (entity.value?.blocks || []).filter((block: any) => block.block_key !== 'import_source')
})

const normalizedBlocks = computed(() => {
  return rawBlocks.value
    .map((block: any) => {
      const entries = Object.entries(block.data || {})
        .filter(([key]) => key !== 'image')
        .filter(([, value]) => value !== null && value !== undefined && value !== '')

      const profileEntries = entries.filter(([, value]) => !isLikelyImage(value) && !isLongText(value))
      const proseEntries = entries.filter(([, value]) => !isLikelyImage(value) && isLongText(value))
      const imageEntries = entries.filter(([, value]) => isLikelyImage(value))

      return {
        ...block,
        profileEntries,
        proseEntries,
        imageEntries
      }
    })
    .filter((block: any) => block.profileEntries.length || block.proseEntries.length || block.imageEntries.length)
})

const primaryProfileBlock = computed(() => {
  if (!isCharacterLike.value) return null
  return normalizedBlocks.value.find((block: any) => block.profileEntries.length > 0) || null
})

const remainingBlocks = computed(() => {
  if (!isCharacterLike.value) return normalizedBlocks.value
  return normalizedBlocks.value.filter((block: any) => block.id !== primaryProfileBlock.value?.id)
})

const importBlock = computed(() => {
  return (entity.value?.blocks || []).find((block: any) => block.block_key === 'import_source') || null
})

const importEntries = computed(() => {
  if (!importBlock.value) return []

  return Object.entries(importBlock.value.data || {})
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
})

function onFileSelected(event: Event) {
  const input = event.target as HTMLInputElement
  selectedFile.value = input.files?.[0] || null
  uploadedFileId.value = null
  uploadedPreviewUrl.value = null
  uploadProgress.value = 0
  uploadState.value = 'idle'
  uploadMessage.value = ''
}

function uploadImage() {
  if (!selectedFile.value) return

  uploadState.value = 'uploading'
  uploadProgress.value = 0
  uploadMessage.value = ''

  const formData = new FormData()
  formData.append('file', selectedFile.value)

  const xhr = new XMLHttpRequest()
  xhr.open('POST', '/api/uploads/image')

  xhr.upload.onprogress = (event) => {
    if (event.lengthComputable) {
      uploadProgress.value = Math.round((event.loaded / event.total) * 100)
    }
  }

  xhr.onload = () => {
    try {
      const response = JSON.parse(xhr.responseText || '{}')

      if (xhr.status >= 200 && xhr.status < 300) {
        uploadedFileId.value = response.file_id
        uploadedPreviewUrl.value = response.asset_url
        uploadState.value = 'uploaded'
        uploadMessage.value = 'Upload succeeded. Click Apply Image to attach it to this entity.'
      } else {
        uploadState.value = 'error'
        uploadMessage.value = response.statusMessage || response.message || 'Upload failed.'
      }
    } catch {
      uploadState.value = 'error'
      uploadMessage.value = 'Upload failed.'
    }
  }

  xhr.onerror = () => {
    uploadState.value = 'error'
    uploadMessage.value = 'Upload failed.'
  }

  xhr.send(formData)
}

async function applyImage() {
  if (!uploadedFileId.value) return

  uploadState.value = 'applying'
  uploadMessage.value = ''

  try {
    await $fetch(`/api/worlds/${worldId}/entities/${entityId}/apply-image`, {
      method: 'POST',
      body: {
        file_id: uploadedFileId.value
      }
    })

    await refreshEntity()

    uploadState.value = 'done'
    uploadMessage.value = 'Image applied successfully.'
    uploadedFileId.value = null
    selectedFile.value = null
    uploadProgress.value = 100
  } catch (error: any) {
    uploadState.value = 'error'
    uploadMessage.value =
      error?.data?.statusMessage ||
      error?.statusMessage ||
      'Failed to apply image.'
  }
}
</script>

<template>
  <div class="space-y-8">
    <div class="flex items-center justify-between">
      <NuxtLink
        :to="`/worlds/${worldId}/entities`"
        class="inline-flex items-center gap-2 rounded-full border border-[#cfb07a] bg-[#fbf6ee] px-4 py-2 text-sm font-medium text-[#6b5333] transition hover:bg-[#f4ead8]"
      >
        <span>←</span>
        <span>Back to Entities</span>
      </NuxtLink>
    </div>

    <section
      class="overflow-hidden rounded-[34px] border bg-[#fbf6ee] shadow-[0_18px_38px_rgba(80,60,30,0.10)]"
      :style="{ borderColor: typeTheme.border }"
    >
      <div
        :class="isCharacterLike ? 'xl:grid-cols-[440px_1fr]' : 'xl:grid-cols-[380px_1fr]'"
        class="grid gap-0"
      >
        <div
          :class="isCharacterLike ? 'min-h-[580px]' : 'min-h-[440px]'"
          class="relative overflow-hidden border-b bg-[#efe5d4] xl:border-b-0 xl:border-r"
          :style="{ borderColor: typeTheme.border }"
        >
          <img
            v-if="heroImage"
            :src="heroImage"
            :alt="entity?.title || 'Entity image'"
            class="h-full w-full object-cover"
          >

          <div
            v-else
            class="flex h-full min-h-[440px] items-center justify-center bg-[linear-gradient(180deg,#efe3cd_0%,#e6d6bc_100%)]"
          >
            <div class="text-center">
              <div class="text-xs uppercase tracking-[0.35em] text-[#907a58]">
                No Image Yet
              </div>
              <div class="mt-3 text-6xl text-[#b38a2e]">✦</div>
            </div>
          </div>

          <div class="absolute inset-0 bg-gradient-to-t from-[rgba(20,14,10,0.18)] via-transparent to-transparent" />

          <div class="absolute inset-x-0 bottom-0 p-5">
            <div class="rounded-[24px] border border-white/30 bg-[rgba(255,248,236,0.88)] p-4 shadow-lg backdrop-blur">
              <div class="text-xs uppercase tracking-[0.35em] text-[#907a58]">
                Entity Image
              </div>

              <div class="mt-3 flex flex-col gap-3">
                <input
                  type="file"
                  accept="image/*"
                  class="text-sm text-[#4f4030]"
                  @change="onFileSelected"
                >

                <div
                  v-if="uploadState === 'uploading' || uploadState === 'uploaded' || uploadState === 'applying' || uploadState === 'done'"
                  class="space-y-2"
                >
                  <div class="h-3 overflow-hidden rounded-full bg-[#eadfc8]">
                    <div
                      class="h-full rounded-full bg-[#b38a2e] transition-all duration-300"
                      :style="{ width: `${uploadProgress}%` }"
                    />
                  </div>

                  <div class="text-sm text-[#6b5333]">
                    {{ uploadProgress }}%
                  </div>
                </div>

                <div class="flex flex-wrap gap-2">
                  <button
                    class="rounded-full border border-[#cfb07a] bg-[#f7efdf] px-4 py-2 text-sm font-medium text-[#6b5333] transition hover:bg-[#efe3cd] disabled:opacity-50"
                    :disabled="!selectedFile || uploadState === 'uploading' || uploadState === 'applying'"
                    @click="uploadImage"
                  >
                    {{ uploadState === 'uploading' ? 'Uploading...' : 'Upload Image' }}
                  </button>

                  <button
                    class="rounded-full bg-[#b38a2e] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#9d7825] disabled:opacity-50"
                    :disabled="!uploadedFileId || uploadState === 'applying'"
                    @click="applyImage"
                  >
                    {{ uploadState === 'applying' ? 'Applying...' : 'Apply Image' }}
                  </button>
                </div>

                <div
                  v-if="uploadMessage"
                  class="rounded-xl px-3 py-2 text-sm"
                  :class="{
                    'bg-emerald-50 text-emerald-700 border border-emerald-200': uploadState === 'uploaded' || uploadState === 'done',
                    'bg-red-50 text-red-700 border border-red-200': uploadState === 'error'
                  }"
                >
                  {{ uploadMessage }}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="p-8 md:p-10 xl:p-12">
          <div class="flex flex-wrap items-center gap-3">
            <div
              class="rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.32em]"
              :style="{
                color: typeTheme.accent,
                backgroundColor: typeTheme.soft
              }"
            >
              {{ world?.name || 'World' }}
            </div>

            <div
              v-if="entity?.entity_type"
              class="rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.32em]"
              :style="{
                color: typeTheme.accent,
                backgroundColor: typeTheme.tag,
                border: `1px solid ${typeTheme.border}`
              }"
            >
              {{ prettyLabel(entity.entity_type) }}
            </div>
          </div>

          <h1 class="mt-5 text-5xl font-semibold tracking-[0.01em] text-[#2f2419] md:text-6xl">
            {{ entity?.title || 'Untitled Entity' }}
          </h1>

          <div class="mt-5 flex flex-wrap gap-2">
            <div
              v-if="entity?.status"
              class="rounded-full border px-4 py-2 text-sm text-[#6b5333]"
              :style="{
                borderColor: typeTheme.border,
                backgroundColor: typeTheme.tag
              }"
            >
              {{ entity.status }}
            </div>

            <div
              v-if="entity?.visibility"
              class="rounded-full border px-4 py-2 text-sm text-[#6b5333]"
              :style="{
                borderColor: typeTheme.border,
                backgroundColor: typeTheme.tag
              }"
            >
              {{ entity.visibility }}
            </div>
          </div>

          <p
            v-if="summaryText"
            class="mt-8 max-w-4xl text-xl leading-10 text-[#4f4030]"
          >
            {{ summaryText }}
          </p>

          <div
            v-if="isCharacterLike && primaryProfileBlock && primaryProfileBlock.profileEntries.length"
            class="mt-10 rounded-[28px] border bg-[#fffaf2] p-6 shadow-[0_8px_18px_rgba(80,60,30,0.05)]"
            :style="{ borderColor: typeTheme.border }"
          >
            <div class="text-xs uppercase tracking-[0.35em] text-[#907a58]">
              Profile
            </div>

            <h2 class="mt-2 text-2xl font-semibold text-[#2f2419]">
              {{ primaryProfileBlock.label || prettyLabel(primaryProfileBlock.block_key) }}
            </h2>

            <div class="mt-6 grid gap-4 md:grid-cols-2">
              <div
                v-for="[key, rawValue] in primaryProfileBlock.profileEntries"
                :key="key"
                class="rounded-2xl border bg-[#fbf6ee] p-4"
                :style="{ borderColor: typeTheme.border }"
              >
                <div class="text-xs uppercase tracking-[0.35em] text-[#907a58]">
                  {{ prettyLabel(key) }}
                </div>

                <div class="mt-3 text-base leading-7 text-[#4f4030]">
                  {{ displayValue(rawValue) || '—' }}
                </div>
              </div>
            </div>
          </div>

          <div class="mt-10 grid gap-4 md:grid-cols-2" v-if="entity?.slug || entity?.updated_at">
            <div
              v-if="entity?.slug"
              class="rounded-2xl border bg-[#fffaf2] p-4"
              :style="{ borderColor: typeTheme.border }"
            >
              <div class="text-xs uppercase tracking-[0.35em] text-[#907a58]">
                Slug
              </div>
              <div class="mt-2 text-base text-[#2f2419]">
                {{ entity.slug }}
              </div>
            </div>

            <div
              v-if="entity?.updated_at"
              class="rounded-2xl border bg-[#fffaf2] p-4"
              :style="{ borderColor: typeTheme.border }"
            >
              <div class="text-xs uppercase tracking-[0.35em] text-[#907a58]">
                Updated
              </div>
              <div class="mt-2 text-base text-[#2f2419]">
                {{ entity.updated_at }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <template v-for="block in remainingBlocks" :key="block.id">
      <!-- Class -->
      <section
        v-if="block.block_key === 'class_core'"
        class="rounded-[30px] border bg-[#fbf6ee] p-6 md:p-8 shadow-[0_10px_24px_rgba(80,60,30,0.08)]"
        :style="{ borderColor: typeTheme.border }"
      >
        <div class="text-xs uppercase tracking-[0.35em] text-[#907a58]">
          {{ prettyLabel(block.block_key) }}
        </div>

        <h2 class="mt-2 text-3xl font-semibold text-[#2f2419]">
          {{ block.label || 'Class Core' }}
        </h2>

        <div class="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <div
            v-if="hasValue(block.data?.name)"
            class="rounded-2xl border bg-[#fffaf2] p-5"
            :style="{ borderColor: typeTheme.border }"
          >
            <div class="text-xs uppercase tracking-[0.35em] text-[#907a58]">Name</div>
            <div class="mt-3 text-2xl font-semibold text-[#2f2419]">{{ block.data.name }}</div>
          </div>

          <div
            v-if="hasValue(block.data?.hit_die)"
            class="rounded-2xl border bg-[#fffaf2] p-5"
            :style="{ borderColor: typeTheme.border }"
          >
            <div class="text-xs uppercase tracking-[0.35em] text-[#907a58]">Hit Die</div>
            <div class="mt-3 text-2xl font-semibold text-[#2f2419]">{{ block.data.hit_die }}</div>
          </div>

          <div
            v-if="hasValue(block.data?.primary_ability)"
            class="rounded-2xl border bg-[#fffaf2] p-5"
            :style="{ borderColor: typeTheme.border }"
          >
            <div class="text-xs uppercase tracking-[0.35em] text-[#907a58]">Primary Ability</div>
            <div class="mt-3 text-lg text-[#4f4030]">{{ joinList(block.data.primary_ability) }}</div>
          </div>

          <div
            v-if="hasValue(block.data?.saving_throws)"
            class="rounded-2xl border bg-[#fffaf2] p-5 md:col-span-2 xl:col-span-1"
            :style="{ borderColor: typeTheme.border }"
          >
            <div class="text-xs uppercase tracking-[0.35em] text-[#907a58]">Saving Throws</div>
            <div class="mt-3 text-lg leading-8 text-[#4f4030]">{{ joinList(block.data.saving_throws) }}</div>
          </div>

          <div
            v-if="hasValue(block.data?.armor_proficiencies)"
            class="rounded-2xl border bg-[#fffaf2] p-5 md:col-span-2"
            :style="{ borderColor: typeTheme.border }"
          >
            <div class="text-xs uppercase tracking-[0.35em] text-[#907a58]">Armor Proficiencies</div>
            <div class="mt-3 text-lg leading-8 text-[#4f4030]">{{ joinList(block.data.armor_proficiencies) }}</div>
          </div>

          <div
            v-if="hasValue(block.data?.weapon_proficiencies)"
            class="rounded-2xl border bg-[#fffaf2] p-5 md:col-span-2"
            :style="{ borderColor: typeTheme.border }"
          >
            <div class="text-xs uppercase tracking-[0.35em] text-[#907a58]">Weapon Proficiencies</div>
            <div class="mt-3 text-lg leading-8 text-[#4f4030]">{{ joinList(block.data.weapon_proficiencies) }}</div>
          </div>

          <div
            v-if="hasValue(block.data?.tool_proficiencies)"
            class="rounded-2xl border bg-[#fffaf2] p-5 md:col-span-2"
            :style="{ borderColor: typeTheme.border }"
          >
            <div class="text-xs uppercase tracking-[0.35em] text-[#907a58]">Tool Proficiencies</div>
            <div class="mt-3 text-lg leading-8 text-[#4f4030]">{{ joinList(block.data.tool_proficiencies) }}</div>
          </div>

          <div
            v-if="hasValue(block.data?.skills)"
            class="rounded-2xl border bg-[#fffaf2] p-5 md:col-span-2"
            :style="{ borderColor: typeTheme.border }"
          >
            <div class="text-xs uppercase tracking-[0.35em] text-[#907a58]">Skills</div>
            <div class="mt-3 text-lg leading-8 text-[#4f4030]">{{ joinList(block.data.skills) }}</div>
          </div>

          <div
            v-if="hasValue(block.data?.starting_equipment)"
            class="rounded-2xl border bg-[#fffaf2] p-5 md:col-span-2 xl:col-span-3"
            :style="{ borderColor: typeTheme.border }"
          >
            <div class="text-xs uppercase tracking-[0.35em] text-[#907a58]">Starting Equipment</div>
            <p class="mt-4 whitespace-pre-wrap text-lg leading-9 text-[#4f4030]">
              {{ displayValue(block.data.starting_equipment) }}
            </p>
          </div>

          <div
            v-if="hasValue(block.data?.description)"
            class="rounded-2xl border bg-[#fffaf2] p-5 md:col-span-2 xl:col-span-3"
            :style="{ borderColor: typeTheme.border }"
          >
            <div class="text-xs uppercase tracking-[0.35em] text-[#907a58]">Description</div>
            <p class="mt-4 whitespace-pre-wrap text-lg leading-9 text-[#4f4030]">
              {{ displayValue(block.data.description) }}
            </p>
          </div>
        </div>
      </section>

      <!-- Species -->
      <section
        v-else-if="block.block_key === 'species_core'"
        class="rounded-[30px] border bg-[#fbf6ee] p-6 md:p-8 shadow-[0_10px_24px_rgba(80,60,30,0.08)]"
        :style="{ borderColor: typeTheme.border }"
      >
        <div class="text-xs uppercase tracking-[0.35em] text-[#907a58]">
          {{ prettyLabel(block.block_key) }}
        </div>

        <h2 class="mt-2 text-3xl font-semibold text-[#2f2419]">
          {{ block.label || 'Species Core' }}
        </h2>

        <div class="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <div
            v-for="field in [
              ['name', block.data?.name],
              ['size', block.data?.size],
              ['speed', block.data?.speed],
              ['vision', block.data?.vision],
              ['languages', joinList(block.data?.languages)],
              ['traits', joinList(block.data?.traits)]
            ]"
            :key="field[0]"
            v-show="hasValue(field[1])"
            class="rounded-2xl border bg-[#fffaf2] p-5"
            :style="{ borderColor: typeTheme.border }"
          >
            <div class="text-xs uppercase tracking-[0.35em] text-[#907a58]">{{ prettyLabel(String(field[0])) }}</div>
            <div class="mt-3 text-lg leading-8 text-[#4f4030]">{{ field[1] }}</div>
          </div>

          <div
            v-if="hasValue(block.data?.description)"
            class="rounded-2xl border bg-[#fffaf2] p-5 md:col-span-2 xl:col-span-3"
            :style="{ borderColor: typeTheme.border }"
          >
            <div class="text-xs uppercase tracking-[0.35em] text-[#907a58]">Description</div>
            <p class="mt-4 whitespace-pre-wrap text-lg leading-9 text-[#4f4030]">
              {{ displayValue(block.data.description) }}
            </p>
          </div>
        </div>
      </section>

      <!-- Item -->
      <section
        v-else-if="block.block_key === 'item_core'"
        class="rounded-[30px] border bg-[#fbf6ee] p-6 md:p-8 shadow-[0_10px_24px_rgba(80,60,30,0.08)]"
        :style="{ borderColor: typeTheme.border }"
      >
        <div class="text-xs uppercase tracking-[0.35em] text-[#907a58]">
          {{ prettyLabel(block.block_key) }}
        </div>

        <h2 class="mt-2 text-3xl font-semibold text-[#2f2419]">
          {{ block.label || 'Item Core' }}
        </h2>

        <div class="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div
            v-for="field in [
              ['name', block.data?.name],
              ['type', block.data?.type],
              ['rarity', block.data?.rarity],
              ['value', block.data?.value],
              ['weight', block.data?.weight],
              ['damage', block.data?.damage],
              ['damage Type', block.data?.damage_type],
              ['properties', joinList(block.data?.properties)]
            ]"
            :key="field[0]"
            v-show="hasValue(field[1])"
            class="rounded-2xl border bg-[#fffaf2] p-5"
            :style="{ borderColor: typeTheme.border }"
          >
            <div class="text-xs uppercase tracking-[0.35em] text-[#907a58]">{{ field[0] }}</div>
            <div class="mt-3 text-lg leading-8 text-[#4f4030]">{{ field[1] }}</div>
          </div>

          <div
            v-if="hasValue(block.data?.description)"
            class="rounded-2xl border bg-[#fffaf2] p-5 md:col-span-2 xl:col-span-4"
            :style="{ borderColor: typeTheme.border }"
          >
            <div class="text-xs uppercase tracking-[0.35em] text-[#907a58]">Description</div>
            <p class="mt-4 whitespace-pre-wrap text-lg leading-9 text-[#4f4030]">
              {{ displayValue(block.data.description) }}
            </p>
          </div>
        </div>
      </section>

      <!-- Spell -->
      <section
        v-else-if="block.block_key === 'spell_core'"
        class="rounded-[30px] border bg-[#fbf6ee] p-6 md:p-8 shadow-[0_10px_24px_rgba(80,60,30,0.08)]"
        :style="{ borderColor: typeTheme.border }"
      >
        <div class="text-xs uppercase tracking-[0.35em] text-[#907a58]">
          {{ prettyLabel(block.block_key) }}
        </div>

        <h2 class="mt-2 text-3xl font-semibold text-[#2f2419]">
          {{ block.label || 'Spell Core' }}
        </h2>

        <div class="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div
            v-for="field in [
              ['level', block.data?.level],
              ['school', block.data?.school],
              ['casting Time', block.data?.casting_time],
              ['range', block.data?.range],
              ['duration', block.data?.duration],
              ['components', joinList(block.data?.components)],
              ['attack/save', block.data?.attack_save],
              ['damage/effect', block.data?.damage_effect]
            ]"
            :key="field[0]"
            v-show="hasValue(field[1])"
            class="rounded-2xl border bg-[#fffaf2] p-5"
            :style="{ borderColor: typeTheme.border }"
          >
            <div class="text-xs uppercase tracking-[0.35em] text-[#907a58]">{{ field[0] }}</div>
            <div class="mt-3 text-lg leading-8 text-[#4f4030]">{{ field[1] }}</div>
          </div>

          <div
            v-if="hasValue(block.data?.description)"
            class="rounded-2xl border bg-[#fffaf2] p-5 md:col-span-2 xl:col-span-4"
            :style="{ borderColor: typeTheme.border }"
          >
            <div class="text-xs uppercase tracking-[0.35em] text-[#907a58]">Description</div>
            <p class="mt-4 whitespace-pre-wrap text-lg leading-9 text-[#4f4030]">
              {{ displayValue(block.data.description) }}
            </p>
          </div>

          <div
            v-if="hasValue(block.data?.higher_level)"
            class="rounded-2xl border bg-[#fffaf2] p-5 md:col-span-2 xl:col-span-4"
            :style="{ borderColor: typeTheme.border }"
          >
            <div class="text-xs uppercase tracking-[0.35em] text-[#907a58]">At Higher Levels</div>
            <p class="mt-4 whitespace-pre-wrap text-lg leading-9 text-[#4f4030]">
              {{ displayValue(block.data.higher_level) }}
            </p>
          </div>
        </div>
      </section>

      <!-- Fallback -->
      <section
        v-else
        class="rounded-[30px] border bg-[#fbf6ee] p-6 md:p-8 shadow-[0_10px_24px_rgba(80,60,30,0.08)]"
        :style="{ borderColor: typeTheme.border }"
      >
        <div class="max-w-5xl">
          <div class="text-xs uppercase tracking-[0.35em] text-[#907a58]">
            {{ prettyLabel(block.block_key) }}
          </div>

          <h2 class="mt-2 text-3xl font-semibold text-[#2f2419]">
            {{ block.label || prettyLabel(block.block_key) }}
          </h2>
        </div>

        <div
          v-if="block.profileEntries.length"
          class="mt-8 grid gap-4 md:grid-cols-2"
        >
          <div
            v-for="[key, rawValue] in block.profileEntries"
            :key="key"
            class="rounded-2xl border bg-[#fffaf2] p-4"
            :style="{ borderColor: typeTheme.border }"
          >
            <div class="text-xs uppercase tracking-[0.35em] text-[#907a58]">
              {{ prettyLabel(key) }}
            </div>

            <div class="mt-3 text-base leading-7 text-[#4f4030]">
              {{ displayValue(rawValue) || '—' }}
            </div>
          </div>
        </div>

        <div
          v-if="block.proseEntries.length"
          class="mt-8 space-y-5"
        >
          <div
            v-for="[key, rawValue] in block.proseEntries"
            :key="key"
            class="rounded-2xl border bg-[#fffaf2] p-6"
            :style="{ borderColor: typeTheme.border }"
          >
            <div class="text-xs uppercase tracking-[0.35em] text-[#907a58]">
              {{ prettyLabel(key) }}
            </div>

            <div class="mt-4">
              <p class="whitespace-pre-wrap text-lg leading-9 text-[#4f4030]">
                {{ displayValue(rawValue) || '—' }}
              </p>
            </div>
          </div>
        </div>

        <div
          v-if="block.imageEntries.length"
          class="mt-8 space-y-5"
        >
          <div
            v-for="[key, rawValue] in block.imageEntries"
            :key="key"
            class="rounded-2xl border bg-[#fffaf2] p-5"
            :style="{ borderColor: typeTheme.border }"
          >
            <div class="text-xs uppercase tracking-[0.35em] text-[#907a58]">
              {{ prettyLabel(key) }}
            </div>

            <div class="mt-4">
              <img
                :src="String(displayValue(rawValue))"
                :alt="prettyLabel(key)"
                class="max-h-[560px] rounded-xl border border-[#e4d6bc] object-cover"
              >
            </div>
          </div>
        </div>
      </section>
    </template>

    <section
      v-if="importBlock && importEntries.length"
      class="rounded-[30px] border bg-[#f3eadc] p-6 md:p-8 shadow-[0_8px_18px_rgba(80,60,30,0.06)]"
      :style="{ borderColor: typeTheme.border }"
    >
      <div class="flex items-center justify-between gap-4">
        <div>
          <div class="text-xs uppercase tracking-[0.35em] text-[#907a58]">
            Reference Data
          </div>
          <h2 class="mt-2 text-2xl font-semibold text-[#2f2419]">
            Import Source
          </h2>
        </div>

        <div
          class="rounded-full px-3 py-1 text-xs text-[#6b5333]"
          :style="{
            border: `1px solid ${typeTheme.border}`,
            backgroundColor: typeTheme.tag
          }"
        >
          Developer / Admin
        </div>
      </div>

      <div class="mt-6 grid gap-4 md:grid-cols-2">
        <div
          v-for="[key, rawValue] in importEntries"
          :key="key"
          class="rounded-2xl border bg-[#fffaf2] p-4"
          :style="{ borderColor: typeTheme.border }"
        >
          <div class="text-xs uppercase tracking-[0.35em] text-[#907a58]">
            {{ prettyLabel(key) }}
          </div>

          <div class="mt-3 text-base leading-7 text-[#4f4030]">
            {{ displayValue(rawValue) || '—' }}
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
