// Content Compilation Fingerprint -- Developer Tooling: Package Sync Phase 1.
// See server/utils/content-sources/refresh.ts's own header (the "FUTURE
// FINGERPRINT EXTENSION POINT" note) for why this module exists: "If Rules
// Facets, the importer, or a resolver ever gain a fingerprint/hash of their
// own, the natural extension is comparing that fingerprint against one
// recorded on the previous published version's manifest... a sibling
// `compilerFingerprint` field would sit right next to it." This is exactly
// that extension, implemented rather than merely anticipated.
//
// ---------------------------------------------------------------------------
// WHY THIS EXISTS ALONGSIDE `computeContentIntegrityHash`, NOT INSTEAD OF IT
// ---------------------------------------------------------------------------
// A Content Pack's own `integrity_hash` (content-packs.ts's
// computeContentIntegrityHash) already hashes the FULLY COMPILED candidate
// array -- which already has RulesFacets baked in (5etools-collection.ts's
// attachRulesFacets runs before publish, "publication-time by construction").
// Regenerating today's candidates for a Content Source and comparing that
// hash against a bound pack's stored integrity_hash already detects BOTH:
//   - a changed raw 5etools source file (different `data`)
//   - a changed RulesFacet corpus (different `rulesFacet`, attached fresh
//     from app/lib/content-rules on every regeneration) -- this is exactly
//     the case that broke Phase 1B: the Wizard facet gained a `progression`
//     reference with no 5etools source file changing at all.
// That comparison needs no new machinery; the package sync tool performs it
// directly with the existing computeContentIntegrityHash.
//
// What that comparison CANNOT detect: a compiler/normalization change that
// happens not to alter THIS Content Source's specific compiled output today,
// but could for a different selection or a future entry -- the "did an
// UPSTREAM INPUT change" question, independent of whether it happened to
// move the needle for the currently-selected externalIds. THIS module
// answers that narrower, more conservative question by hashing the RulesFacet
// corpus and a hand-maintained compiler version directly, deliberately
// EXCLUDING raw source content (already covered by the integrity-hash
// comparison above -- duplicating it here would just be two names for the
// same signal).
//
// ---------------------------------------------------------------------------
// DETERMINISM (this task's own STALENESS/FINGERPRINT requirements)
// ---------------------------------------------------------------------------
// No timestamps, no filesystem paths, no nondeterministic ordering. Reuses
// app/lib/rules/canonicalize.ts -- the SAME recursive, key-sorted
// serialization every other integrity hash in this codebase already uses --
// rather than inventing a second canonicalization scheme. The RulesFacet
// corpus is a plain, hand-authored, statically-imported object
// (app/lib/content-rules/dnd5e-2024.ts); hashing it via canonicalize+SHA-256
// is exactly the same operation computeIntegrityHash already performs on a
// Rules Package's Definitions, applied to a different input.
//
// ---------------------------------------------------------------------------
// BACKWARD COMPATIBILITY
// ---------------------------------------------------------------------------
// Every Content Pack published before this field existed (all five
// eldra.solaris.xphb rows, 1.0.0-1.0.4) has no `manifest.origin.
// compilerFingerprint` at all. This module's caller (the package sync tool)
// treats an absent stored fingerprint as "unknown, cannot compare" and
// relies on the integrity-hash comparison alone for those packs -- it never
// treats "no stored fingerprint" as itself a staleness signal, which would
// force every pre-existing pack into REFRESH_REQUIRED on first run for a
// reason that has nothing to do with actual staleness.

import { createHash } from 'node:crypto'
import { canonicalize } from '../../../app/lib/rules/canonicalize'
import { getRulesFacetCorpus } from '../../../app/lib/content-rules'

// Bump this by hand whenever importer/adapter/normalization behavior
// changes in a way that could alter compiled candidate output -- there is
// no reliable way to auto-detect "did the compiler's OUTPUT-affecting
// behavior change" from source alone, so this is a deliberate, manual
// signal, exactly like a Rules Package author manually bumps
// manifest.json's `version` rather than having one derived automatically.
export const COMPILER_VERSION = 1

export type CompilationFingerprintInput = {
  // The Rules Vocabulary this Content Source's facets are authored against
  // (FiveEToolsCollectionInput.vocabulary) -- `undefined` for a collection
  // that declares none (SRD 5.1 today), in which case the corpus
  // contributes nothing to the hash (getRulesFacetCorpus(undefined) is
  // null), matching attachRulesFacets' own "no vocabulary -> unaffected"
  // rule.
  vocabulary: string | undefined
}

// The one function this module exports. Pure and synchronous -- reads only
// the already-imported, in-memory RulesFacet corpus, no I/O.
export function computeContentCompilationFingerprint(input: CompilationFingerprintInput): string {
  const corpus = getRulesFacetCorpus(input.vocabulary)

  const payload = {
    compilerVersion: COMPILER_VERSION,
    rulesFacetCorpus: corpus
  }

  const digest = createHash('sha256').update(canonicalize(payload)).digest('hex')
  return `sha256-${digest}`
}
