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

import CharacterProficiencyList from '~/components/characters/CharacterProficiencyList.vue'
import CharacterSaveList from '~/components/characters/CharacterSaveList.vue'
import CharacterAbilityGrid from '~/components/characters/CharacterAbilityGrid.vue'
import CharacterDerivedPanel from '~/components/characters/CharacterDerivedPanel.vue'
import type { DerivedValue } from './characterDerivedValues'
import type { CharacterAbilityRow } from './CharacterAbilityGrid.vue'
import type { CharacterSaveRow } from './CharacterSaveList.vue'

const props = withDefaults(defineProps<{
  abilityEntries?: readonly DerivedValue[]
  saveEntries?: readonly DerivedValue[]
  // One entry per Rule Category routed to this region, already selected by
  // the page from the same `derivedRegions` every other section reads.
  referenceRegions?: readonly { category: string; label: string; entries: DerivedValue[] }[]
  // Phase 4B. Values the package placed in the reference rail
  // (`presentation.sheet: 'reference'` -- passives, senses, ...), and the
  // proficiency category's entries for CharacterProficiencyList. Either
  // region is omitted when it has nothing to show.
  presentedEntries?: readonly DerivedValue[]
  proficiencyEntries?: readonly DerivedValue[]
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
  presentedEntries: () => [],
  proficiencyEntries: () => [],
  pending: false,
  unavailableMessage: '',
  rolling: false
})

const emit = defineEmits<{
  'roll-ability': [CharacterAbilityRow]
  'roll-save': [CharacterSaveRow]
}>()

const hasProficiencies = computed(() =>
  props.proficiencyEntries.some((entry) => entry.value === true && entry.label && entry.tags?.length)
)
</script>

<template>
  <!-- Phase 4B: one continuous reference column (the host supplies the
       surface) with quiet section headings -- not a stack of cards. -->
  <div class="grid gap-5">
    <p
      v-if="pending"
      class="border border-dashed border-eldra-accent/24 p-3 text-sm text-eldra-text-faint"
    >
      Evaluating this character against the World’s rules…
    </p>

    <p
      v-else-if="unavailableMessage"
      class="border border-dashed border-eldra-accent/24 p-3 text-sm text-eldra-text-faint"
    >
      {{ unavailableMessage }}
    </p>

    <template v-else>
      <section
        v-if="abilityEntries.length"
        aria-labelledby="sheet-ref-abilities"
      >
        <h3
          id="sheet-ref-abilities"
          class="eldra-sheet-heading"
        >
          Abilities
        </h3>
        <CharacterAbilityGrid
          :entries="abilityEntries"
          :rolling="rolling"
          @roll="emit('roll-ability', $event)"
        />
      </section>

      <section
        v-if="saveEntries.length"
        aria-labelledby="sheet-ref-saves"
      >
        <h3
          id="sheet-ref-saves"
          class="eldra-sheet-heading"
        >
          Saving Throws
        </h3>
        <CharacterSaveList
          :entries="saveEntries"
          :rolling="rolling"
          @roll="emit('roll-save', $event)"
        />
      </section>

      <section
        v-if="presentedEntries.length"
        aria-labelledby="sheet-ref-presented"
      >
        <h3
          id="sheet-ref-presented"
          class="eldra-sheet-heading"
        >
          Reference
        </h3>
        <CharacterDerivedPanel :entries="[...presentedEntries]" />
      </section>

      <section
        v-for="region in referenceRegions"
        :key="region.category"
        :aria-label="region.label"
      >
        <h3 class="eldra-sheet-heading">
          {{ region.label }}
        </h3>
        <CharacterDerivedPanel :entries="region.entries" />
      </section>

      <section
        v-if="hasProficiencies"
        aria-labelledby="sheet-ref-proficiencies"
      >
        <h3
          id="sheet-ref-proficiencies"
          class="eldra-sheet-heading"
        >
          Proficiencies &amp; Languages
        </h3>
        <CharacterProficiencyList :entries="proficiencyEntries" />
      </section>
    </template>
  </div>
</template>
