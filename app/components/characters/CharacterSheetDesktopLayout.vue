<script setup lang="ts">
// CharacterSheetDesktopLayout -- the sheet body's two regions. Desktop IA
// pass (D&D Beyond reference layout), corrected by Phase H3.
//
// HISTORY, BECAUSE IT EXPLAINS THE SHAPE. This file was originally Beauty
// Pass Phase 4's THREE-column dashboard (left rail / center / right rail),
// which Corrective Phase 2R then bypassed entirely -- a second three-pane
// app nested inside Eldra's own three-pane workspace shell read as an admin
// dashboard, so the sheet was flattened to a single folio column. Neither
// extreme was right: the flat column wastes a desktop and buries reference
// data behind tabs, and the three-column version duplicated the workspace's
// own context rail.
//
// The resolution, and the reason this is two regions and not three: the
// sheet owns a reference region and a working region, and THE THIRD PANE IS
// THE WORKSPACE'S EXISTING CONTEXT DRAWER, not a rail this file renders.
// That is exactly how the reference sheet is built -- one sheet, one
// contextual drawer -- and it is why no `right` slot exists here.
//
// REGIONS
//   left    Reference: abilities, saves, defenses. >= 1280px. Hidden below
//           that, where the page renders the same content inside the
//           Character tab instead (CSS, not JS -- see
//           CharacterReferencePanels.vue for why duplicating it is safe).
//   skills  Persistent at EVERY width: its own column beside the tab body
//           at >= 1536px, stacked directly above the tab bar below that.
//           Never behind a tab -- skills are asked for constantly and are
//           not a destination.
//   center  The working surface: tab bar + active tab. The only region
//           that changes with the tab, and it gets all the spare width.
//
// H3: NEITHER REGION IS STICKY ANYMORE. The Desktop IA pass made both
// independently `sticky`/`overflow-y-auto`, each clipped to its own
// `max-height` below the command center -- so the header stayed put, the
// left region and skills stayed put, and only the tab body actually
// scrolled with the page. That reads as three separate scrolling surfaces
// stitched together, not one document, and Phase H3's own brief rejects it
// outright: "the entire sheet scrolls together... Sticky behavior should
// only exist where it genuinely improves usability." The command center
// remains the one exception (it is not this file's concern; whoever fills
// the `vitals` slot makes it sticky) -- everything below it, including
// this file's two regions, is now a normal block that scrolls with the
// page like any other content. `--sheet-command-h` (the CSS variable the
// old sticky-offset math read) has no remaining consumer and is gone from
// this file along with the measurement that produced it -- see
// CharacterSheetShell.vue's own header for that half of the fix.

const props = defineProps<{
  hasLeft?: boolean
  hasSkills?: boolean
  // True while the shared context drawer is compressing the sheet. The
  // skills column then stacks instead of splitting: at 1536px, a left rail
  // plus a skills column plus a 440px drawer would leave the tab body --
  // the region actually being worked in -- around 160px. Skills stay
  // VISIBLE either way (that is the whole point of them being persistent);
  // this only changes whether they sit beside the tab body or above it.
  drawerOpen?: boolean
}>()

const skillsSplit = computed(() => Boolean(props.hasSkills) && !props.drawerOpen)

const skillsSplitClass = computed(() =>
  skillsSplit.value ? '2xl:grid-cols-[280px_minmax(0,1fr)]' : ''
)
</script>

<template>
  <div class="grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)] 2xl:grid-cols-[320px_minmax(0,1fr)]">
    <aside
      v-if="hasLeft"
      class="hidden min-w-0 xl:block"
      aria-label="Character reference"
    >
      <slot name="left" />
    </aside>

    <div class="min-w-0">
      <div
        class="grid min-w-0 gap-4"
        :class="skillsSplitClass"
      >
        <div
          v-if="hasSkills"
          class="min-w-0"
        >
          <slot name="skills" />
        </div>

        <div class="min-w-0">
          <slot name="center" />
        </div>
      </div>
    </div>
  </div>
</template>
