# ADR-024 — Authored Dice Presentation

**Status.** Accepted (pending push/deploy — this is a documentation-only commit; nothing in this ADR is implemented yet, and the physics renderer it supersedes is still the one shipping).
**Context.** Seven implementation phases (3B → 3G, `5f616c1` … working tree) were spent making a physics dice renderer show the number the server had already decided. It now does, correctly and provably (Phase 3F, `95e4796`). The cost of getting there — and what that cost revealed about the abstraction — is the subject of this ADR.
**Decision.** Eldra stops simulating dice. The dice presentation layer becomes **authored**: a hand-designed, fixed-duration animation that plays *toward* a face already named in the `RollEventRecord`, rather than a physics simulation whose outcome must be forced, replayed, and reconciled.
**Consequences.** The final visible face stops being something the renderer can get wrong — it becomes an animation target, not a simulation result. Pacing becomes a designed number instead of an emergent one. Skins, tiers, particles, and sound become authorable rather than negotiated with a physics engine. The cost is rebuilding the renderer once more, deliberately, behind a seam that was built for exactly this (§13).
**Risks.** §15 in full. The largest is that "authored" invites scope creep toward cinematics — the pacing budget in §6 is the guard, and it is not negotiable.
**Revisit when.** A future product direction genuinely requires *emergent* dice behaviour — dice colliding with a battlemap, physical dice trays, a table simulation where the tumble itself is the point. Nothing on the Eldra 2.x/3.0 roadmap does. Not before then.

---

## 0. Why this ADR exists, and what it does not change

This ADR revises exactly one layer: **how an already-decided roll is shown.** It changes nothing about how a roll is *decided*, *persisted*, *authorized*, or *broadcast*.

Specifically, and to forestall the most likely misreading of a document with "dice" in the title: **ADR-023 is not being revisited, softened, or scoped down here.** Server-authoritative gameplay remains the rule. `eldra-roll-system.md`'s architecture — `roll_events`, the visibility model (§5), `POST/GET /rolls` (§7), `roll-realtime-bridge.ts` (§10), the trust boundaries (§13) — remains accepted in full. The Roll Tray remains the permanent history. `useDiceAnimationQueue.ts` remains the animation host. `DiceRendererAdapter` remains the seam.

What changes is what gets registered *behind* that seam, and why.

**This ADR supersedes `eldra-roll-system.md` §11 and §12 only.** Those sections were written before any renderer had been built, and their recommendation ("change nothing about the renderer, only adapt the data shape") was correct advice given what was known then — it explicitly flagged `@3d-dice/dice-box-threejs` as **unverified** and warned that switching renderers to chase frame-accurate faces was "a separate, larger decision." That decision was subsequently made, implemented, and lived with for seven phases. This ADR is the report from the other side of it.

---

## 1. Core decision

> **The server decides the result. The presentation celebrates the result.**
> No simulation stands between the two.

Stated as an engineering rule rather than a slogan:

> **The final visible face of every die is an input to the animation, never an output of it.**

Under physics, the face was an *output* — the simulation produced a resting orientation, and the renderer's job was to make that output agree with the server. Every defect in Phases 3B–3F was a failure of that reconciliation. Under authored presentation, the face is an *input* — the animation is constructed to arrive at a face the `RollEventRecord` already named, so there is no second value anywhere in the system that could disagree with the first.

This is not a performance optimization. It is the removal of an entire class of bug by removing the thing that could be wrong.

---

## 2. Why physics is rejected — the evidence

This section is deliberately specific. "Physics felt clunky" is not an architectural argument; what follows is.

### 2.1 The two libraries, and what each proved

**`@3d-dice/dice-box@1.1.4` — cannot force an outcome at all.** Its die resolves its visible face by raycasting against wherever the simulation happened to settle, with no override hook. Eldra shipped this for the legacy Rules-Engine pipeline with an honest workaround: physics purely decorative, the authoritative number displayed separately, the settled pips *never read* (`EldraDiceBox.client.vue`'s own header). That is a defensible trade for a small readout. It is not defensible once the die itself is the centerpiece: a d20 visibly showing 5 next to a tray reading 19 is exactly the "presentation quietly contradicting truth" failure ADR-023 §15 warns costs *both* questions their answer.

**`@3d-dice/dice-box-threejs@0.0.12` — can force an outcome, but only by deterministic replay.** Verified from its shipped bundle, `rollDice()` runs five synchronous steps:

```
1. spawnDice(vectors[i])        create each die's cannon-es Body
2. simulateThrow()              run physics SILENTLY to rest; record the natural face
3. spawnDice(vectors[i], die)   destroy and re-create every Body from identical vectors
4. swapDiceFace(die, result[i]) swap TEXTURES so the face predicted in step 2 prints the forced value
5. animateThrow()               replay the same throw, visibly
```

The forced face is not a constraint the solver honours. It is a **texture swap that is only correct if step 5 reproduces step 2 exactly.** Nothing re-checks the result afterward; nothing can correct it.

### 2.2 What that fragility actually cost, phase by phase

| Phase | Commit | What it was | What it revealed |
|---|---|---|---|
| 3B | `5f616c1` | Adopt `-threejs` for forced faces | Replay-based forcing is the only mechanism available |
| 3B.2 | `6a922d6` | `initialize()` was never called | Every roll had been silently failing to the placeholder |
| 3C | `7051e87` | Perf audit | Animation measured **~2800–3200ms**; init ~772ms |
| 3D | `d002ed3` | Tune for pacing | Dominant cost was `sleepTimeLimit: 0.9` — 0.9s of waiting *after* the die stopped moving |
| 3E | `e9923ca` | Tray revealed before the die looked finished | A post-hoc beat can delay an unconvincing ending; it cannot make it convincing |
| 3E.1 | `b418765` | Rebalance thresholds | Tightening for speed made dice freeze mid-motion; loosening for conviction cost pacing |
| 3F | `95e4796` | **Faces were frequently wrong** | Tuning applied between steps 2 and 5 broke replay determinism outright |
| 3G | *(working tree)* | Presentation polish | Entrance/exit/scale had to be bolted *around* a renderer that owned its own timing |

### 2.3 The five structural findings

1. **Determinism was conditional, not structural.** Correct faces required the silent simulation and the visible replay to run byte-identical physics. Any divergence — a tuning value applied to one pass and not the other (3F's root cause), a dropped frame changing how many physics steps ran before `forcedFinish` — produced a wrong face **with no error anywhere**. A correctness property that fails silently under frame jitter is not a property, it is a coincidence that usually holds.

2. **Speed and conviction were directly opposed, and both were downstream of physics.** 3D bought pacing by loosening sleep thresholds and lost visual conviction. 3E.1 bought conviction back and lost pacing. There was no setting that delivered both, because the thing being tuned was *when physics declares a body asleep*, which is not the same question as *when a person believes a die has stopped*.

3. **Completion was governed by physics, not by tabletop cadence.** `throwFinished()` offers exactly one completion signal: every body `SLEEPING`, or a forced `iteration > iterationLimit`. Neither is "the moment this should feel finished." Every timing beat Eldra actually wanted — the 150ms pending beat, the 130ms settle confirmation, the 250ms complete hold — had to be layered *outside* the renderer because the renderer had no concept of authored cadence.

4. **Control required reaching inside the library.** The values that mattered most (`sleepSpeedLimit`, `sleepTimeLimit`, `linearDamping`, `angularDamping`, contact-material `restitution`) have **no config hook** — they are hardcoded inside `spawnDice()`. Phase 3F's fix works by **monkey-patching `instance.spawnDice`** on the live object. It is correct, it is documented, and it is a standing maintenance liability: it is coupled to the internal call order of a `0.0.x` dependency.

5. **The whole apparatus existed to produce a number that was already known.** The silent pre-simulation exists only to discover a face so it can be overwritten. Eldra ran a full physics simulation, threw away its result, and swapped textures to hide that it had. That is the clearest possible signal that physics is the wrong abstraction here: **the simulation's output is never wanted.**

### 2.4 The conclusion, stated plainly

Physics answers "what would happen if these objects were thrown?" Eldra does not have that question. Eldra has: *"the answer is 17 — now make 17 feel good."* Simulating to find an answer, discarding it, and repainting the dice to show the answer you already had is an expensive way to not use a physics engine.

**None of this is a defect report against `-threejs`.** It is a competent library doing the job it was built for. The mismatch is ours: we asked a simulator to be a presenter.

---

## 3. Where this sits in ADR-023's flow

ADR-023 §2 defines seven stages. This ADR governs **stage 7 only**:

```
1. User requests event          ← unchanged
2. Server validates             ← unchanged
3. Server derives state         ← unchanged
4. Server decides the outcome   ← unchanged  (the ONLY step allowed to consult randomness)
5. Server persists              ← unchanged
6. Server broadcasts            ← unchanged
7. Clients present the outcome  ← THIS ADR
```

ADR-023 §15 Q2 already stated the principle this ADR operationalizes: presentation "is allowed to be provisional, approximate, or even briefly wrong ... *because nothing that matters was ever sourced from the presentation layer in the first place*." That sentence explicitly cited the `@3d-dice/dice-box` face-divergence limitation as an acceptable cost.

**This ADR does not overturn that — it makes the concession unnecessary.** ADR-023 permits presentation to diverge without gameplay harm. Authored presentation removes the divergence anyway, because the face is an input. The trust boundary is unchanged; the presentation layer simply stops having a way to be wrong about something it was already forbidden from deciding.

In ADR-023 §6's vocabulary, everything in this ADR is a **Gameplay Projection**: a read-only lens onto an Event that computes nothing authoritative. `DicePresentationRequest` (§5) is a Projection of `RollEventRecord`, exactly as `DerivedValue` is a Projection of character State. That classification is what makes this ADR structurally incapable of conflicting with ADR-023.

---

## 4. System concept — the Authored Dice Renderer

**Name.** `AuthoredDiceRenderer`, implementing the existing `DiceRendererAdapter`.

Not `AuthoredDicePresentationEngine`. "Engine" overstates it and misdescribes it — this is not a peer of the Rules Engine; it decides nothing. The codebase's established vocabulary in this area is already *Dice Presentation Layer* / *renderer* / *adapter* (`app/lib/dice-presentation/`, `DiceRendererAdapter`, `worldDiceThreeRendererAdapter.ts`), and this component is a renderer among renderers. Naming it consistently keeps the seam legible.

**What it consumes:** `DiceAnimationRequest` (existing, unchanged) → internally derives `DicePresentationRequest` (§5).

**What it must never consume** — each of these would re-couple the presentation layer to something it has no business knowing:

| Forbidden input | Why |
|---|---|
| OpenDice internals | `dice-adapter.ts` is the one module allowed to know `opendice` exists (`app/lib/rolls/types.ts` header). A renderer importing it re-opens a boundary already closed. |
| Renderer physics state | There is none. Reintroducing one recreates §2's entire failure class. |
| Character sheet state | The roll is already resolved; HP, AC, and modifiers are irrelevant to celebrating a number. |
| Action row state | `useWorldRolls.ts`'s own header already forbids the reverse coupling; this keeps it symmetric. |

**What it produces:** visual ceremony, and a Promise that resolves when the ceremony is done. Identical contract to today's adapter — `prepare()` / `play()` / `dispose()`, unchanged.

---

## 5. `DicePresentationRequest` — the derived shape

A **pure projection** of `RollEventRecord`, computed by a pure function in `app/lib/dice-presentation/`. It adds no facts; it pre-chews existing ones into what an animation needs.

```ts
type DicePresentationRequest = {
  rollId: string                    // RollEventRecord.id — queue identity, dedup key
  dice: PresentationDieGroup[]      // per-group: sides, and per-die face + kept flag
  total: number                     // already authoritative
  label: string                     // display only, never parsed
  visibility: RollVisibility        // 'private' | 'table' — informs framing, NOT access (§9)
  rollerDisplayName: string         // whose ceremony this is (§9)
  mode: DicePresentationMode        // 'self' | 'table' — is this my roll or someone else's?
  tier: DicePresentationTier        // 'quiet' | 'normal' | 'dramatic' | 'critical' (§8)
}
```

Three notes on the derivation, each load-bearing:

- **`dice` carries every die, including dropped ones.** `RollDieGroup.results` is documented as never trimmed to just the kept dice, precisely "so a future renderer can dim the dropped dice instead of hiding them." Advantage should visibly *show* two d20s with one dimmed. That affordance already exists in the data model and has never been used.
- **`mode` is derived, not transmitted.** Comparing `RollEventRecord.rollerUserId` against the session identity is a client-side presentational classification. It changes framing (§9), never access.
- **`tier` is derived, never persisted.** Per ADR-003 ("derived values are never stored") and ADR-023 §6: a tier is a Projection. Re-deriving it on every client from the same `RollEventRecord` is what guarantees every client independently arrives at the same tier (§9) without transmitting it.

---

## 6. Presentation model — the five authored beats

Every roll plays the same five beats. Durations are **authored constants**, not emergent — this is the entire point.

```
ENTER      ~120ms   Stage claims focus. Dice arrive with intent.
   │
ROLL LOOP  ~400ms   Controlled tumble/spin illusion. Reads as motion, not simulation.
   │                Scales with die count, does NOT multiply by it (§15).
LAND       ~180ms   Decelerate onto the authoritative face. Overshoot-and-settle easing.
   │                The face was decided before this beat began.
FLOURISH   ~150ms   Tier-scaled (§8). 'quiet' may render nothing at all.
   │
RECORD     ~150ms   Die resolves toward the Roll Tray; entry appears (§10).
```

**Total ≈ 1000ms, and every millisecond is a decision somebody made.** Compare §2.2: the physics renderer's animation alone measured 2800–3200ms before tuning, and its duration was never directly settable — only influenced, through sleep thresholds.

Four properties this model has that physics could not offer:

- **Interruptible.** A queued second roll can compress or cut the current ceremony. Physics had to be waited out.
- **Tier-scalable.** `quiet` can collapse to ~500ms by shortening Roll Loop and dropping Flourish. Same code path, different constants.
- **Testable.** Fixed durations are assertable under fake timers, exactly as `worldDiceThreeRendererAdapter.test.ts` already does for the settle beat.
- **Budget-honest.** The queue's existing beats (`PENDING_BEAT_MS` 150, `COMPLETE_HOLD_MS` 250) remain the caller's, unchanged. The renderer owns only the five beats above.

---

## 7. Face presentation — determinism by construction

```
RollEventRecord.dice[g].results[i]     (authoritative, server-decided, persisted)
        │
        ▼  pure projection, no simulation
DicePresentationRequest.dice[g].faces[i]
        │
        ▼  static per-die-type orientation table
final transform for die (g,i)
        │
        ▼  LAND beat animates TO this transform
visible face
```

**There is no simulation result to reconcile — that is the whole claim of this ADR.** The last arrow is an animation target, and an animation that fails to reach its target fails *visibly and reproducibly*, not silently and intermittently.

**Phase 3F's work is directly reusable and must not be discarded.** `DIE_FACE_MAPPINGS` (`worldDiceThreeRendererAdapter.ts`) already establishes, per die type, verified from source: the supported side counts (d1/d2/d3/d4/d6/d8/d10/d12/d20), the ordered face values, the printed glyph per face (including d10's tenth face printing `0`), and the all-or-nothing guard that refuses to animate a roll containing any unsupported die rather than mis-mapping it. That table's *semantics* survive this pivot unchanged — only its consumer changes, from "the value to force via `@` notation" to "which orientation to land on." The exhaustive per-face test suite built alongside it is the template for §14's Phase 4B acceptance bar.

---

## 8. Presentation tiers

Four tiers, deliberately few: **`quiet` · `normal` · `dramatic` · `critical`**.

**Where the logic belongs — the only thing this ADR fixes about tiers:**

| Concern | Home | Why |
|---|---|---|
| Tier *classification* | `app/lib/dice-presentation/tiers.ts` — pure, testable, zero I/O | Matches `app/lib/**`'s established pure-module convention |
| Tier *rules* (what counts as critical) | Provided by the game system via `app/lib/systems/*` | CLAUDE.md: "avoid hardcoding 5e-only assumptions deeper into shared code than necessary" |
| Tier *appearance* | The renderer + design tokens | Theming is presentation, not classification |

**The data model already provides system-neutral primitives for this, and they are currently unused.** `RollDieGroup` carries `naturalHigh` / `naturalLow` — documented as true only when exactly one die was kept and it showed its top/bottom face, and deliberately *not* true for a bound-satisfied keep. A classifier can read those instead of hardcoding `=== 20`, which is what keeps this pluggable rather than 5e-shaped. Other available signals: `advantageState`, `total` relative to the expression's range, `visibility`, `sourceType`, and `mode`.

Deliberately **not** decided here: the exact thresholds, whether a GM roll gets its own treatment, and whether tiers are player-configurable. Those are Phase 4D. This ADR fixes only the seam.

---

## 9. Private vs. table rolls

**The security statement first, because it is the one that must not be misread:**

> **Presentation is never an access control boundary.**

A client animates a roll because it *received* one. Whether it receives one is decided server-side, in `GET /rolls`'s filter and in `broadcastRollEvent`'s recipient selection (`eldra-roll-system.md` §5/§13: "GM visibility must not depend on client cooperation"). If a private roll ever reaches an unauthorized client, hiding the animation would not fix it — the roll is already in that browser's memory. **Nothing in this ADR may become the thing that keeps a roll secret.**

With that established, the presentational differences:

| | Private roll | Table roll |
|---|---|---|
| Who animates | The roller; GM/admin viewers authorized to receive it | Every client that received the broadcast |
| Framing | Unattributed | Attributed — `rollerDisplayName` shown |
| `mode` | `self` (or `self` for the roller, `table` for an authorized observer) | `self` for the roller, `table` for everyone else |
| Prominence | Full ceremony for the roller | Slightly reduced for observers — someone else's roll should not seize your screen |

**On synchronization — authored presentation makes this structurally better, not merely acceptable.** The requirement is: same result, same final face, same tier; frame timing need not match.

Under physics that guarantee was genuinely shaky. Two clients replaying the same throw could reach different resting orientations from frame jitter alone — that is not hypothetical, it is precisely the Phase 3F defect (§2.2), and it was a *per-client* defect, meaning two players could legitimately have seen different faces for the same roll.

Under authored presentation, face and tier are **pure functions of the `RollEventRecord` every client received identically**. Agreement is not coordinated; it is arithmetic. Frame timing drifts freely and harmlessly, because nothing observable depends on it.

---

## 10. Roll Tray relationship

Restating the boundary, since this ADR moves a renderer that sits near it:

- **The dice presentation belongs to the World.** It mounts once, at the layout level (`WorldDiceOverlay.vue`, in `world-workspace.vue`), and serves every surface — Character Sheet today, Encounter Screen, DM Screen, Developer Sandbox tomorrow.
- **The Roll Tray is the permanent history.** `WorldRollTray.vue` renders `useWorldRolls().history`. It owns no renderer, imports no dice library, and is unaffected by this ADR.
- **The ceremony is temporary; the record is permanent.** The die is gone in ~1s. The tray entry persists until the player scrolls past it.

**The die may visually resolve toward the Tray. It must never be owned by it.** Phase 3G already established this direction (docking the stage above the Tray, `origin-bottom` so the exit collapses toward it). §6's RECORD beat continues that intent. But the Tray remains a pure consumer of `history`, and a surface that mounts the presentation without a Tray (a future DM screen) must still work.

This is also the strongest single argument for the recommended implementation in §12: a DOM-based die can animate *into the Tray's actual DOM position*. A die trapped inside a canvas cannot.

---

## 11. Implementation options evaluated

### Option 1 — CSS/DOM authored dice

3D-transformed DOM elements (`transform-style: preserve-3d`), one element per face, animated via Web Animations API / CSS transitions to a precomputed orientation.

| Dimension | Assessment |
|---|---|
| Deterministic final face | **Perfect.** The face is a transform target. |
| Skins/themes | **Best.** CSS custom properties, gradients, borders, images. Eldra already has a token system (`eldra-design-language.md`) and ornate panel/gold-chip vocabulary to inherit. A skin is a stylesheet. |
| Particles | **Adequate** at the scale needed — a dozen absolutely-positioned sparks. Poor beyond ~50. §6's Flourish is a "small flourish," not a particle system. |
| Sound | Orthogonal (`HTMLAudioElement`). |
| Performance | GPU-composited transforms are cheap. Risk concentrates in large pools (8d6+) and low-end mobile. |
| Mobile | **Best.** No WebGL context, no context-loss handling, no GPU blocklist. |
| Asset complexity | **None.** Markup and CSS. |
| Implementation cost | **Low** for d4/d6; **medium** for d8/d10/d12/d20 — the per-face orientation table is fiddly to derive but is *static data, derived once*, in exactly the shape Phase 3F already built and tested. |
| Bundle | **Negative** — eventually removes 697KB raw / ~154KB gzipped (the `-threejs` ES bundle, which inlines three + cannon-es). |
| Unique capability | **Can animate into the Roll Tray's real DOM position** (§10). No other option can. |
| Principal risk | A CSS icosahedron with legible numerals on triangular faces is genuinely fiddly; numerals can distort mid-tumble. |

### Option 2 — Canvas/WebGL authored dice, no physics

Keep three.js, delete cannon-es. Animate the mesh along an authored path, then slerp its quaternion to the orientation showing face *N*.

| Dimension | Assessment |
|---|---|
| Deterministic final face | **Perfect.** Quaternion slerp to a precomputed target. |
| Skins/themes | **Good**, but each skin is an asset pipeline (textures, materials, normal maps), not a token change. |
| Particles | **Best.** GPU particle systems, no practical count limit. |
| Sound | Orthogonal. |
| Performance | Good once warm; init measured **~772ms** in Phase 3C. |
| Mobile | **Acceptable**, heaviest of the three. WebGL context limits and loss handling are real on low-end devices. |
| Asset complexity | Medium — geometry procedural, materials authored. |
| Implementation cost | **Medium, and the smallest delta from today** — geometry, materials and face mapping survive; the physics world, the silent pre-simulation, the texture swap and the `spawnDice` monkey-patch are deleted. |
| Bundle | Unchanged (~154KB gzipped retained). |
| Unique capability | Highest visual ceiling. A d20 genuinely looks like a d20. |
| Principal risk | Retains a heavy dependency, and retains the temptation to re-add "just a little" physics. |

### Option 3 — Pre-rendered sprite sheets / frame sequences

Offline-render one clip per (die type × face × skin); play frames back.

| Dimension | Assessment |
|---|---|
| Deterministic final face | **Perfect by construction** — the last frame *is* the face. |
| Skins/themes | **Worst.** Every skin re-renders the entire matrix offline. Directly contradicts "future skins." |
| Particles | Baked in — cannot react to tier at runtime. |
| Sound | Orthogonal. |
| Performance | Excellent at playback; heavy on download and decoded-frame memory. |
| Mobile | Poor — large downloads, memory pressure. |
| Asset complexity | **Worst.** d20 alone: 20 faces × ~30 frames = 600 frames *per skin*. Across 7 die types and any skin count, hundreds of MB. |
| Implementation cost | Low code, **very high** asset/ops cost — and requires a 3D authoring pipeline (Blender) nobody on this project has set up. |
| Bundle | Assets dominate; code is trivial. |
| Principal risk | Zero runtime flexibility. Timing, tiers and camera are all frozen at render time. |

---

## 12. Recommendation

> **Build Option 1 — CSS/DOM authored dice.**
> Hold Option 2 as the named fallback, decided at a specific gate (§14, Phase 4B).

Option 3 is rejected outright: its asset matrix contradicts the skin system this pivot is partly meant to enable, and it is the only option that gets *harder* as the product grows.

**Why Option 1 over Option 2**, against this ADR's own optimization criteria:

| Criterion | Verdict |
|---|---|
| Deterministic correctness | Tie — both make the face an input. |
| Sub-second pacing | Tie — both authored. |
| Maintainability | **Option 1.** Zero dependencies. No monkey-patched third-party internals. No WebGL lifecycle. CLAUDE.md's Architectural Priorities are explicitly ordered *Maintainability → Consistency → Simplicity → Performance → Cleverness*, and that ordering decides this. |
| Future skins | **Option 1.** A skin becomes a stylesheet against an existing token system, not an asset pipeline. |
| Future particles | Option 2 — but §6's Flourish is a *small* flourish; Option 1 clears the actual bar. |
| Future sounds | Tie. |
| Not fighting physics engines | **Option 1, decisively.** Option 2 keeps the engine's neighbourhood, the 154KB, and the temptation. |

**The decisive Eldra-specific argument** is §10's: the product goal is that the Tray *feels like the die's destination*. A DOM die can animate into the Tray's literal position, inheriting the Tray's own styling as it lands. A canvas die can only shrink toward a coordinate and hand off to a separate DOM element. One is continuous; the other is a cut dressed as a transition.

**Named, honest risk:** the CSS icosahedron. A d20 has 20 triangular faces; numerals on `clip-path` triangles can distort mid-rotation and read poorly at ~180px. This is *the* reason Phase 4B is d20-only, and it gets an explicit decision gate rather than optimism (§14).

**Named mitigation, if legibility disappoints:** the number need not be legible *during* the Roll Loop — only at Land. BG3's own presentation is read on settle, not mid-tumble. A face-forward Land (the landing face rotating flat to camera) preserves the read without requiring every face legible at every angle. If even that fails the gate, Option 2 is adopted with no further deliberation.

---

## 13. Migration plan

**The Dice Presentation Layer survives this pivot intact. Only the renderer implementation is replaced.**

| Component | Fate |
|---|---|
| `DiceRendererAdapter` (`app/lib/dice-presentation/renderer.ts`) | **Unchanged.** This seam was built for exactly this. |
| `DiceAnimationRequest` / `State` / `Result` (`types.ts`) | **Unchanged.** |
| `useDiceAnimationQueue.ts` | **Unchanged.** Queue, states, dedup, generation guard, timings. |
| `WorldDiceOverlay.vue` | **One line** — registers a different adapter. |
| `WorldDiceStage.vue` / `WorldDiceAnimation.vue` | **Unchanged.** Remains the no-renderer fallback. |
| `WorldRollTray.vue` / `useWorldRolls.ts` | **Unchanged.** |
| Roll Events, `roll_events`, `/rolls`, realtime bridge | **Unchanged.** ADR-023 territory. |
| `WorldDiceThreeRenderer.client.vue` + its adapter | **Legacy presentation.** Retained and working until 4G. |
| `@3d-dice/dice-box-threejs`, three, cannon-es | **Retained** until 4G. |
| `@3d-dice/dice-box` + `EldraDiceBox.client.vue` | **Untouched entirely** — still serves legacy V1 `sheet.vue`. Out of scope, as it has been since Phase 3B. |

**That the seam absorbs this with a one-line change is the strongest available evidence it was drawn in the right place.** Phase 3A built `DiceRendererAdapter` before any renderer existed, explicitly so a future renderer swap would need no call-site changes. This is that swap, and the prediction holds.

**Both renderers coexist during migration.** The authored renderer is registered behind a flag; the physics renderer stays registerable. That makes 4B–4F reversible at every step and turns 4G into a deletion of already-dead code rather than a risky cutover.

---

## 14. Phase plan

Each phase independently shippable, each stating what it must not touch — matching `eldra-roll-system.md` §14's own convention.

**Phase 4A — This ADR.** Documentation only. No code, no packages. ✅ *(this document)*

**Phase 4B — Authored d20 proof of concept, and the Option 1/2 decision gate.**
Build `AuthoredDiceRenderer` for **d20 only**, behind a dev flag, registered alongside the existing renderer. Implement all five beats (§6). Derive `DicePresentationRequest`. Port `DIE_FACE_MAPPINGS`'s d20 entry into an orientation table. Exhaustive tests: all 20 faces land on the right face, mirroring Phase 3F's own per-face suite.
**Gate — evaluated in a real browser, on a real phone, before 4C begins:** is a CSS d20 legible and convincing at ~180px? Does the full ceremony land under ~1s? Does the Land beat read as a landing? **If any answer is no, adopt Option 2 and continue from 4C unchanged** — every later phase is written to be implementation-agnostic precisely so this gate is cheap.
*Must not touch:* queue, tray, roll events, realtime, the physics renderer.

**Phase 4C — Standard polyhedral dice.** d4/d6/d8/d10/d12, plus multi-die pools and dimmed dropped dice (§5). Per-face test coverage for every supported type.

**Phase 4D — Tiers and flourish.** `tiers.ts` classifier + system-provided rules (§8). Tier-scaled durations and flourish. `quiet` collapses toward ~500ms.

**Phase 4E — Table roll polish.** `mode`-aware framing, attribution, reduced prominence for observers (§9). Verify multi-client agreement on face and tier. No realtime changes.

**Phase 4F — Skins/theme system.** Token-driven skins over §11 Option 1's stylesheet model. Per-player preference storage and whether skins are a monetization surface remain explicitly out of scope, as `eldra-roll-system.md` §12 already declined to invent them.

**Phase 4G — Remove the physics renderer.** Delete `WorldDiceThreeRenderer.client.vue`, `worldDiceThreeRendererAdapter.ts`, their tests, and the `@3d-dice/dice-box-threejs` dependency (three + cannon-es leave with it). **Only after 4B–4F have shipped and lived in production.** `@3d-dice/dice-box` and `EldraDiceBox.client.vue` are *not* touched — legacy V1 `sheet.vue` still uses them, and retiring that is a separate decision.

**Sequencing note — one deliberate change from the brief's suggested order.** The brief placed the Option 1/2 decision implicitly; this plan makes it an explicit, testable gate *inside* 4B, before 4C multiplies any wrong choice across six more die types. Choosing a rendering strategy for d20 alone is cheap; discovering it was wrong after implementing seven die types, tiers, and skins is not.

---

## 15. Risks / open questions

| Risk | Assessment |
|---|---|
| **CSS d20 legibility.** The central technical bet. | Gated explicitly in 4B with a named fallback (§12). This is the risk most likely to change the plan, which is why it is tested first and cheaply. |
| **"Authored" invites cinematics.** Once timing is hand-controlled, every beat is arguable, and 1000ms drifts to 2000ms. | §6's budget is a **fixed contract, not a default.** Any phase proposing to exceed it must justify it in that phase's own brief. Physics at least imposed an external limit; authored presentation has no natural ceiling, so the ceiling must be stated — this is a genuine new risk the old approach did not have. |
| **Large dice pools.** 8d6 fireball damage: 8 simultaneously animating DOM dice. | §6 requires duration scale *sub-linearly* with count, never multiply. Beyond a threshold (~10), consider animating a representative subset and presenting the remainder as a summarized group. Decided in 4C with real measurements, not guessed now. |
| **Reduced-motion accessibility.** Not addressed by the current renderer at all. | `prefers-reduced-motion` should collapse the ceremony to a near-instant reveal. **Easy under authored presentation, effectively impossible under physics** — a genuine new capability this pivot unlocks. Owed a decision in 4D. |
| **Visual ceiling.** CSS dice will not match a lit, beveled 3D d20. | Accepted deliberately. CLAUDE.md ranks Maintainability above Cleverness, and §12 makes the trade explicit rather than implicit. |
| **Two renderers during 4B–4F.** Temporary duplication. | Bounded and intentional — it is what makes each phase reversible. CLAUDE.md's Project Status explicitly anticipates transitional code. 4G closes it. |
| **Re-litigation.** A future contributor proposes "just a little physics" for realism. | This ADR is the standing answer, and §2 is the evidence. Physics returns only under the Revisit-when clause — an actual product requirement for *emergent* dice behaviour, not a preference for realism. |
| **Open: does the Tray handoff survive mobile layout?** §10/§12's DOM-continuity argument assumes the Tray is on screen. | On mobile the Tray may be collapsed or offscreen. Needs a defined degrade path (resolve toward the collapsed handle). Open question for 4E. |
| **Open: sound.** Named as a future capability, designed nowhere. | Orthogonal to all three options (§11). Needs its own brief — asset licensing, volume preferences, autoplay policy. Not blocking 4B. |

---

## 16. Project Knowledge Review

**1. Why is authored dice presentation a better fit for Eldra than physics?**

Because Eldra never had the question physics answers. A physics engine computes *what outcome would occur*; Eldra always already knows the outcome — the server decided and persisted it before any pixel moved (ADR-023 §2, stages 4–5). Everything the physics renderer did after that point was an elaborate way of arriving back at a number it had been handed at the start: it simulated silently, discarded the result, swapped textures to show the real answer, and replayed the throw hoping the replay matched (§2.1). Seven phases of defects all traced to that reconciliation, not to bad tuning. Authored presentation deletes the reconciliation by making the face an input, and in exchange hands Eldra the things physics was actively withholding — an exact duration, an interruptible ceremony, tier-scaled pacing, reduced-motion support, and skins that are stylesheets rather than asset pipelines.

**2. How does this preserve server-authoritative gameplay?**

By touching only ADR-023's stage 7 and nothing else (§3). The server still validates, derives, decides, persists, and broadcasts; `roll_events` is still the record; `GET /rolls`'s filter is still the visibility boundary; the client still computes nothing. If anything, authority is *better* expressed: under physics the renderer held a second, independently-computed notion of the die's face that could silently disagree with the server's (and, per Phase 3F, frequently did). Authored presentation cannot hold a competing value, because it never computes one — it is handed a face and animates to it. ADR-023 §15 Q2 permitted presentation to diverge harmlessly; this ADR removes the divergence anyway. And §9 states the corollary that must never be misread: presentation is not an access boundary. A client animates a roll because the server chose to send it one.

**3. Why should the existing Dice Presentation Layer survive this pivot?**

Because it is the part that was designed correctly, and this pivot is the test it was built to pass. Phase 3A deliberately built `DiceRendererAdapter`, `useDiceAnimationQueue`, and the `DiceAnimationRequest` types *before any renderer existed*, stating in `renderer.ts`'s own header that when a real adapter was registered "EVERY existing call site needs zero changes — this is the entire point of the seam existing now." Replacing a physics renderer with an authored one costs exactly one line in `WorldDiceOverlay.vue` (§13). Discarding that layer because the thing *behind* it failed would be diagnosing the wrong component: the queue, the lifecycle, the dedup, the tray relationship and the graceful fallback are all independent of whether the dice tumble via cannon-es or CSS. Keeping it also keeps the migration reversible — both renderers coexist through 4B–4F, which is what makes the gate in §14 cheap enough to actually honour.

**4. What should the first implementation phase be after this ADR is approved?**

Phase 4B: an authored d20, and nothing else, behind a dev flag, with the existing physics renderer still registerable. d20 alone because it is simultaneously the most-rolled die in the system, the most visually demanding (20 triangular faces — the hardest case for the recommended CSS approach), and the cheapest place to discover the recommendation is wrong. It carries an explicit gate (§14): legible and convincing at ~180px on a real phone, whole ceremony under ~1s, Land reading as a landing. Pass, and 4C scales the approach across the remaining die types. Fail, and Option 2 is adopted with no further argument — every later phase is deliberately written implementation-agnostic so that swap costs one phase, not the plan. What 4B must not do is touch the queue, the tray, roll events, realtime, or the physics renderer; and what it must produce, beyond the animation, is per-face test coverage mirroring Phase 3F's own exhaustive suite — the precedent that caught the last face-mapping defect and would catch the next.

---

## Appendix — Evidence Index

Files read or verified while writing this ADR, beyond CLAUDE.md (read in full, per this task's own first instruction):

**ADR sequence and format** — `adr-023-server-authoritative-gameplay-events.md` (read in full: numbering, house Status/Context/Decision/Consequences/Risks/Revisit-when block, §2's seven stages, §6's Event/State/Projection vocabulary, §15 Q2's presentation-divergence concession); `rules-engine.md` §32 (`ADR-001`–`ADR-022`, confirming ADR-023 was the last allocated number); repo-wide grep confirming no `ADR-024`/`adr-024` exists anywhere.

**Roll System architecture** — `eldra-roll-system.md` §5 (visibility), §10 (realtime bridge, SSE rationale, single-process limitation), §11 (3D dice — **superseded by this ADR**, including its explicit flagging of `-threejs` as unverified), §12 (dice skins — superseded), §13 (trust boundaries), §14 (phase-plan format imitated here).

**Current implementation, re-verified against source** — `app/lib/rolls/types.ts` (`RollEventRecord`, `RollDieGroup`, including the documented `results`-never-trimmed contract and the `naturalHigh`/`naturalLow` semantics §8 relies on); `app/lib/dice-presentation/renderer.ts` and `types.ts` (the seam §13 preserves, and `renderer.ts`'s own zero-call-site-change prediction); `app/composables/useDiceAnimationQueue.ts` (state machine and the `PENDING_BEAT_MS` 150 / `COMPLETE_HOLD_MS` 250 constants §6 leaves to the caller); `app/components/world/WorldDiceOverlay.vue` (the one-line registration point); `app/components/world/WorldDiceThreeRenderer.client.vue` and `worldDiceThreeRendererAdapter.ts` (Phase 3D/3E.1/3F/3G headers, `DIE_FACE_MAPPINGS`, the `spawnDice` monkey-patch); `app/components/world/WorldRollTray.vue` (§10's ownership boundary).

**Physics renderer internals** — `@3d-dice/dice-box-threejs@0.0.12`'s shipped ES bundle, read directly for §2.1's five-step `rollDice()` sequence, `swapDiceFace()`'s texture-swap mechanism, `throwFinished()`'s `forcedFinish` override, `simulateThrow()`-vs-`animateThrow()` iteration-counting divergence, and the `spawnDice()`-hardcoded `sleepSpeedLimit: 75` / `sleepTimeLimit: 0.9` / damping `0.1` defaults with no config hook. Bundle size measured directly: 697,074 bytes raw, 157,634 bytes gzipped.

**Implementation history** — `git log`: `5f616c1` (3B), `6a922d6` (3B.2), `7051e87` (3C, source of the ~2800–3200ms and ~772ms figures), `d002ed3` (3D), `e9923ca` (3E), `b418765` (3E.1), `95e4796` (3F). Phase 3G is in the working tree, pending approval, and is cited as such rather than as landed history.

**Package state** — `package.json`: `@3d-dice/dice-box@^1.1.4` (legacy V1 path, untouched), `@3d-dice/dice-box-threejs@^0.0.12` (this ADR's subject), `opendice@^2.0.0` (server-side, unaffected). No package was added, removed, or modified by this phase.
