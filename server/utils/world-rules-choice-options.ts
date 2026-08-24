// What a World's active Rules Package needs to RENDER a ChoiceSet.
//
// The Character Builder faces a problem the Character Sheet does not: it
// must present a choice for a character that does not exist yet, so there is
// no assembly and no derived projection to read labels from. It has the
// facet (from the Content Catalogue, which already relays `rulesFacet`), so
// it knows WHICH options are offered and HOW MANY to pick. What it lacks is
// the human-readable half: the ChoiceSet's prompt, and a label per option.
//
// This module supplies exactly that, and nothing else. It is deliberately
// NOT character-scoped -- the answer is identical for every character in a
// World, because it depends only on which package is active.
//
// ---------------------------------------------------------------------------
// WHY THE LABELS COME FROM HERE AND NOT FROM THE BUILDER
// ---------------------------------------------------------------------------
// A Definition id is not a label. Turning `value:skill.animal_handling.proficient`
// into "Animal Handling" in a Vue file would mean a Vue file knowing how this
// game names things -- a string split, a title-case, and a game vocabulary
// leaking into the presentation layer. The package already declares the
// label ("Animal Handling Proficiency"); this reads it.
//
// It returns labels for VALUE definitions only, which is every id a facet's
// `from` list can currently name. A `from` naming something else would
// simply have no label and render by id -- visible degradation, not a crash.

import { getWorldRuntime } from './world-runtime-service'

export type ChoiceSetPresentation = {
  id: string
  prompt: string
  label?: string
}

export type WorldRulesChoiceOptions =
  | {
      available: true
      packageId: string
      packageVersion: string
      choiceSets: Record<string, ChoiceSetPresentation>
      // Definition id -> label, for every value the active package declares.
      // A flat map rather than per-ChoiceSet lists because a ChoiceSet using
      // the `fromContentFacet` selector does not know its own options --
      // only the content does.
      optionLabels: Record<string, string>
    }
  // Unconfigured or broken. Both collapse to "no choices to render" HERE,
  // deliberately: this endpoint feeds a Builder that must stay usable for a
  // World with no Rules Package at all. The distinction between the two
  // states is preserved where it matters -- the Rules admin panel and the
  // derived projection both report it -- and re-reporting it in a
  // character-creation surface would put a package diagnostic in front of a
  // player who cannot act on it.
  | { available: false }

export async function getWorldRulesChoiceOptions(
  worldId: string | number
): Promise<WorldRulesChoiceOptions> {
  const runtime = await getWorldRuntime(worldId)

  if (!runtime.configured || !runtime.ok) {
    return { available: false }
  }

  const { registry, packageId, packageVersion } = runtime.runtime

  const choiceSets: Record<string, ChoiceSetPresentation> = {}
  const optionLabels: Record<string, string> = {}

  for (const definition of registry.listAll()) {
    if (definition.kind === 'choiceSet') {
      choiceSets[definition.id] = {
        id: definition.id,
        prompt: definition.prompt,
        label: definition.label
      }
      continue
    }

    if (definition.kind === 'value' && definition.label) {
      optionLabels[definition.id] = definition.label
    }
  }

  return { available: true, packageId, packageVersion, choiceSets, optionLabels }
}
