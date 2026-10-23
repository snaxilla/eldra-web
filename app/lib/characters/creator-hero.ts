// Character Creator V3 -- what the cinematic hero shows about the selected
// content. Pure: it only REARRANGES a resolved PresentationEntry (the same
// model the Character Sheet renders) into "what is this / what do I get"
// highlights. It interprets no rule and invents no text; anything it cannot
// find simply yields fewer highlights.

import type { PresentationEntry, PresentationFact } from '~/lib/content-presentation'

export type CreatorHeroHighlights = {
  // The first descriptive paragraph, i.e. "what is this?".
  summary: string | null
  // Named things the choice gives the player (species traits, level-1 class
  // features, background features), i.e. "what does it give me?".
  traits: string[]
  // The first few mechanical facts (Hit Die, Size, Speed, ...), in the order
  // the Content Pack's own presentation resolver already ranked them.
  facts: PresentationFact[]
}

const MAX_TRAITS = 6
const MAX_FACTS = 4

// Sections that are reference text rather than something the choice grants.
const NON_GRANT_SECTION = /^(class features|starting equipment|multiclassing|equipment)/i

// "Level 1: Martial Arts, Unarmored Defense" -> ['Martial Arts', 'Unarmored Defense']
function levelOneFeatures(entry: PresentationEntry): string[] {
  const section = entry.sections.find((candidate) => /^class features/i.test(candidate.title))
  const line = section?.paragraphs.find((paragraph) => /^level\s+1\s*:/i.test(paragraph.trim()))
  if (!line) return []
  return line
    .replace(/^level\s+1\s*:/i, '')
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean)
}

export function heroHighlights(entry: PresentationEntry | null | undefined): CreatorHeroHighlights {
  if (!entry) return { summary: null, traits: [], facts: [] }

  const named = entry.kind === 'class'
    ? levelOneFeatures(entry)
    : entry.sections.map((section) => section.title.trim()).filter((title) => title && !NON_GRANT_SECTION.test(title))

  const seen = new Set<string>()
  const traits = named.filter((name) => {
    const key = name.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  }).slice(0, MAX_TRAITS)

  return {
    summary: entry.description.find((paragraph) => paragraph.trim())?.trim() ?? null,
    traits,
    facts: entry.facts.filter((fact) => fact.value.trim()).slice(0, MAX_FACTS)
  }
}
