// Shared "Add Item"/"Add Spell" picker search -- Character Sheet
// Inventory bug-fix pass. Extracted out of CharacterInventoryPanel.vue and
// CharacterSpellcastingPanel.vue, which held two byte-for-byte identical
// copies of this logic (`optionKey` and the search filter), so the actual
// query/filter behavior -- the client half of the client -> API ->
// world-content-catalogue path the "Search Published Items" bug was
// traced through -- is exercised by a real, named test rather than only
// by eyeballing two inline `<script setup>` computeds.
//
// Pure: no Vue, no I/O. Both panels still own their own `<select>`
// markup, their own add-form state, and their own loading/empty-state
// messaging -- only the SEARCH DECISION moved here.

// Structural, not imported from world-content-catalogue.ts: both panels
// already declare their own local version of this shape (narrower than
// the full ContentCatalogueEntry a World's catalogue response carries),
// and this module has no reason to depend on the server-side type either.
export type CatalogueOptionRef = {
  packageId: string
  slug: string
  // Deliberately `unknown`, not `string` -- see searchCatalogueOptions's
  // own header for why a malformed entry's title must not be ASSUMED to
  // be a string before it is actually checked.
  title: unknown
  sourceBook?: string
}

// Composite (packageId::slug) key, never a bare slug -- two bound Content
// Packs can publish the same slug (e.g. two different packs each
// shipping their own "longsword"), so the slug alone is not a safe
// dedup/selection key.
export function catalogueOptionKey(option: Pick<CatalogueOptionRef, 'packageId' | 'slug'>): string {
  return `${option.packageId}::${option.slug}`
}

// A blank search returns the first `limit` options unfiltered (so opening
// the picker with nothing typed yet still shows something to browse);
// a real term matches a case-insensitive SUBSTRING of the title, capped
// at the same `limit`.
//
// DEFENSIVE: a single catalogue entry with a non-string/missing `title`
// (malformed content, a bad import, a future content source this app
// does not fully trust yet) used to THROW inside the underlying
// `.filter()` the moment a search term was typed, which failed the
// WHOLE computed -- every option disappeared from the search, not just
// the one bad entry -- while the untyped/blank state kept working fine
// (it never reaches `.toLowerCase()` at all). That is the exact
// asymmetry the reported bug describes: a search that "returns no
// items" specifically once you start typing. This mirrors the same "one
// bad entry must never take down the whole list" rule
// server/utils/world-content-catalogue.ts already applies server-side
// to presentation/actions/mechanics resolution, applied here to the one
// place a picker reads a catalogue field without going through that
// module's own guards.
export function searchCatalogueOptions<T extends CatalogueOptionRef>(
  options: readonly T[],
  term: string,
  limit = 100
): T[] {
  const trimmed = term.trim().toLowerCase()

  if (!trimmed) return options.slice(0, limit)

  return options
    .filter((option) => typeof option.title === 'string' && option.title.toLowerCase().includes(trimmed))
    .slice(0, limit)
}
