<script setup lang="ts">
const props = withDefaults(defineProps<{
  worldId: string | number
  sheet?: any
  resolvedClass?: any
  currentClassFeatureCards?: any[]
  upcomingClassFeatureCards?: any[]
  resolvedSubclassName?: string
  resolvedSubclassOption?: any
  resolvedSubclassDescription?: string
  resolvedSubclassFeatureCards?: any[]
  currentLevelNumber?: number | string
  resolvedSpecies?: any
  speciesTraitCards?: any[]
  resolvedBackground?: any
  backgroundFeatureCard?: any
  featurePanelOpen?: (key: string) => boolean
  featurePanelChevron?: (key: string) => string
  subclassFeatureCardOpen?: (scope: string, feature: any, index: number) => boolean
  subclassFeatureCardChevron?: (scope: string, feature: any, index: number) => string
  shortText?: (value: any, limit?: number) => string
}>(), {
  currentClassFeatureCards: () => [],
  upcomingClassFeatureCards: () => [],
  resolvedSubclassName: '',
  resolvedSubclassDescription: '',
  resolvedSubclassFeatureCards: () => [],
  currentLevelNumber: 1,
  speciesTraitCards: () => []
})

const emit = defineEmits<{
  (event: 'toggle-feature-panel', key: string): void
  (event: 'toggle-subclass-feature-card', payload: { scope: string; feature: any; index: number }): void
  (event: 'open-feature', feature: any): void
}>()

function panelOpen(key: string) {
  return props.featurePanelOpen?.(key) ?? true
}

function panelChevron(key: string) {
  return props.featurePanelChevron?.(key) || (panelOpen(key) ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down')
}

function short(value: any, limit = 180) {
  if (props.shortText) return props.shortText(value, limit)

  const text = String(value || '').replace(/\s+/g, ' ').trim()
  return text.length > limit ? `${text.slice(0, limit).trim()}...` : text
}

function subclassOpen(feature: any, index: number) {
  return props.subclassFeatureCardOpen?.('sheet', feature, index) ?? false
}

function subclassChevron(feature: any, index: number) {
  return props.subclassFeatureCardChevron?.('sheet', feature, index) ||
    (subclassOpen(feature, index) ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down')
}

function toggleSubclassFeature(feature: any, index: number) {
  emit('toggle-subclass-feature-card', {
    scope: 'sheet',
    feature,
    index
  })
}

function openFeature(feature: any) {
  emit('open-feature', feature)
}

function isFutureSubclassFeature(feature: any) {
  return Number(feature?.level || 0) > Number(props.currentLevelNumber || 1)
}
</script>

<template>
  <section class="mt-0 grid gap-3 md:mt-6">
    <div class="eldra-codex-soft rounded-none p-4">
      <button
        type="button"
        class="flex w-full items-center justify-between gap-3 text-left"
        @click="emit('toggle-feature-panel', 'class')"
      >
        <div>
          <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">Class Features</div>
          <div class="mt-1 text-sm text-[#d8ceb8]">{{ resolvedClass?.title || 'No linked class' }}</div>
        </div>

        <div class="flex items-center gap-2">
          <div class="eldra-gold-chip rounded-none border px-3 py-1 text-xs">
            {{ currentClassFeatureCards.length }} Active
          </div>
          <UIcon :name="panelChevron('class')" class="h-4 w-4 text-[#9f9278]" />
        </div>
      </button>

      <div
        v-show="panelOpen('class')"
        class="mt-4 grid min-w-0 gap-2 md:grid-cols-2 xl:grid-cols-3"
      >
        <article
          v-for="feature in currentClassFeatureCards"
          :key="`class-feature-${feature.id}`"
          class="min-w-0 overflow-hidden rounded-none border border-[rgba(65,82,103,0.62)] bg-[rgba(8,17,27,0.68)] p-3"
        >
          <div class="flex min-w-0 items-start justify-between gap-3">
            <div class="min-w-0">
              <div class="max-w-full truncate font-semibold text-white">{{ feature.title }}</div>
              <div class="mt-1 text-xs text-[#9f9278]">
                Level {{ feature.level || 1 }}<span v-if="feature.source"> · {{ feature.source }}</span>
              </div>
            </div>

            <button
              type="button"
              class="shrink-0 rounded-none border border-[rgba(201,164,90,0.22)] bg-[rgba(20,17,12,0.72)] px-2 py-1 text-xs text-[#f5e7bd]"
              @click.stop="openFeature(feature)"
            >
              Details
            </button>
          </div>

          <p class="mt-3 break-words text-xs leading-5 text-[#9f9278]">
            {{ short(feature.description, 180) || 'No imported description found yet.' }}
          </p>
        </article>

        <div
          v-if="!currentClassFeatureCards.length"
          class="rounded-none border border-dashed border-[rgba(201,164,90,0.22)] p-4 text-sm text-[#9f9278] md:col-span-2 xl:col-span-3"
        >
          No active class features resolved yet.
        </div>
      </div>
    </div>

    <div
      v-if="upcomingClassFeatureCards.length"
      class="eldra-codex-soft rounded-none p-4"
    >
      <button
        type="button"
        class="flex w-full items-center justify-between gap-3 text-left"
        @click="emit('toggle-feature-panel', 'upcoming')"
      >
        <div>
          <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">Upcoming Class Features</div>
          <div class="mt-1 text-sm text-[#d8ceb8]">Features unlocked at later levels.</div>
        </div>

        <div class="flex items-center gap-2">
          <div class="eldra-gold-chip rounded-none border px-3 py-1 text-xs">
            {{ upcomingClassFeatureCards.length }} Future
          </div>
          <UIcon :name="panelChevron('upcoming')" class="h-4 w-4 text-[#9f9278]" />
        </div>
      </button>

      <div
        v-show="panelOpen('upcoming')"
        class="mt-4 grid min-w-0 gap-2 md:grid-cols-2 xl:grid-cols-3"
      >
        <article
          v-for="feature in upcomingClassFeatureCards"
          :key="`upcoming-feature-${feature.id}`"
          class="min-w-0 overflow-hidden rounded-none border border-[rgba(65,82,103,0.50)] bg-[rgba(8,17,27,0.48)] p-3 opacity-80"
        >
          <div class="flex min-w-0 items-start justify-between gap-3">
            <div class="min-w-0">
              <div class="max-w-full truncate font-semibold text-white">{{ feature.title }}</div>
              <div class="mt-1 text-xs text-[#9f9278]">
                Level {{ feature.level }}<span v-if="feature.source"> · {{ feature.source }}</span>
              </div>
            </div>

            <button
              type="button"
              class="shrink-0 rounded-none border border-[rgba(201,164,90,0.22)] bg-[rgba(20,17,12,0.72)] px-2 py-1 text-xs text-[#f5e7bd]"
              @click.stop="openFeature(feature)"
            >
              Details
            </button>
          </div>
        </article>
      </div>
    </div>

    <div
      v-if="resolvedSubclassName"
      class="eldra-codex-soft rounded-none p-4"
    >
      <button
        type="button"
        class="flex w-full items-center justify-between gap-3 text-left"
        @click="emit('toggle-feature-panel', 'subclass')"
      >
        <div class="min-w-0">
          <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">Subclass / Path</div>
          <div class="mt-1 truncate text-sm text-[#d8ceb8]">{{ resolvedSubclassName }}</div>
        </div>

        <div class="flex items-center gap-2">
          <div class="eldra-gold-chip rounded-none border px-3 py-1 text-xs">
            {{ resolvedSubclassFeatureCards.length }} Feature{{ resolvedSubclassFeatureCards.length === 1 ? '' : 's' }}
          </div>
          <UIcon :name="panelChevron('subclass')" class="h-4 w-4 text-[#9f9278]" />
        </div>
      </button>

      <div
        v-show="panelOpen('subclass')"
        class="mt-4"
      >
        <div
          v-if="resolvedSubclassOption"
          class="mb-3 rounded-none border border-[rgba(201,164,90,0.18)] bg-[rgba(20,17,12,0.42)] p-3"
        >
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <div class="truncate font-semibold text-white">
                {{ resolvedSubclassOption.name || resolvedSubclassOption.title || resolvedSubclassName }}
              </div>
              <div class="mt-1 text-xs text-[#9f9278]">
                <span v-if="resolvedSubclassOption.source">{{ resolvedSubclassOption.source }}</span>
                <span v-if="resolvedSubclassOption.page"> · p. {{ resolvedSubclassOption.page }}</span>
              </div>
            </div>

            <div
              v-if="resolvedSubclassOption.recommended"
              class="eldra-gold-chip shrink-0 rounded-none border px-2 py-0.5 text-[10px]"
            >
              Recommended
            </div>
          </div>

          <p
            v-if="resolvedSubclassDescription"
            class="mt-3 whitespace-pre-line break-words text-xs leading-5 text-[#d8ceb8]"
          >
            {{ resolvedSubclassDescription }}
          </p>
        </div>

        <div
          v-if="resolvedSubclassFeatureCards.length"
          class="grid gap-2"
        >
          <article
            v-for="(feature, index) in resolvedSubclassFeatureCards"
            :key="`sheet-subclass-feature-${feature.title}-${feature.level}-${index}`"
            class="min-w-0 overflow-hidden rounded-none border border-[rgba(65,82,103,0.62)] bg-[rgba(8,17,27,0.68)] p-3"
            :class="isFutureSubclassFeature(feature) ? 'opacity-70' : ''"
          >
            <button
              type="button"
              class="flex w-full items-start justify-between gap-3 text-left"
              @click="toggleSubclassFeature(feature, index)"
            >
              <div class="min-w-0">
                <div class="truncate font-semibold text-white">{{ feature.title }}</div>
                <div class="mt-1 text-xs text-[#9f9278]">
                  Level {{ feature.level || '—' }}<span v-if="feature.source"> · {{ feature.source }}</span>
                  <span v-if="isFutureSubclassFeature(feature)"> · Future</span>
                </div>
              </div>

              <UIcon :name="subclassChevron(feature, index)" class="h-4 w-4 shrink-0 text-[#9f9278]" />
            </button>

            <div
              v-show="subclassOpen(feature, index)"
              class="mt-3 border-t border-[rgba(201,164,90,0.14)] pt-3"
            >
              <p
                v-if="feature.description"
                class="whitespace-pre-line break-words text-xs leading-5 text-[#9f9278]"
              >
                {{ feature.description }}
              </p>

              <div
                v-else
                class="rounded-none border border-dashed border-[rgba(201,164,90,0.22)] p-3 text-xs text-[#9f9278]"
              >
                No description resolved for this subclass feature yet.
              </div>
            </div>
          </article>
        </div>

        <div
          v-else
          class="rounded-none border border-dashed border-[rgba(201,164,90,0.22)] p-4 text-sm text-[#9f9278]"
        >
          This character has a subclass/path saved, but no subclass feature details were resolved yet.
        </div>
      </div>
    </div>

    <div class="eldra-codex-soft rounded-none p-4">
      <button
        type="button"
        class="flex w-full items-center justify-between gap-3 text-left"
        @click="emit('toggle-feature-panel', 'species')"
      >
        <div>
          <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">Species Traits</div>
          <div class="mt-1 text-sm text-[#d8ceb8]">{{ resolvedSpecies?.title || 'No linked species' }}</div>
        </div>

        <div class="flex items-center gap-2">
          <div class="eldra-gold-chip rounded-none border px-3 py-1 text-xs">
            {{ speciesTraitCards.length }} Trait{{ speciesTraitCards.length === 1 ? '' : 's' }}
          </div>
          <UIcon :name="panelChevron('species')" class="h-4 w-4 text-[#9f9278]" />
        </div>
      </button>

      <div
        v-show="panelOpen('species')"
        class="mt-4 grid min-w-0 gap-2 md:grid-cols-2 xl:grid-cols-3"
      >
        <article
          v-for="trait in speciesTraitCards"
          :key="trait.id"
          class="min-w-0 overflow-hidden rounded-none border border-[rgba(65,82,103,0.62)] bg-[rgba(8,17,27,0.68)] p-3"
        >
          <div class="flex min-w-0 items-start justify-between gap-3">
            <div class="min-w-0">
              <div class="max-w-full truncate font-semibold text-white">{{ trait.title }}</div>
              <div class="mt-1 text-xs text-[#9f9278]">{{ trait.type }}</div>
            </div>

            <button
              type="button"
              class="shrink-0 rounded-none border border-[rgba(201,164,90,0.22)] bg-[rgba(20,17,12,0.72)] px-2 py-1 text-xs text-[#f5e7bd]"
              @click.stop="openFeature(trait)"
            >
              Details
            </button>
          </div>

          <p class="mt-3 break-words text-xs leading-5 text-[#9f9278]">
            {{ short(trait.description, 180) }}
          </p>
        </article>
      </div>
    </div>

    <div
      v-if="backgroundFeatureCard"
      class="eldra-codex-soft rounded-none p-4"
    >
      <button
        type="button"
        class="flex w-full items-center justify-between gap-3 text-left"
        @click="emit('toggle-feature-panel', 'background')"
      >
        <div>
          <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">Background Feature</div>
          <div class="mt-1 text-sm text-[#d8ceb8]">{{ resolvedBackground?.title || 'No linked background' }}</div>
        </div>

        <UIcon :name="panelChevron('background')" class="h-4 w-4 text-[#9f9278]" />
      </button>

      <article
        v-show="panelOpen('background')"
        class="mt-4 min-w-0 overflow-hidden rounded-none border border-[rgba(65,82,103,0.62)] bg-[rgba(8,17,27,0.68)] p-3"
      >
        <div class="flex min-w-0 items-start justify-between gap-3">
          <div>
            <div class="font-semibold text-white">{{ backgroundFeatureCard.title }}</div>
            <div class="mt-1 text-xs text-[#9f9278]">Background Feature</div>
          </div>

          <button
            type="button"
            class="shrink-0 rounded-none border border-[rgba(201,164,90,0.22)] bg-[rgba(20,17,12,0.72)] px-2 py-1 text-xs text-[#f5e7bd]"
            @click.stop="openFeature(backgroundFeatureCard)"
          >
            Details
          </button>
        </div>

        <p class="mt-3 break-words text-xs leading-5 text-[#9f9278]">
          {{ short(backgroundFeatureCard.description, 220) }}
        </p>
      </article>
    </div>

    <CharactersSheetSelectedFeats
      :world-id="worldId"
      :sheet="sheet"
    />
  </section>
</template>
