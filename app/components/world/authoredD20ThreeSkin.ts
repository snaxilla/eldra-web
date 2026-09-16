// authoredD20ThreeSkin -- the renderer-owned appearance abstraction for
// the authored Three.js d20. Roll System Phase 4B.2 (Authored d20 Visual
// Polish + Skin-Ready Material Architecture), implementing ADR-024
// (.github/docs/architecture/adr-024-authored-dice-presentation.md) §11
// ("Skins/themes: Best. CSS custom properties... a skin is a stylesheet"
// generalized here to Option 2's own material system) and this phase's
// own SKIN-READY ARCHITECTURE section.
//
// ---------------------------------------------------------------------------
// THE BOUNDARY THIS FILE EXISTS TO DRAW (this phase's own IMPORTANT SKIN
// RULE, restated as a file-level fact)
// ---------------------------------------------------------------------------
//   Geometry (authoredD20ThreeOrientation.ts's own vertex/face data,
//     WorldAuthoredThreeDiceRenderer.client.vue's own `buildGeometry`)
//     owns SHAPE.
//   THIS FILE owns APPEARANCE -- color, roughness, metalness, emissive
//     glow, numeral treatment, optional texture maps.
//   Choreography (authoredD20ThreeChoreography.ts) owns MOTION.
//   RollEventRecord (via worldAuthoredThreeDiceRendererAdapter.ts's own
//     `extractSingleD20Face`) owns TRUTH -- the face value itself.
// A `DiceSkin` below can change EVERY value this file exports without
// touching any of the other three concerns, and none of the other three
// concerns can be reached FROM a `DiceSkin` -- there is no field here for
// "which face," "how long," or "where." This is what makes a future skin
// swappable without risk to correctness: it is, structurally, incapable
// of influencing the roll result, the target quaternion, or timing,
// because those live in files this one does not import from and is never
// imported by for those purposes.
//
// ---------------------------------------------------------------------------
// WHY "DiceSkin" (naming) -- matches this phase's own vocabulary
// ("Dice Skin / Dice Workshop feature", "future DiceSkin") and ADR-024
// §11/§12's own "skins are a stylesheet" framing, rather than inventing a
// parallel term. `D20` is left out of the type name (unlike this
// renderer's own `authoredD20Three*` module family) because appearance --
// unlike orientation math, which is genuinely d20-specific geometry -- is
// the one concern of the four above that should read naturally as
// reusable once Phase 4C adds other die types; nothing about `DiceSkin`'s
// own shape assumes 20 faces.
//
// ---------------------------------------------------------------------------
// THIS FILE HAS NO THREE.JS IMPORT, DELIBERATELY
// ---------------------------------------------------------------------------
// A `DiceSkin` is plain, serializable-shaped data (strings, numbers, and
// small callbacks) -- never a `THREE.Material`, `THREE.Texture`, or
// anything else that requires a live WebGL context to exist. This is what
// makes `ELDRA_DEFAULT_D20_SKIN` and `resolveDiceSkin` testable in this
// repo's plain-Node Vitest environment (no DOM, no WebGL) with zero
// mocking -- and, longer term, what would let a skin descriptor be
// authored, validated, or even stored as ordinary JSON if a future phase
// ever needs that (this file takes no position on whether it will; it
// only avoids ruling it out by accident). Turning a `DiceSkin` into real
// `THREE.MeshStandardMaterial`/`THREE.CanvasTexture` instances is
// WorldAuthoredThreeDiceRenderer.client.vue's own job (`buildMaterials`,
// `createFaceTexture`) -- exactly the same "renderer-specific types never
// cross the boundary" discipline ~/lib/dice-presentation/renderer.ts
// already established for the Dice Presentation Layer as a whole, applied
// one layer further in.
//
// ---------------------------------------------------------------------------
// CUSTOM TEXTURE SUPPORT -- THE SEAM, VERIFIED AGAINST THREE@0.143.0'S OWN
// SOURCE, NOT GUESSED
// ---------------------------------------------------------------------------
// `DiceTextureSource` below is the ONE new concept this phase adds beyond
// plain color/scalar values, and it is intentionally small: a texture is
// either
//   - `{ kind: 'canvas', draw }` -- a synchronous callback that paints
//     directly onto a 2D canvas context the renderer already owns
//     (exactly how this file's own numeral rendering already works, and
//     how WorldDiceAnimation.vue's placeholder icon already works
//     elsewhere in this codebase), or
//   - `{ kind: 'url', url }` -- a real external image, for a future skin
//     that supplies actual artwork rather than procedural drawing.
// The renderer resolves EITHER kind into a real `THREE.Texture` via one
// function (`resolveAuxTexture` in WorldAuthoredThreeDiceRenderer
// .client.vue) that a future die type or future skin reuses unchanged.
// Verified directly from three@0.143.0's own shipped source (not
// assumed): `MeshStandardMaterial` (src/materials/MeshStandardMaterial.js)
// declares exactly `map`, `normalMap`, `roughnessMap`, `metalnessMap`,
// `emissiveMap` (plus `emissive`/`emissiveIntensity`, `bumpMap`/
// `bumpScale`, `aoMap`, none of which this phase wires up -- see "why not
// every field" below) as real, present properties in this installed
// version; `THREE.TextureLoader.load(url, onLoad?, onProgress?, onError?)`
// (src/loaders/TextureLoader.js) returns a `Texture` synchronously,
// populated once the underlying `Image` finishes loading; and
// `Loader.crossOrigin` (src/loaders/Loader.js) already defaults to
// `'anonymous'`, so a same-origin or CORS-enabled `'url'` source works
// with zero extra configuration.
//
// LIFECYCLE/CROSS-ORIGIN SEAM, DOCUMENTED NOW, NOT BUILT: a future
// `'url'`-sourced skin (e.g. a user-uploaded texture) will need (1) the
// image served with permissive-enough CORS headers for `crossOrigin =
// 'anonymous'` to avoid a tainted-canvas/WebGL security error, and (2)
// explicit `texture.dispose()` when a skin is swapped or the renderer
// unmounts, exactly like this file's own default numeral textures already
// get disposed in `onBeforeUnmount` -- a skin-swapping feature would need
// to dispose the OUTGOING skin's own textures before discarding it. No
// upload UI, no Directus schema, and no skin-swapping code exist yet
// (this phase's own explicit DO NOT list) -- this paragraph exists so the
// requirement is on record before anyone builds that feature, not as an
// implementation.
//
// WHY NOT EVERY PBR FIELD THREE.JS OFFERS: `bumpMap`/`bumpScale`/`aoMap`
// exist on `MeshStandardMaterial` too, but nothing in this phase's own
// default skin or its stated goals needs a bump map (normalMap already
// covers "future skin adds surface detail") or a baked ambient-occlusion
// map (this die has no multi-object contact geometry for AO to matter
// against). Per this phase's own "do NOT blindly implement every field...
// design the smallest useful contract" instruction, they are left out of
// `DiceMaterialDescriptor` entirely rather than declared-and-ignored --
// adding either later is a small, additive change to this one type, not
// a redesign.

export type DiceTextureSource =
  // A synchronous drawing callback -- `size` is the CSS-pixel width/height
  // of the square canvas being painted (always equal to whatever the
  // renderer's own texture resolution is; the callback should draw
  // relative to `size`, never a hardcoded pixel count, so it keeps
  // working if that resolution ever changes).
  | { kind: 'canvas'; draw: (ctx: CanvasRenderingContext2D, size: number) => void }
  // A real external image -- see this file's own header, CUSTOM TEXTURE
  // SUPPORT, for the cross-origin/lifecycle seam this exercises.
  | { kind: 'url'; url: string }

// Numeral appearance -- deliberately separate from `DiceMaterialDescriptor`
// even though both ultimately paint onto the same per-face texture
// (WorldAuthoredThreeDiceRenderer.client.vue's own `createFaceTexture`):
// the numeral is drawn ON TOP OF whatever the material contributes as its
// base face color/texture, and a future skin should be able to restyle
// "how the number looks" independently of "what the die body looks like"
// -- this task's own NUMERALS section: "Future skins should be able to
// change numeral: color, font/treatment... outline/inlay treatment."
export type DiceNumeralTreatment = {
  color: string
  // An outlined/inlaid stroke around the glyph, drawn beneath the fill --
  // omit both `outlineColor` and `outlineWidth` for a plain, unstroked
  // numeral.
  outlineColor?: string
  // Stroke width, in the SAME units as a 256px-square texture (the
  // renderer scales this to whatever its own actual texture resolution
  // is) -- keeps a skin author's numbers meaningful independent of a
  // future renderer resolution change.
  outlineWidth?: number
  fontFamily?: string
  fontWeight?: string | number
}

// The material half of a skin -- see this file's own header for exactly
// which THREE.MeshStandardMaterial fields these map to, and why the list
// stops where it does.
export type DiceMaterialDescriptor = {
  baseColor: string
  roughness: number
  metalness: number
  // Used for the edge-outline accent (WorldAuthoredThreeDiceRenderer
  // .client.vue's own `buildEdgeOutline`) -- defaults to `baseColor` if
  // omitted, so declaring it is optional even though it is always used.
  accentColor?: string
  emissiveColor?: string
  // 0 (no glow) unless both `emissiveColor` and this are set.
  emissiveIntensity?: number
  // Optional base color/albedo texture -- if present, replaces the
  // default flat-fill-plus-vignette background (see
  // WorldAuthoredThreeDiceRenderer.client.vue's own `paintFaceBackground`)
  // as the layer the numeral is drawn on top of. `ELDRA_DEFAULT_D20_SKIN`
  // leaves this undefined.
  map?: DiceTextureSource
  normalMap?: DiceTextureSource
  roughnessMap?: DiceTextureSource
  metalnessMap?: DiceTextureSource
  emissiveMap?: DiceTextureSource
}

export type DiceSkin = {
  id: string
  name: string
  material: DiceMaterialDescriptor
  numeral: DiceNumeralTreatment
}

// ---------------------------------------------------------------------------
// THE ONE PRODUCTION SKIN (this phase's own DEFAULT SKIN section: "exactly
// ONE production/default skin... No selector. No user preference storage.
// No uploads. No monetization.")
// ---------------------------------------------------------------------------
// Every color below is transcribed from Eldra's own already-established
// palette (app/assets/css/eldra-fieldguide.css's `--eldra-gold`/
// `--eldra-charcoal`/`--eldra-parchment` custom properties, and the
// `#fff7df` ivory already used throughout WorldRollTray.vue/
// WorldDiceAnimation.vue) -- not new brand colors invented for this die,
// so the die reads as part of the same visual language as the rest of the
// Dice Presentation Layer chrome around it, per this phase's own "warm,
// fantasy-adjacent, consistent with Eldra's existing visual language"
// goal.
export const ELDRA_DEFAULT_D20_SKIN: DiceSkin = Object.freeze({
  id: 'eldra-default',
  name: 'Eldra Default',
  material: Object.freeze({
    baseColor: '#c9a45a', // --eldra-gold
    roughness: 0.42,
    metalness: 0.24,
    accentColor: '#e8d9b5', // --eldra-parchment -- a lighter accent than the base gold, for a crisp edge-line
    emissiveColor: '#c9a45a', // --eldra-gold
    emissiveIntensity: 0.045 // a bare glow, not a light source -- see the renderer's own FLOURISH glint, which boosts this temporarily
  }),
  numeral: Object.freeze({
    color: '#11100d', // --eldra-charcoal
    outlineColor: '#fff7df', // established ivory text color
    outlineWidth: 6,
    fontFamily: 'ui-monospace, "SFMono-Regular", monospace',
    fontWeight: 800
  })
}) as DiceSkin

// Resolves an optional caller-supplied skin to a real, usable `DiceSkin`,
// falling back to the one production default -- the ONLY place "which
// skin is currently active" is decided. Not yet meaningfully exercised
// (nothing outside this module ever passes a non-null `skin` today: no
// selector, no per-player preference, no persistence -- this phase's own
// explicit scope), but keeping the fallback centralized here, rather than
// inlined as `skin ?? ELDRA_DEFAULT_D20_SKIN` at each call site, is what
// makes "swap the active skin" a one-call-site change whenever a future
// phase actually adds a second skin.
export function resolveDiceSkin(skin?: DiceSkin | null): DiceSkin {
  return skin ?? ELDRA_DEFAULT_D20_SKIN
}

// ---------------------------------------------------------------------------
// OPEN QUESTION, DEFERRED (this phase's own TABLE ROLLS section: "Do NOT
// decide yet whether future Table rolls display: roller's skin, or
// viewer-local skin. That is a future product decision. Document the open
// question if the new abstraction makes it relevant.")
// ---------------------------------------------------------------------------
// It is now relevant, because a skin is a real, swappable value for the
// first time: once a second skin and a way to choose one both exist, a
// `table`-visibility roll (eldra-roll-system.md §5) broadcast to multiple
// clients raises the question this file does not answer -- does every
// viewer see the ROLLER's chosen skin (consistent, "this is what everyone
// at the table sees the roller using"), or each viewer's OWN chosen skin
// (consistent with how e.g. a chat app renders each user's own message
// bubble style)? Nothing about `DiceSkin`/`resolveDiceSkin` presumes an
// answer -- `resolveDiceSkin` takes a skin as a plain argument, not a
// player id or a lookup, so either policy can be implemented later purely
// in whatever code eventually calls it, with zero change here. This is a
// product decision, not an architecture one; it is recorded here only so
// it is not silently pre-decided by whichever caller happens to be
// written first.
