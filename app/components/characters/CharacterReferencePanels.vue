<script setup lang="ts">
// CharacterReferencePanels -- the sheet's reference region: abilities
// first (Header Phase H2 -- moved out of the command center, never given
// a standalone modifier card, see CharacterAbilityGrid.vue's own header),
// then saving throws, then every Rule Category the sheet routes here
// (defenses, and whatever a package declares later; proficiency bonus is
// deliberately NOT one of these -- its bespoke home is the command center's
// vitals row, see characterDerivedValues.ts's own note on why rendering it
// again here would be the duplication Header Phase H1 removed). Desktop IA
// pass (D&D Beyond reference layout), whose left column holds exactly this
// class of content: read constantly, changed almost never, never
// tab-dependent.
//
// RENDERED TWICE, ON PURPOSE, AND SAFELY. The approved layout shows this in
// a sticky left rail at >= 1280px and folds it into the Character tab below
// that. Both copies are mounted and CSS decides which is visible, rather
// than a JS breakpoint choosing where to mount -- which is only safe
// because everything in here is a READ-ONLY PROJECTION of derived values
// with no local state. The rule this does not break is the one
// CharacterSheetShell.vue's history records: Recovery/Encounter must never
// be duplicated, because two live instances of a stateful, mutating panel
// is a real correctness bug. Nothing here mutates anything, so duplicating
// costs a little DOM and buys the removal of an SSR/hydration branch.
//
// THE EMPTY SPACE IS DELIBERATE. The reference sheet this is matched
// against also shows senses, passive scores, and armour/weapon/tool/language
// training in this column. Eldra's Rules Package declares none of those
// (character-sheet-beauty-pass.md §1.8b), so they render as nothing at all
// rather than as invented values -- §3.3's "reserved, self-hiding slots".
// The day a package declares a `senses` (or any other) category, adding it
// to REFERENCE_CATEGORIES in characterDerivedValues.ts is the entire change
// needed for it to appear here, correctly grouped and labelled.

import CharacterSheetSection from '~/components/characters/CharacterSheetSection.vue'
import CharacterSaveList from '~/components/characters/CharacterSaveList.vue'
import CharacterAbilityGrid from '~/components/characters/CharacterAbilityGrid.vue'
import CharacterDerivedPanel from '~/components/characters/CharacterDerivedPanel.vue'
import type { DerivedValue } from './characterDerivedValues'
import type { CharacterAbilityRow } from './CharacterAbilityGrid.vue'
import type { CharacterSaveRow } from './CharacterSaveList.vue'

withDefaults(defineProps<{
  abilityEntries?: readonly DerivedValue[]
  saveEntries?: readonly DerivedValue[]
  // One entry per Rule Category routed to this region, already selected by
  // the page from the same `derivedRegions` every other section reads.
  referenceRegions?: readonly { category: string; label: string; entries: DerivedValue[] }[]
  // Rendered only while derived values are still being evaluated; the page
  // owns the distinction between "loading" and "unavailable".
  pending?: boolean
  unavailableMessage?: string
  // Eldra Roll System Phase 2 -- disables both rollable lists' buttons
  // while a roll this page requested is in flight, matching
  // useWorldRolls.ts's own `pending` state. This region has no roll state
  // of its own; it only relays the page's.
  rolling?: boolean
}>(), {
  abilityEntries: () => [],
  saveEntries: () => [],
  referenceRegions: () => [],
  pending: false,
  unavailableMessage: '',
  rolling: false
})

const emit = defineEmits<{
  'roll-ability': [CharacterAbilityRow]
  'roll-save': [CharacterSaveRow]
}>()
</script>

<template>
  <div class="grid gap-4">
    <p
      v-if="pending"
      class="rounded-none border border-dashed border-[rgba(201,164,90,0.24)] p-3 text-sm text-[#9f9278]"
    >
      Evaluating this character against the World’s rules…
    </p>

    <p
      v-else-if="unavailableMessage"
      class="rounded-none border border-dashed border-[rgba(201,164,90,0.24)] p-3 text-sm text-[#9f9278]"
    >
      {{ unavailableMessage }}
    </p>

    <template v-else>
      <!-- Abilities lead the reference region (Header Phase H2) -- read
           constantly, changed almost never, exactly the profile this
           region exists for. Score and modifier always paired; see
           CharacterAbilityGrid.vue's own header for why no standalone
           modifier card is ever rendered. -->
      <CharacterSheetSection
        v-if="abilityEntries.length"
        heading="Abilities"
        density="compact"
      >
        <div class="mt-3">
          <CharacterAbilityGrid
            :entries="abilityEntries"
            :rolling="rolling"
            @roll="emit('roll-ability', $event)"
          />
        </div>
      </CharacterSheetSection>

      <CharacterSheetSection
        v-if="saveEntries.length"
        heading="Saving Throws"
        density="compact"
      >
        <div class="mt-3">
          <CharacterSaveList
            :entries="saveEntries"
            :rolling="rolling"
            @roll="emit('roll-save', $event)"
          />
        </div>
      </CharacterSheetSection>

      <CharacterSheetSection
        v-for="region in referenceRegions"
        :key="region.category"
        :heading="region.label"
        density="compact"
      >
        <div class="mt-3">
          <CharacterDerivedPanel :entries="region.entries" />
        </div>
      </CharacterSheetSection>
    </template>
  </div>
</template>
