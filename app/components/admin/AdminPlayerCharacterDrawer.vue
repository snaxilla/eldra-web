<script setup lang="ts">
// Game Admin -- Player Management's "Account & Deletion" detail surface.
//
// PLAYER MANAGEMENT PRESENTATION FIX: this content used to render inline,
// expanding inside whichever roster card it belonged to -- correct in
// isolation, but it made that one card taller than its neighbors, which
// bent the `md:grid-cols-2 2xl:grid-cols-3` roster grid every time it
// opened. Moved into a dedicated drawer, the SAME shell convention
// SheetItemDetailDrawer.vue / SheetNoteDetailDrawer.vue already establish
// for the Character Sheet (a single instance mounted OUTSIDE the list it
// describes, `v-if` on a nullable "which one is selected" prop, a fixed
// right-edge panel over a dismiss-by-tap backdrop) -- not a new pattern,
// and not an extension of the generic WorldEntityContextDrawer.vue, which
// has its own, much broader job (mentions/relationships/map-pin context
// across the whole World) this content has nothing to do with.
//
// STILL NO MUTATION HERE. Both sections below describe genuine, traced
// architecture gaps (see admin.vue's own header comment on
// `managingEntity` for the full reasoning) -- this component only renders
// that explanation; it has no account-search widget and no delete
// endpoint to call, because neither exists yet.

const props = defineProps<{
  entity?: any | null
  entityId: (entity: any) => string
  entityTitle: (entity: any) => string
  entityTypeLabel: (entity: any) => string
}>()

const emit = defineEmits<{
  (event: 'close'): void
}>()

const title = computed(() => (props.entity ? props.entityTitle(props.entity) : ''))
const typeLabel = computed(() => (props.entity ? props.entityTypeLabel(props.entity) : ''))
</script>

<template>
  <Transition
    enter-from-class="translate-x-full opacity-0"
    enter-active-class="transition duration-200"
    leave-to-class="translate-x-full opacity-0"
    leave-active-class="transition duration-200"
  >
    <div
      v-if="entity"
      class="fixed inset-0 z-[140] bg-black/60 backdrop-blur-sm md:pointer-events-none md:bg-transparent md:backdrop-blur-none"
      @click.self="emit('close')"
    >
      <aside
        class="eldra-ornate-panel eldra-frame-corners fixed bottom-0 right-0 top-0 flex h-full w-full max-w-[440px] flex-col border-l backdrop-blur-xl md:pointer-events-auto"
        role="dialog"
        aria-modal="true"
        :aria-label="`Account and deletion for ${title}`"
      >
        <div class="flex items-start justify-between gap-3 border-b border-[rgba(201,164,90,0.22)] px-5 py-4">
          <div class="min-w-0">
            <div class="text-xs uppercase tracking-[0.35em] text-[#9f9278]">
              Account &amp; Deletion
            </div>
            <h2 class="mt-2 truncate text-2xl font-semibold text-white">
              {{ title }}
            </h2>
            <div class="mt-1 text-xs text-[#9f9278]">
              {{ typeLabel }}
            </div>
          </div>

          <button
            type="button"
            class="rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(20,17,12,0.72)] p-2 text-[#b5a88d] transition hover:bg-[rgba(201,164,90,0.10)] hover:text-[#fff7df]"
            @click="emit('close')"
          >
            <UIcon name="i-lucide-x" class="h-4 w-4" />
          </button>
        </div>

        <div class="flex-1 overflow-y-auto px-5 py-5">
          <div class="grid gap-4">
            <div class="rounded-none border border-dashed border-[rgba(201,164,90,0.28)] bg-[rgba(20,17,12,0.55)] p-4">
              <div class="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#9f9278]">
                Account Owner
              </div>
              <p class="mt-2 text-sm leading-6 text-[#d8ceb8]">
                Not tracked yet. Eldra's World Membership model (Owner/GM/Worldbuilder/Player/Observer)
                does not currently record which player account, if any, owns this specific character --
                there is no owner column on this World's characters to assign. Changing that is a schema
                decision (adding an account reference to characters) that needs explicit approval before
                it is made, per this World's own architecture notes.
              </p>
              <button
                type="button"
                disabled
                class="mt-3 cursor-not-allowed rounded-none border border-[rgba(201,164,90,0.18)] px-3 py-2 text-xs font-semibold text-[#6f6754]"
              >
                Change Owner (unavailable)
              </button>
            </div>

            <div class="rounded-none border border-dashed border-red-500/25 bg-[rgba(20,17,12,0.55)] p-4">
              <div class="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#9f9278]">
                Delete Character
              </div>
              <p class="mt-2 text-sm leading-6 text-[#d8ceb8]">
                Not available yet. Deleting {{ title }} today would remove only this character's own
                article record -- its character sheet, inventory/transfer history, and any relationships
                to other characters are stored under a separate id with no enforced link back to it, so
                they would be silently left behind rather than cleaned up. Safe deletion needs that
                cleanup implemented and verified first.
              </p>
              <button
                type="button"
                disabled
                class="mt-3 cursor-not-allowed rounded-none border border-red-500/20 px-3 py-2 text-xs font-semibold text-red-300/50"
              >
                Delete Character (unavailable)
              </button>
            </div>
          </div>
        </div>

        <div class="border-t border-[rgba(201,164,90,0.22)] p-5">
          <button
            type="button"
            class="flex-1 eldra-button w-full rounded-none px-4 py-3 text-sm font-medium"
            @click="emit('close')"
          >
            Close
          </button>
        </div>
      </aside>
    </div>
  </Transition>
</template>
