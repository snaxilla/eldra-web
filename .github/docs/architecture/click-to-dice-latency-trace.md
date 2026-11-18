# Click-to-Dice Latency Regression — Trace Report

**Status:** Two fixes shipped so far. `b9fb452` (committed, pushed and deployed by the owner) removed one of two redundant `assembleCharacter`+`getWorldRuntime` passes in `resolveAttackAction`/`resolveCombatAction` — production re-measurement after that deploy (§13) confirms a real ~41% `actionResolution` improvement (3258ms → 1910ms average), but it still dominates server roll time. This revision (§13) implements a SECOND, smaller fix (the two assemblies still inside `getCharacterActionsWithDerived` itself now share one), rules out two more CPU hypotheses by direct measurement, and ships new opt-in production diagnostics to subdivide `actionResolution` further — all **uncommitted, awaiting review**, per this revision's own instruction not to commit/push/deploy.

**Owner observation:** after deploying commits `0531335` (Items Mechanics) and `f842968` (Directus/Postgres cache-freshness fixes), clicking "Shortbow Damage" on Bobbert Jr's Actions tab shows an apparent pending state for several seconds before a die appears and the roll feed updates. The owner confirmed correctness is fine (an edited Shortsword's damage dice update on an already-equipped item and roll correctly) — only responsiveness regressed.

**Correction (this revision):** an earlier version of this report described the supplied recording's **total length** (~7.5 seconds) as if it were the measured click-to-dice interval. That is wrong and has been removed from the rest of this document. The recording's own duration is not the same measurement as "time from click to first visible die" — it may include lead-in (locating/framing the button) and/or lead-out (watching the result settle) that are not part of that interval. The owner's own original wording ("several seconds pass before a die appears") is the only claim this report treats as established; the *exact* interval is unmeasured until §11's operator procedure is run.

This report traces the actual code path with file/line references, measures the one mechanism most directly implicated by the two named commits against a real disposable Postgres instance, and is honest about what that measurement does and does not prove.

---

## 1. Reproduction and environment

**No live Nuxt dev server / browser reproduction was performed.** `nuxt.config.ts:38-39` falls back to a hardcoded **production** Directus URL (`https://directus.theledouxs.com`) whenever `NUXT_PUBLIC_DIRECTUS_URL` is unset — running a full dev server here carried a real risk of silently talking to production, which the brief explicitly forbade touching. A full browser repro needs a seeded World/character/Rules-Package/equipped-weapon fixture via the real Directus REST API, which this session did not attempt.

**What was actually exercised**: the real, disposable `eldra-passa-disposable-db` (Postgres 16) + `eldra-passa-disposable-directus` containers already used for the two prior cache-freshness tasks this session, via a temporary, uncommitted Vitest integration test (deleted after use — see §9). This measured the *server-side data-access mechanism* commit `f842968` changed, directly, against a real database, with `directusServiceRequest` and `getContentWorkspace` mocked (so no Directus/Nuxt-runtime dependency was needed — see prior sessions' own note that `directus.ts`'s `getRuntimeDirectusConfig` requires `useRuntimeConfig()`, unavailable outside a Nuxt context).

**This does not reproduce the owner's own click.** It isolates one candidate mechanism. See §5/§8 for what would close that gap.

---

## 2. Actual call chain (file/function references)

Traced from the Actions-tab "Damage" button to the server roll handler for `action_attack` and `damage` sources specifically (the Shortbow Damage case). Ability/skill/save and custom rolls share the client composable and the broadcast/history plumbing but call a *different* server function with a materially shorter chain (see §2.1).

**Client:**
1. `app/components/characters/CharacterActionsPanel.vue:414` — `emit('damage', { actionId })`.
2. `app/pages/worlds/[id]/characters/[characterId]/sheet-v2.vue:510-517` — `rollActionDamage({ actionId })` → `requestRoll({ sourceType: 'damage', actorCharacterId, actionId, visibility })`.
3. `app/composables/useWorldRolls.ts:183-206` — `requestRoll`: records `clickedAt = performance.now()`, sets `pending.value = true`, `await $fetch(POST /api/worlds/:id/rolls)`, records `respondedAt`, calls `revealAfterAnimation`.
4. `app/composables/useWorldRolls.ts:170-176` — `revealAfterAnimation`: hands the roll to `useDiceAnimationQueue().enqueue()`, and **only once that resolves** pushes it into `history` and logs client-side perf (see §2.2).

**Server**, `server/api/worlds/[id]/rolls/index.post.ts` (route; not read in full this session — thin per the codebase's own convention) → `server/utils/roll-events.ts:674-751` `createActionDamageRollEvent`:
1. `:676` `await resolveAttackAction(worldId, actorCharacterId, actionId)` — see §2.3, this is the suspect stage.
2. `:706` `rollFormula(expression, { bonuses: [damageAbilityModifier] })` — OpenDice, pure, in-process.
3. `:735-738` `Promise.all([directusServiceRequest(POST roll_events), resolveOneDisplayName(rollerUserId)])` — persistence + display-name lookup, already parallelized.
4. `:742` `broadcastRollEvent(roll)` — in-process SSE fan-out (`roll-realtime-bridge.ts`, not read in detail this session; the existing `[roll-perf]` log already times it separately, see §2.4).
5. `:744+` `logRollPerf('action damage roll', [...])` — **already logs this exact breakdown** (`actionResolution`, `openDice`, `persistence+displayName`, `broadcast`) to the server console on every single roll, in production, today.

### 2.1 Comparison against the other roll types requested

- **Weapon attack** (`createActionAttackRollEvent`, `roll-events.ts:594-649`): identical shape to damage — same `resolveAttackAction` call, same suspect stage.
- **Ability/save/skill** (`createDerivedRollEvent`, `roll-events.ts:365-?`): calls `getDerivedCharacter` **once**, not `resolveAttackAction`'s two-call pattern (§2.3) — structurally cheaper. Not traced further this session; flagged as a useful A/B data point (§8).
- **Plain roll-tray custom die** (`createCustomRollEvent`, `roll-events.ts:237-?`): no character assembly at all — `parseFormula`/`rollFormula` only, plus the same persist+broadcast tail. Should be the fastest of all four by a wide margin if measured; another useful A/B point.

### 2.2 Client-side instrumentation already exists

`useWorldRolls.ts:150-162`, `logClientRollPerf` — already logs, per roll, to the browser console: `network=Xms` (click → response), `queue+animation=Yms` (response → history reveal), `total=Zms`, against a documented budget comment ("<1000ms target / <750ms stretch / ~500ms ideal"). **This was not read as a design doc claim — it is live code, already shipped, already running on every roll in production.** See §8 for why this is the single most useful piece of evidence this report could not gather itself.

### 2.3 `resolveAttackAction` — the suspect stage, in full

`server/utils/character-actions.ts:393-445`:
```
398  const actionsResult = await getCharacterActions(worldId, characterId)   // assembleCharacter #1
...
426  const derived = await getDerivedCharacter(worldId, characterId)        // assembleCharacter #2, SEPARATE, SEQUENTIAL
...
439  damageAbilityModifier = resolveDamageAbilityModifier(derived.derived.byCategory, attackKind) ?? 0
```
- `getCharacterActions` (`character-actions.ts:246-250`) → `await assembleCharacter(worldId, characterId)`.
- `getDerivedCharacter` (`character-derived.ts:276-280,327-335`) → `await assembleCharacter(worldId, characterId, ...)` **independently** (a second, separate call), then `await getWorldRuntime(worldId)`, then evaluates the Rules Engine.
- **These two `await`s have no data dependency on each other** — `getDerivedCharacter`'s result is read only for one ability modifier; nothing about it depends on `getCharacterActions`'s own output, and vice versa. They are written sequentially, not `Promise.all`'d. **This is pre-existing code, not touched by either `0531335` or `f842968`** — confirmed via `git log -p` on `character-actions.ts` showing this shape predates both.

`assembleCharacter` (`server/utils/character-assembly.ts:465-...`) itself is a substantial sequential chain: an entity existence fetch (`:505-512`, Directus), then a 7-block `block_instances` batch fetch run in parallel with the Postgres-direct resources read (`:539-566`, already fixed for cache-coherency in an earlier, unrelated pass), then (after those resolve) `getWorldGameplayCatalogueWithHomebrewSpells(worldId)` (`:621`) → `getWorldContentCatalogue` → `resolveEffectiveContent` → see §2.5. **Every one of these stages was already sequential before either of the two named commits** — `assembleCharacter`'s own shape is unchanged by this session's work.

### 2.4 Broadcast / persistence

`broadcastRollEvent` (`server/utils/roll-realtime-bridge.ts`, not read in detail) is the SSE in-process fan-out the roll system's own design doc (`eldra-roll-system.md` §10) already documents as a same-process `Map` — no network call, should be near-instant. The existing `[roll-perf]` log already isolates this stage's own duration; if it were slow, that would show up directly in server logs as a large `broadcast=` number, pointing away from this report's own hypothesis.

### 2.5 Catalogue / effective-content resolution — where commit `f842968` actually lands

`getWorldContentCatalogue` (`server/utils/world-content-catalogue.ts:464-490`) → when `ELDRA_EFFECTIVE_CONTENT` is enabled (confirmed it must be, in production, for the owner's own "editing a Workspace item affects an equipped weapon" observation to be possible at all) → `resolveEffectiveContent` (`server/utils/world-effective-content.ts:296-...`):
```
297  const [catalogue, bindings, lineages] = await Promise.all([...])   // already parallel
318  const workspaceBindings = bindings.filter(b => b.bindingMode === 'workspace' && b.workspaceId)
319  for (const binding of workspaceBindings) {
320    const result = await loadWorkspaceAsSource(binding.workspaceId, String(worldId))   // SEQUENTIAL, one await per binding
```
**This `for` loop is sequential, not `Promise.all`'d, and is pre-existing** (not introduced by either named commit) — but `loadWorkspaceAsSource` itself (`server/utils/world-content-sources.ts:168-...`) is exactly what `f842968` changed:

- **Before `f842968`**: a cache hit (`cached.revision === workspace.revision`) required **zero** extra round trips beyond the `getContentWorkspace` Directus call every call already made.
- **After `f842968`**: every single call — cache hit *or* miss — now also calls `readEffectiveWorkspaceRevision` (`world-content-sources.ts:56-64` as of that commit) → `readWorkspaceRevisionAtomic` (`content-workspace-entity-atomic.ts`), a **new, mandatory, direct-Postgres round trip** (`pool.connect()` + one `SELECT`), *before* the cache-hit check can even run. On a cache miss, `listAllWorkspaceEntityDetails` *also* now tries a direct-Postgres page read first (`readWorkspaceEntityRowsPageAtomic`), falling back to Directus only on `ContentWorkspacePersistenceUnavailableError`.

**This is a real, confirmed increase in round-trip count, multiplied by both pre-existing sequential patterns above**: 2 (independent `assembleCharacter` calls per roll, §2.3) × N (bound workspaces, sequential loop, §2.5) = 2N new mandatory Postgres round trips added by `f842968`, on every single attack/damage roll, where zero existed on a cache hit before.

---

## 3. Timing table and repeated-work counts

### 3.1 Repeated work (confirmed by code trace, not measurement)

| Per ONE "Shortbow Damage" click | Count | Introduced by |
|---|---|---|
| `assembleCharacter` full assembly | **2** (via `getCharacterActions` + `getDerivedCharacter`, sequential, no data dependency) | Pre-existing (predates both named commits) |
| `getWorldContentCatalogue`/`resolveEffectiveContent` resolution | 2 (one per `assembleCharacter` call above) | Pre-existing |
| `loadWorkspaceAsSource` calls | 2 × N bound workspaces (sequential `for` loop, both inside and across the 2 assemblies) | Pre-existing loop shape; **new mandatory cost per call** from `f842968` |
| New direct-Postgres round trips (`readWorkspaceRevisionAtomic`, and `readWorkspaceEntityRowsPageAtomic` on a miss) that **did not exist before `f842968`** | 2N (revision checks alone; more on any cache miss) | **`f842968`** |
| Duplicate roll submissions | Not observed/traced this session — not reachable from static code reading; would need the owner's own network tab (§8) | — |

N = number of `binding_mode: 'workspace'` bindings on Bobbert Jr's World. Not known for the real World this session had no access to; the diagnostic measurement below used N=1 and N=2 to bound the effect.

### 3.2 Measured (real disposable Postgres, same Docker host as the Nitro-equivalent test process — i.e. near-zero network latency; see the caveat in §4)

All runs: 8–10 samples per row, `performance.now()`, min/max/mean reported (never a single run presented as p95).

| Measurement | n | min (ms) | max (ms) | mean (ms) |
|---|---|---|---|---|
| `pool.connect()` alone (cold+warm mixed) | 10 | 0.10 | 13.50 | 1.74 |
| `readWorkspaceRevisionAtomic` alone | 10 | 0.23 | 21.17 | 2.72 |
| `readWorkspaceEntityRowsPageAtomic` alone | 10 | 0.55 | 2.51 | 1.05 |
| `loadWorkspaceAsSource`, 1 workspace, **cold** (cache cleared every call) | 8 | 1.04 | 9.18 | 2.90 |
| `loadWorkspaceAsSource`, 1 workspace, **warm** (cache hit, still re-checks revision) | 8 | 0.36 | 3.88 | 1.06 |
| **Simulated one roll**: 2 assemblies × 2 bound workspaces = 4 `loadWorkspaceAsSource` calls, sequential | 8 | 4.28 | 9.31 | 6.87 |
| Equivalent **pre-`f842968`-style** calls (2 entity-list reads only, no revision check) | 8 | 1.28 | 3.97 | 2.57 |

**Reading this honestly**: the *mechanism* `f842968` added is real and measurable (≈6.9ms vs ≈2.6ms for the equivalent pre-fix shape — roughly 2.6× the round-trip cost for this one piece, in this low-latency environment). **It is nowhere close to a multi-second delay on its own.** See §4. (The exact click-to-dice interval the owner actually experiences is still unmeasured — see the correction at the top of this document and §11.)

---

## 4. Dominant bottleneck — evidence and confidence

**Confidence: low-to-moderate that any single named commit is the full explanation. Moderate-to-high that the dominant structural issue is sequential, un-parallelized round-tripping that predates both commits, which `f842968` made measurably (but not, on this evidence, catastrophically) worse.**

What is **confirmed**:
- `f842968` added a real, mandatory, new round trip to `loadWorkspaceAsSource` that did not exist on a cache hit before (§2.5).
- `resolveAttackAction` runs two fully independent, data-independent `assembleCharacter`-triggering calls strictly sequentially, and has done so since before either named commit (§2.3).
- `resolveEffectiveContent`'s per-workspace-binding loop is sequential, not parallel, and has been since before either named commit (§2.5).
- None of the above three facts individually reduces freshness or correctness if parallelized — they are independent reads being awaited one-at-a-time for no data-dependency reason.

What is **not confirmed**:
- That this mechanism, at the round-trip latency this session could measure (single-digit milliseconds, same-host Postgres), explains a multi-second delay on the scale the owner described ("several seconds"). For the *measured* mechanism alone to produce a delay in that range, each of the ~2N new round trips `f842968` added would need to average on the order of a full **second or more** in production — several orders of magnitude above this session's local measurement. That gap can only be explained by something about production's actual Postgres connection (cross-host network latency, TLS handshake cost per connection, connection-pool exhaustion hitting `connectionTimeoutMillis: 5000`, or some other production-specific factor) that a same-Docker-host disposable instance cannot reproduce — or by this not being the dominant mechanism at all (§11 is designed to tell these apart).
- Whether the *pre-existing* sequential chain (2× `assembleCharacter`, each with its own several-stage sequential Directus/Postgres fetch) was already close to the owner's perceptible-delay threshold before `f842968`, such that `f842968`'s addition was "the straw that broke the camel's back" rather than the sole cause. This is **plausible and consistent with the owner's own framing** ("after the recent content/mechanics and cache-freshness changes") but not provable from this session's evidence alone.
- Anything about the **client-side** stage (§2.2's `queue+animation` bucket) — not measured this session at all. The brief's own hypotheses ("is the browser main thread or renderer initialization the dominant delay?") remain genuinely open.
- Whether Items Mechanics (`0531335`) itself added cost to this specific path beyond what `f842968` later changed — `resolveEffectiveItemData` (the mechanics-merge function `0531335` added) is a pure, in-memory, no-I/O function call (confirmed by its own code, re-read for this report) on the critical path inside `world-content-sources.ts`'s entry-building loop; it is not a plausible source of multi-second latency by itself. `0531335` is very unlikely to be the direct cause; it is more likely that `f842968` (deployed to fix a real correctness bug `0531335`'s own testing surfaced) is the commit that actually changed this path's I/O shape.

**Verdict, stated plainly**: the recent commits most likely **exposed and marginally worsened** a pre-existing, already-fragile sequential round-tripping pattern in the roll pipeline, rather than being its sole root cause from nothing. The magnitude gap between what was measured locally and what the owner observed is the single biggest open question, and it points at production-specific network/connection behavior this investigation had no access to.

---

## 5. Smallest justified fix, benefit, and correctness risk

**Not implemented this session (investigation only, per the brief).** Named here as the bounded next step once the open evidence (§8) narrows which stage actually dominates in production.

1. **Parallelize `resolveAttackAction`'s two independent awaits** (`character-actions.ts:398` and `:426`) via `Promise.all([getCharacterActions(...), getDerivedCharacter(...)])`. Zero data dependency between them (confirmed §2.3); this does not change what is fetched, cached, or trusted — only that it happens concurrently instead of sequentially. **Risk: very low.** Benefit: roughly halves this stage's wall-clock cost regardless of what the per-round-trip cost turns out to be in production, since it eliminates one full sequential repetition of the entire `assembleCharacter` + catalogue chain's wall-clock time (not its total work — the redundant computation itself is a separate, larger, explicitly-deferred question, see §6).
2. **Parallelize `resolveEffectiveContent`'s per-binding loop** (`world-effective-content.ts:319-320`) via `Promise.all(workspaceBindings.map(binding => loadWorkspaceAsSource(...)))`, with the existing sequential error-handling (`packs.push(...)` on failure) adapted to the settled-results shape. **Risk: low** — each binding's resolution is already independent and already writes to the SAME in-process `sourceCache` keyed per-`(workspaceId, worldId)`, so no new interference is introduced; needs a quick check that nothing currently relies on failure ordering (unlikely, given each iteration's failure handling is self-contained).

Both fixes reduce **wall-clock latency only**, by removing unnecessary serialization — neither touches what gets fetched, cached, trusted, or served stale. They do not weaken the freshness guarantee `f842968` added (per the brief's own explicit instruction not to trade freshness for speed) — they simply stop paying for independent reads one-at-a-time.

**Not recommended without further evidence**: reverting or weakening `f842968`'s freshness fix. §4 does not show it is the dominant cause, and the correctness bug it fixed (a false save-conflict loop and stale catalogue data) was real and owner-confirmed as worse than a performance regression would be if freshness regressed silently.

---

## 6. Explicitly out of scope / deferred, not solved here

- **Reducing the total REDUNDANT work** (not just its sequencing) — e.g., caching `assembleCharacter`'s result for the lifetime of one request so `getCharacterActions` and `getDerivedCharacter` share one assembly instead of computing two. This is a larger, more invasive change (a request-scoped memoization layer, or restructuring `resolveAttackAction` to assemble once and derive twice from the same blueprint) that touches more call sites and deserves its own review, not a same-session bundled fix.
- Any change to `character-combat.ts`'s own RNG/dice math, roll authority, event ordering, or visibility — none of this report's findings implicate them, and the brief explicitly forbids touching them for a performance reason.
- The parallel, unrelated, uncommitted "World*Dice*" renderer work (`WorldAuthoredDiceRenderer.vue`, `authoredD20Orientation.ts`, `worldAuthoredDiceRendererAdapter.ts`) — **still not touched, not implemented against, not reverted.** **Correction/update to the original version of this section**: a one-line check this revision added (`grep -rl "setRenderer(" app/`) shows `WorldDiceOverlay.vue` DOES call `diceQueue.setRenderer(...)`, registering either `createAuthoredThreeDiceRendererAdapter` or `createWorldDiceThreeRendererAdapter` depending on `useDiceRendererMode()`. This means `eldra-roll-system.md` §11's own "Phase 3A, no renderer registered yet, fixed `PLACEHOLDER_ANIMATION_MS` wait" framing is **stale relative to current code** — a real renderer (from the `WorldDiceThreeRenderer`/`WorldAuthoredDiceRenderer` family, not `EldraDiceBox.client.vue`) is registered today, and `useWorldRolls.ts`'s client-side `queue+animation=` number therefore reflects that REAL renderer's actual `play()` duration, not a fixed placeholder. This was a one-line `grep`, not a renderer investigation — which adapter is active, what `play()` actually does, and whether it has a cold-start asset/initialization cost were **not read this session** and remain the right next question if §11's client timings point at `queue+animation` as the dominant stage.

---

## 7. Focused regression/performance verification plan (for whoever implements §5)

1. Unit/integration test proving `resolveAttackAction`'s two calls now run concurrently (e.g., mock both collaborators with artificial delays, assert total wall-clock ≈ max(delay1, delay2) rather than delay1+delay2).
2. Same shape for `resolveEffectiveContent`'s binding loop with 2+ mocked bindings.
3. Re-run this session's own diagnostic measurement (§3.2's shape — not committed, see §9) after the fix, confirming the "simulated one roll" number drops toward the single larger of the two previously-sequential costs, not their sum.
4. `tests/server/utils/character-combat.test.ts` and the existing `roll-events.ts`/`character-actions.ts` test suites must stay green unchanged (no behavior change, only concurrency).
5. Manual: the existing `[roll-perf]` logs (client §2.2, server §2.3) should show `actionResolution=` drop measurably after the fix, with `total=` on the client side moving toward the documented budget.

---

## 8. Evidence still needed from production — exact owner steps

**No production access was used or requested beyond what was already explicitly authorized in prior sessions for the disposable instance.** The single most valuable piece of evidence is already instrumented and shipped — it just needs to be read:

1. Open the Character Sheet for Bobbert Jr in a real browser, open DevTools → Console, clear it.
2. Click "Shortbow Damage" once (a "cold" click) and once more shortly after (a "warm" click).
3. Copy the `[roll-perf] client "Shortbow Damage" ...` lines (from `useWorldRolls.ts`'s own `logClientRollPerf`) — these already report `network=`, `queue+animation=`, `total=` in milliseconds.
4. Separately, pull the server-side log lines for the same clicks (the production container's stdout) — look for `[roll-perf] action damage roll total=... (actionResolution=... openDice=... persistence+displayName=... broadcast=...)`.
5. Report back all numbers (client + server lines) verbatim, plus roughly how many Content Workspaces are bound to that World (Admin → World → Content, or however that's surfaced today) if easily visible.

This single artifact (no cookies, no tokens, no entity payloads — just log lines already written to existing logs) would answer, almost immediately: whether `actionResolution` (this report's own hypothesis) or something else (`persistence+displayName`, `broadcast`, or the client's own `queue+animation`) actually dominates in production, and by how much — closing the single biggest open question in §4.

If a repeat click already shows a much shorter `actionResolution`/`network` number than the first, that alone would point at a cold-start/connection-warming effect (consistent with §4's production-latency-gap theory) rather than a per-click structural cost.

**See §11 for the complete, verified, copy-paste operator procedure** (exact browser steps, the Swarm-aware VPS log-capture command, redaction guidance, and the gap this instrumentation cannot currently fill) — this section was the first-draft sketch; §11 supersedes it on specifics.

---

## 9. Diagnostic changes made this session

**None persisted.** One temporary, clearly-marked Vitest integration test (`tests/integration/zzz-latency-diagnostic.integration.test.ts`, prefixed `zzz-` and headed "TEMPORARY DIAGNOSTIC -- not committed, deleted after use") was created, run against the disposable Postgres instance to produce §3.2's numbers, and **deleted** before this report was written. No production system, credential, or data was touched. The disposable instance's role grants (`eldra_workspace_writer` password reset, a scoped temporary `eldra_test_admin_temp` role) were created and torn down exactly as in the two prior sessions' own documented pattern, leaving the instance in the same state it was found in.

---

## 10. Git status

Nothing changed. `git status` at the end of this session shows only the same pre-existing, unrelated dirty files this and prior sessions have consistently preserved (`character-decisions-presentation-backlog.md`, `WorldDiceThreeRenderer.client.vue`, `backfill-media-world-scope.mjs` + its test, and the untracked `WorldAuthoredDiceRenderer.vue`/`authoredD20Orientation.ts`/`worldAuthoredDiceRendererAdapter.ts`/their tests/`.github/copilot-instructions.md`/the architecture docs) and the pre-existing stash (`WIP on main: 6c97930 feat(network): introduce Transportation Junctions`). Nothing was added, nothing was committed, nothing was pushed.

---

## 11. Operator Procedure — Collecting the Shipped `[roll-perf]` Diagnostics

Verified against current code this revision. No step here requires a code change, a flag, or production access by this session — it is handed to the owner to run themselves.

### 11.1 Enable diagnostics — not required

Both `[roll-perf]` log lines are unconditional in shipped code today — no env var, no feature flag, no debug mode gates them:

- Client: `app/composables/useWorldRolls.ts:160`, inside `logClientRollPerf`, called unconditionally from `revealAfterAnimation` (`:170-176`).
- Server: `server/utils/roll-events.ts:108-112`, `logRollPerf`, called unconditionally from `createActionDamageRollEvent` (and every other `create*RollEvent`).

Nothing to turn on. Proceed straight to collection.

### 11.2 Browser steps (Console + Network)

1. Open the Character Sheet for Bobbert Jr, Actions tab, in a real browser against production.
2. Open DevTools → **Console**. Confirm the level filter includes "Info"/default-level logs (not just Errors/Warnings) — `console.log` output is filtered out if the level dropdown has been narrowed. Clear the console.
3. Open DevTools → **Network** in a second tab/panel, filter to `rolls` (matches the `POST /api/worlds/:id/rolls` request), and leave it open and recording across all four clicks in §11.4.
4. Perform the four rolls per §11.4. Do not close or reload DevTools between clicks — a reload clears both panels and breaks correlation.
5. For each of the four `POST .../rolls` requests in the Network panel, open its **Timing** tab and note **Waiting (TTFB)** — this is an independent cross-check against the client's own `network=` figure in the Console line, and separately exposes any main-thread blocking that delays the request from being *sent* at all (which `network=` alone would not distinguish from server-side slowness).
6. Do not open the Response/Preview tab's body or the Headers tab for capture purposes — see §11.6.

### 11.3 VPS log-capture command (discovers the current service; dumps no environment variables)

Confirmed this revision: the deployment is a Docker **Swarm** service, not a bare container, and its task-id suffix was directly observed to rotate across redeploys within this same session (`ledouxvps-eldraweb-tgixbr.1.fjxp97s1t0b3b6mru6ggve6q4` → later `....1.l5954n6vojfxpaxcc9qmtwiwe`) while the service-name prefix (`ledouxvps-eldraweb-tgixbr`) stayed stable. **Do not hardcode the full name or task id** — discover it fresh each time:

```bash
# Step 1 — find the current service name (substring match, never the full rotating name)
docker service ls --filter "name=eldraweb"
```

Take the exact `NAME` column value from that output (it will look like `ledouxvps-eldraweb-<hash>`, but confirm the current hash rather than assuming it matches any value written in this document) and use it below:

```bash
# Step 2 — stream ONLY new log lines from this moment forward, filtered to roll-perf
docker service logs -f -t --tail 0 <service-name-from-step-1> 2>&1 | grep --line-buffered 'roll-perf'
```

- `--tail 0` means "nothing historical" — the stream starts empty at the moment you run it, so run this command *first*, then go perform the four clicks in the browser. This avoids scrolling through (or ever capturing) any unrelated historical log content.
- `-f` follows live; `-t` timestamps each line (useful for cross-checking ordering against the browser Console timestamps).
- `grep 'roll-perf'` is the safety boundary: only lines containing that literal string ever reach the terminal. This deliberately excludes `docker service inspect`, `docker exec ... env`, or any other command that would print the container's environment variables or config.
- Use `docker service logs` (not `docker logs <container-id>`) specifically because it is Swarm-aware and keeps working across a task replacement mid-session; a plain `docker logs` against one task id would go stale the moment Swarm reschedules that task.
- Stop the stream with Ctrl+C once all four rolls are captured.

### 11.4 The four rolls — exact sequence

Perform these **one at a time**, waiting for each roll to fully finish (die stops, result appears in the Roll Tray) before clicking the next:

1. **Roll 1 (cold)** — click "Shortbow Damage" once. Wait for it to fully resolve.
2. **Roll 2 (warm)** — click "Shortbow Damage" again. Wait for it to fully resolve.
3. **Roll 3 (warm)** — repeat.
4. **Roll 4 (warm)** — repeat.

Strict one-at-a-time sequencing matters because neither log line carries a shared request/roll ID (confirmed by their exact format strings, below) — the only way to correlate a given client line to its server line is by **position in time**, which only holds if the four rolls never overlap. **If §13.4's verbose diagnostics are also enabled**, this one-at-a-time requirement gets stricter still: run this capture during a quiet moment on the server (no other active players on that World, ideally no other traffic at all) — nothing at that deeper layer carries a request id either, so an unrelated concurrent request on the same server could interleave its own `[roll-perf:*]` lines into the capture and make position-based correlation wrong, not just imprecise.

### 11.5 Exact lines to return, and how to correlate them

**Client** (DevTools Console), exact format from `useWorldRolls.ts:160`:

```
[roll-perf] client "Shortbow Damage" network=<N>ms queue+animation=<N>ms total=<N>ms
```

**Server** (VPS log stream), exact format from `roll-events.ts:111` as populated by `createActionDamageRollEvent` (`roll-events.ts:744+`):

```
[roll-perf] action damage roll total=<N>ms (actionResolution=<N>ms openDice=<N>ms persistence+displayName=<N>ms broadcast=<N>ms)
```

Return all 4 client lines and all 4 server lines, in the order they occurred. **Correlation method**: match the 1st client line to the 1st server line, 2nd to 2nd, and so on, purely by chronological order — there is no ID field in either format to match on instead, so this only works because §11.4 required the rolls to be performed strictly sequentially. If the Console and the VPS terminal were both timestamped (Console's own timestamps, and `-t` on the `docker service logs` command), include those too as an extra ordering check.

### 11.6 Sensitive fields — what to redact, what's already safe

- The `[roll-perf]` lines themselves, as shipped, contain **no accountId, characterId, worldId, token, cookie, or dice values** — confirmed directly from both format strings above (only a static label string plus millisecond numbers). **No redaction is needed on these lines.**
- The risk is not the `[roll-perf]` lines — it's capturing *more* than them. Do **not** paste or screenshot:
  - The Network tab's Request/Response **body** for the `POST .../rolls` call — it contains `rollerUserId`, `actorCharacterId`, `worldId`, and the full rolled-dice payload.
  - Any `Authorization` header or the `eldra_session` cookie value, visible in the Network tab's Headers view.
  - Any other log line the VPS stream might emit — this is exactly why §11.3's command pipes through `grep 'roll-perf'` rather than capturing the raw stream.
- Safe to share: the 8 `[roll-perf]` text lines (4 client + 4 server), the 4 Network-tab **Timing**-tab numbers only (not headers, not body), and the rough Content-Workspace-binding count from §8 step 5.

### 11.7 Gap this instrumentation cannot currently fill

The original brief asked for two separate client-side intervals: click → **first visible die**, and click → **final settled result**. The shipped client log only provides one combined number for this whole span. Per `useDiceAnimationQueue.ts`'s own lifecycle comment, `enqueue()`'s returned promise resolves only once animation state reaches `'complete'` — i.e. `queue+animation=` (and therefore `total=`) measures click → **animation fully settled**, not click → first-visible-die. There is no shipped log line today that isolates "time until the die starts tumbling" from "time until it finishes and the result is revealed." If §11.5's numbers point at `queue+animation` as the dominant stage, the next step is adding a *new*, explicitly-marked temporary instrumentation point inside `useDiceAnimationQueue.ts` (not something this procedure can read from existing logs) — not something to infer from today's single combined number.

---

## 12. Subdividing `actionResolution`, root-causing it, and the bounded fix implemented this revision

Owner-supplied production evidence (four sequential Shortbow Damage rolls) established `actionResolution` at 98%+ of server roll time (2,732–3,556ms of 2,762–3,577ms totals) — `openDice`/`persistence+displayName`/`broadcast` are all sub-50ms and not implicated. This section subdivides `actionResolution` itself, reproduces through the actual roll route (not a narrow microbenchmark), and implements the smallest fix the evidence justifies.

### 12.1 CPU hypothesis tested and ruled out

`resolveAttackAction` → `getCharacterActions`/`getDerivedCharacter` → `getWorldRuntime` → `createWorldRuntime` (`app/lib/rules/world-runtime.ts`) builds a fresh `RulesRegistry` + `DependencyGraph` on every call, by design, with **no caching at any level** (that module's own design decision 4: "A cache is meaningful only once there is I/O to avoid repeating; this function has none"). This runs TWICE per attack/damage roll before this revision's fix (see §12.2) and was a real candidate for a pure-CPU, network-latency-independent multi-second cost.

**Tested directly**, this revision: a temporary diagnostic (deleted after use, see §12.4) loaded the REAL, currently-authored `packages/eldra-dnd5e-2024` package (409 definitions, ~127KB, hydrated through the same `hydrateExpressions`/`parseExpression` pipeline `scripts/directus/publish-rules-package.mjs` uses before anything is stored or run — not a toy fixture) and called `createWorldRuntime` 10 times.

**Result: 0.5–3.4ms per call** (cold 3.4ms; warm mean ≈1.4ms). **Ruled out** — registry/dependency-graph construction is not, and cannot plausibly be, the multi-second bottleneck. CPU time does not scale with network distance, so this also would have shown up locally if it were real; it did not.

### 12.2 The actual mechanism: sequential round-trip count, not one slow operation

Re-tracing `resolveAttackAction`'s full call graph (file/line references from this session's earlier reads, re-confirmed):

```
resolveAttackAction
├─ getCharacterActions(worldId, characterId)         [character-actions.ts:250+]
│  ├─ assembleCharacter(worldId, characterId)   #1    [character-assembly.ts:465]
│  │  ├─ GET /items/entities/:id                      (1 round trip)
│  │  ├─ Promise.all([blocks, resourcesAtomic])        (1 round trip, already parallel)
│  │  └─ getWorldGameplayCatalogueWithHomebrewSpells
│  │     ├─ getWorldContentCatalogue → resolveEffectiveContent
│  │     │  ├─ Promise.all([resolveWorldContent, bindings, lineage])  (1 round trip, already parallel)
│  │     │  └─ for (binding of workspaceBindings) loadWorkspaceAsSource(...)  (N SEQUENTIAL round trips)
│  │     └─ getHomebrewSpellCatalogueEntries           (1 round trip, sequential after the above)
│  └─ getDerivedCharacter(worldId, characterId) #A
│     ├─ assembleCharacter(...)                 #2    (identical N+4-round-trip shape repeated)
│     └─ getWorldRuntime → loadWorldRulesConfig (1 round trip) + loadPublishedPackage (cached after 1st hit)
└─ getDerivedCharacter(worldId, characterId)    #B    (BEFORE THIS REVISION'S FIX)
   ├─ assembleCharacter(...)                    #3    (identical N+4-round-trip shape AGAIN)
   └─ getWorldRuntime (again)
```

Each `assembleCharacter` call costs roughly **N+4 sequential round trips** (entity=1, blocks+resources=1, catalogue's parallel trio=1, catalogue's workspace-binding loop=N sequential, homebrew spells=1), where **N = how many Content Workspaces are bound to the World** — a number this session does not have from production (§8/§11 already ask the owner for it). Before this fix, one Shortbow Damage click ran **3 full `assembleCharacter` passes and 2 full `getWorldRuntime` constructions**, for roughly **3(N+4) + 2 ≈ 3N+14** total sequential round trips.

**This is the mechanism the earlier same-host microbenchmark (§3.2) could not see**: that measurement isolated `loadWorkspaceAsSource`'s cache-hit/miss shape in isolation, at same-host Postgres latency (sub-millisecond per round trip). It never multiplied by the TOTAL round-trip count a real roll performs, and same-host latency is roughly 100–1000× smaller than a real cross-network Directus/Postgres round trip would be — exactly why local measurements could not explain production latency, and exactly why the owner's instruction to not guess from fast local numbers was correct. A rough model: at production round trips costing **~150–250ms each** (plausible for a VPS reaching a remote Directus/Postgres over TLS, not verified this session), `3N+14` round trips for N in the 3–5 range lands at **2.9–4.6 seconds** — consistent with the owner's own measured 2.7–3.6 second `actionResolution` range. This is offered as a plausible, order-of-magnitude-consistent model, **not a confirmed root cause** — the real per-round-trip production latency and the real N are both still unmeasured (see §12.5).

### 12.3 Fix implemented: remove one verified-redundant assembly pass (not parallelization)

Per instruction, this does **not** parallelize the two `getDerivedCharacter` calls (that would still perform the same total work, just overlapped) — it removes one of them entirely by sharing one request-scoped result, exactly as asked.

`getCharacterActions` already computes a full `DerivedCharacterResult` internally (to populate Attack Bonus/Spell Save DC on each action row) and discards it. `resolveAttackAction` then called `getDerivedCharacter` a **second, fully independent** time immediately afterward, purely to read `damageAbilityModifier` off the exact same character/World — data the first call had already computed. `resolveCombatAction` (`character-combat.ts`) has the identical pattern for its attacker (the target is a genuinely different character and still needs its own separate call — untouched).

**Change** (`server/utils/character-actions.ts`, `server/utils/character-combat.ts`):
- New `getCharacterActionsWithDerived` (character-actions.ts) — the same body `getCharacterActions` already ran, now also returning the `DerivedCharacterResult` it already computed. `getCharacterActions` becomes a thin wrapper that drops the extra field, so the public contract (`CharacterActionsResult`, and the `GET /api/worlds/:id/characters/:characterId/actions` response shape) is **byte-for-byte unchanged**.
- `resolveAttackAction` now calls `getCharacterActionsWithDerived` and reads `actionsResult.derived` instead of calling `getDerivedCharacter` again.
- `resolveCombatAction`'s attacker side does the same; the target's `getDerivedCharacter` call is untouched (different character — not redundant).
- Reuse is a **plain return value threaded through one function call**, not a cache/memo keyed on any id — there is no module-level state to leak across characters, Worlds, or requests.

**Result**: one Shortbow Damage click now runs **2 `assembleCharacter` passes and 1 `getWorldRuntime` construction** (down from 3 and 2) — eliminating `N+4` round trips (one whole assembly pass) out of roughly `3N+14`, a **~30–35% reduction in total sequential round trips, independent of N** (verified: `(N+5)/(3N+14)` ≈ 35% at N=3, ≈34% at N=5).

### 12.4 Verification performed this session

- **Call-count, before/after, real mechanism (not simulated)**: a temporary Vitest unit test (deleted after use — borrowed the exact mocking harness `tests/server/utils/character-actions.test.ts` already uses, with the REAL `eldra-dnd5e-2024` runtime) called `resolveAttackAction` once and counted `assembleCharacter`/`getWorldRuntime` invocations via `vi.fn()` spies.
  - **After this fix**: 2 `assembleCharacter` calls, 1 `getWorldRuntime` call. ✓ (matches §12.3's prediction exactly)
  - **Before this fix** (re-verified by `git stash`-ing the two changed files and re-running the identical test): 3 `assembleCharacter` calls, 2 `getWorldRuntime` calls for `resolveAttackAction`; 4 `assembleCharacter`/3 `getWorldRuntime` for `resolveCombatAction` (attacker 3+2, target 1+1) — confirming the exact redundancy this fix removes, not an assumed one.
- **[SIMULATED latency, explicitly labeled, not a production measurement]**: the same harness, with both mocks given an artificial 200ms delay (a round number in the right order of magnitude for a real network round trip, not a measured value), measured `resolveAttackAction`'s real wall-clock at **605ms** under the fixed (3-sequential-call) shape; the pre-fix (5-sequential-call) shape is arithmetically `605 × 5/3 ≈ 1008ms` at the same simulated per-call cost. This demonstrates the mechanism (fewer sequential awaited calls → proportionally less wall-clock) under a controlled, labeled latency — it is not a prediction of the real production number, which depends on the real per-round-trip latency and the real N, both still unmeasured.
- **Regression**: full existing suite (`npx vitest run`, no filter) — **314 test files, 6414 tests, all passing**, including `character-actions.test.ts` and `character-combat.test.ts` unchanged/unmodified. No behavior change for any caller other than removing the duplicate internal call — confirmed by the full suite passing with zero test edits.
- **Typecheck**: `pnpm run typecheck` against this change shows the identical error set (same files, same line numbers, same messages — all pre-existing and unrelated: `entity-relationships.ts`, `homebrew/*.ts`, `import-save*.ts`, `players.ts`, `world-memberships.ts`, `worlds.ts`, `world-rules-choice-options.ts`) as a `git stash`-verified baseline with the fix removed. **Zero new typecheck errors.**
- **Lint**: `server/utils/character-actions.ts` and `server/utils/character-combat.ts` individually lint clean (`npx eslint` on just those two files: no output, no errors). The project-wide `pnpm run lint` run shows ~5,963 pre-existing problems across the test suite (mostly `@typescript-eslint/no-explicit-any` in test files) that are unrelated baseline debt, not something this change touched or worsened — neither changed file appears anywhere in that output.
- **Build**: `pnpm run build` was started; see the live continuation note below for its result if it finished after this section was written, or re-run it before deploying if not.

### 12.5 What is NOT fixed here, and why (smallest-justified-fix discipline)

- **`getCharacterActionsWithDerived` itself still runs `assembleCharacter` TWICE internally** (once directly, once again inside its own `getDerivedCharacter` call) — this is the SAME pre-existing redundancy §6 of this document already identified and deferred ("Reducing the total REDUNDANT work... touches more call sites and deserves its own review"). Fixing it means giving `getDerivedCharacter`/`getDerivedCharacterInternal` (`character-derived.ts`) a way to accept an already-assembled blueprint, which has a much larger caller fan-out (`character-resource-actions.ts`, `encounter-actions.ts`, `character-recovery.ts`, `character-cast.ts` — 3 separate call sites, `create-v2.post.ts`, `resources.put.ts`, `derived.get.ts`) and touches a public module contract more callers depend on. **Deliberately out of scope this revision** — the fix implemented here is bounded to the one redundancy with direct, measured evidence behind it (the owner's own four-roll numbers implicate `resolveAttackAction`'s path specifically).
- **The identical duplicate pattern exists throughout Spell Casting** (`character-cast.ts`): every one of `castSpellAttack`/`castSpellAutomaticDamage`/`castSpellHeal`/`castSpellSave`/`castSpellUtility`/`castSpell`/`rollIndependentSpellDamage` calls `resolveCastableSpell` (→ `getCharacterActions`, one `getDerivedCharacter` pass) and then separately calls `checkSpellSlotAvailability` and/or `checkResourceCastAvailability` (each → another independent `getDerivedCharacter` pass) — the same redundancy, found while checking "all callers" per instruction, but **not fixed here**: no production evidence implicates spell casting specifically, and `checkSpellSlotAvailability`/`checkResourceCastAvailability`'s call signatures (`requestedLevel`/`resourceId`, not the full actions-result shape) would need their own restructuring to accept a pre-fetched `derived` — a second, separate bounded fix, not a one-line reuse like §12.3's. **Identified and flagged for its own future review, not silently left alone or silently fixed.**
- **The N-sequential-workspace-binding loop itself (`world-effective-content.ts:318-320`, `f842968`'s own shape) is still sequential, not parallelized** — explicitly deferred per this turn's own instruction ("Do not implement the proposed parallelization yet"). This is very likely still the single largest remaining contributor to `actionResolution`'s wall-clock (it dominates `assembleCharacter`'s own round-trip count, and §12.3's fix only removed one OF the (now two) `assembleCharacter` passes, not the loop inside either remaining one). §5's original `Promise.all` proposal remains sitting, unimplemented, pending explicit approval and the production evidence in §12.6 below.

### 12.6 Evidence still needed from production, and exact deployment requirement

- **Still needed** (unchanged from §8/§11, now sharper): the real N (how many Content Workspaces are bound to Bobbert Jr's World) and the real per-round-trip Directus/Postgres latency in production — neither is derivable locally. The operator procedure in §11 already asks for N; nothing new to run there.
- **Projected effect of THIS fix alone**, stated as a range, not a promise: roughly a 30–35% reduction in `actionResolution`'s total sequential round-trip count, which — if round-trip count is in fact the dominant mechanism (§12.2's model, not yet confirmed) — would project the owner's own measured 2.7–3.6s down to roughly **1.8–2.4s**. Still a multi-second delay, not a full fix — consistent with §12.5's explicit statement that the larger remaining mechanism (the N-sequential-loop, run twice) is untouched this revision.
- **Deployment requirement**: this fix touches only `server/utils/character-actions.ts` and `server/utils/character-combat.ts` — no Directus schema change, no `scripts/directus/bootstrap.mjs` run required. A normal application deploy (Dockploy flow, unchanged) is sufficient once reviewed/approved/committed/pushed.
- **No production access, commit, push, or deployment occurred this session** — this is a diff awaiting review, exactly as instructed.

---

## 13. Second action-resolution pass — production results, the second redundancy fix, two more CPU hypotheses ruled out, and opt-in stage diagnostics

### 13.1 Production results after deploying `b9fb452`

Four sequential Shortbow Damage rolls, before/after that deploy:

| | actionResolution (ms) | server total (ms) | browser request (ms) | queue+animation (ms) |
|---|---|---|---|---|
| **Before** | 3313.3, 3556.2, 2732.6, 3431.4 | — | 3621, 3932, 2971, 3717 | 1628, 1493, 1488, 1498 |
| **After** | 2233.4, 1811.5, 1776.6, 1820.4 | 2279.0, 1843.2, 1807.1, 1848.7 | 2519, 2054, 2002, 2052 | 1613, 1487, 1492, 1488 |

Average `actionResolution`: 3258ms → 1910ms, a measured **~41% reduction** — close to, and consistent with, §12.6's own projected 30–35%/1.8–2.4s range from local call-count math alone, before any production evidence existed. `queue+animation` is unchanged (expected — this fix never touched the client/renderer). `actionResolution` still dominates server roll time. Four samples remain a comparison, not a percentile — treated as such throughout this section.

### 13.2 Fixing the second redundancy: one assembly for both consumers inside `getCharacterActionsWithDerived`

§12.5 named this explicitly: `getCharacterActionsWithDerived` still ran `assembleCharacter` twice internally (once directly for the actions list, once again inside its own `getDerivedCharacter` call).

**Mutation/normalization check, done before sharing anything** (not assumed): grepped `character-actor-bridge.ts`'s `buildActorState` (the function that consumes an assembled blueprint to build an `ActorState`) for any `blueprint.x =` / in-place `.push`/`.sort()` on blueprint fields — none exist; it only reads blueprint fields to construct a brand-new `ActorBridgeResult`. Grepped `character-actions.ts`'s own actions-list-building code the same way — also read-only. Both consumers of a shared blueprint are therefore pure readers; sharing one object between them carries no new mutation risk beyond what two independently-fetched-but-content-identical copies already had.

**Change**: `character-derived.ts`'s `getDerivedCharacterInternal` (the function behind the public `getDerivedCharacter`) is now a thin wrapper over a newly-extracted `deriveFromAssembledCharacter(assembly, worldId, levelOverride?, tentativeAnswers?)` — everything after its own `assembleCharacter` call, unchanged, just parameterized on an already-fetched `assembly` instead of fetching its own. `characterId` is deliberately not a parameter of the new function (confirmed by grep: nothing after the original `assembleCharacter` line ever read it). `getCharacterActionsWithDerived` now calls `deriveFromAssembledCharacter(assembly, worldId)` directly, reusing the ONE `assembly` it already fetched, instead of calling the public `getDerivedCharacter` (which would fetch its own, second, content-identical copy).

**Result**: `getCharacterActionsWithDerived` now runs exactly **1 `assembleCharacter` + 1 `getWorldRuntime`**, down from 2 + 1 — verified by the same call-count-spy technique as §12.4, git-stash-confirmed before/after (2+1 → 1+1). Combined with `b9fb452`, one Shortbow Damage click now runs a single `assembleCharacter`/`getWorldRuntime` pass end to end, down from the original 3/2.

**Correctness, not just call count**: a temporary regression test (deleted after use) built one blueprint, froze it (`Object.freeze`, a mutation tripwire — any write would throw in strict ESM), ran it through the real `resolveAttackAction`, and separately ran an independently-assembled content-identical copy through the OLD two-assembly shape (`deriveFromAssembledCharacter` called on a fresh, separately-serialized copy). The resulting `byCategory` derived values were asserted `.toEqual()` — **identical**. The frozen-object call also completed without throwing, confirming no write ever reaches the shared blueprint.

**A real regression caught and fixed in the test suite, not production code**: `tests/server/utils/character-cast.test.ts` mocks `character-derived.ts`'s exported `getDerivedCharacter` to let specific scenarios (character-level cantrip scaling, Archfey/Warrior-of-Shadow resource funding) inject a fake derived state. Because `getCharacterActionsWithDerived` now calls `deriveFromAssembledCharacter` directly rather than the mocked `getDerivedCharacter`, 12 tests started reading the REAL (un-faked) derived state for the Actions-list half of a Cast flow while still reading the FAKED one for Cast's own direct `getDerivedCharacter` calls — an inconsistency, not a production bug (production has no such mock; both paths always compute the same real thing, as proven above). Fixed by also routing the mock's `deriveFromAssembledCharacter` export through the same override. All 143 tests in that file pass again; the full suite (315 files / 6415 tests) passes with zero other fallout.

### 13.3 Two more CPU hypotheses tested directly, both ruled out

§12.1 ruled out Rules Registry/Dependency-Graph *construction* (`createWorldRuntime`) as the dominant cost (0.5–3.4ms against the real 409-definition package). This pass measured the two remaining CPU-bound candidates directly, against the same real package, rather than assuming:

- **`deriveFromAssembledCharacter`'s own evaluation pass** (`buildActorState` + one `EvaluationSession` + `evaluate()` over every Value/Collection/Table Definition — 258 Value definitions in the real package): **cold 12.1ms, warm mean 2.0ms** (10 samples). The module's own header claims "rebuilding is cheap" — this is the first time that claim was checked against the real package rather than taken on faith, and it holds.
- (Registry/graph construction, re-confirmed unchanged from §12.1: 0.5–3.4ms.)

**Both CPU-bound stages combined are still two orders of magnitude below the ~1.8–2.2 second `actionResolution` now measured in production.** This strengthens §12.2's round-trip-count model considerably: with CPU-bound work on the whole assembly+derive path confirmed negligible, the remaining time is overwhelmingly likely I/O-bound (Directus/Postgres round trips), not computation — but "overwhelmingly likely" is still not "measured," which is exactly what §13.4 below is for.

**Qualification (explicitly requested, important not to overstate): these measurements rule out computation COST, not production CPU contention.** Both numbers were measured on an otherwise-idle local process with the CPU free to run them immediately. They say "these operations, given CPU time, finish in single-digit milliseconds" — they do NOT say "these operations always GET CPU time promptly in production." A production Node process under concurrent request load, event-loop contention from other requests, GC pauses, or a container CPU limit/cgroup throttle could make the SAME cheap computation take much longer to actually *run* to completion, not because the work grew more expensive but because the process had to wait its turn for CPU. This is a real, different failure mode from "the computation itself is slow," and this session's local measurements say nothing about it either way. §13.4's diagnostics partially address this gap too: `buildActorStateAndEvaluate=` in the new `[roll-perf:derived]` line measures real wall-clock time in the ACTUAL production process, under whatever real contention exists at capture time — if that number comes back meaningfully higher than the 2–12ms measured here in isolation, CPU contention (not I/O) would be the better explanation, and this section's "ruled out" conclusion would need revisiting.

### 13.4 Opt-in, production-safe stage diagnostics (new this revision)

Per instruction ("if disposable measurements cannot explain production-scale delay, provide minimal opt-in stage diagnostics") — local CPU measurements cannot explain it (§13.3), and this session has no way to measure real production Directus/Postgres network latency or the real number of bound Content Workspaces. Rather than guess further, this revision ships new, **opt-in** (default OFF) stage timing across the actual I/O-bound path, gated by one new env var: **`ELDRA_ROLL_PERF_VERBOSE=true`** (or `1`).

Deliberately kept OPT-IN, unlike the existing always-on coarse `[roll-perf]` lines (`roll-events.ts`) — these new lines are much higher volume (one line per Directus call, one per workspace binding per roll) and are meant for a short, deliberate capture window, not permanent production logging. The flag lives in its own tiny module, `server/utils/roll-perf-flag.ts`, specifically so adding it never touches `directus.ts`'s own export surface in a way that would break the several existing test suites that already `vi.mock('./directus', () => ({ ... }))` with a hand-written replacement object (confirmed necessary: adding the flag directly to `directus.ts` broke `world-content-sources.test.ts` immediately; moving it to its own module fixed this with zero other test changes).

**New log lines, what each one covers, and why none of them can leak anything sensitive** (every line logs only a path/operation name, a boolean, a count, and millisecond durations — never a request body, query filter values, response data, or any credential):

- `server/utils/directus.ts` → `[roll-perf:directus#<seq>] <METHOD> <path> <ms>ms` — every `directusServiceRequest` call, with a per-process monotonic sequence number (the only correlation mechanism available at this layer — there is no request/roll id threaded this deep; sequence order is sufficient because the capture procedure already requires one roll at a time).
- `server/utils/character-assembly.ts` (`assembleCharacter`) → `[roll-perf:assembly] entity=<ms> blocksAndResources=<ms> catalogue=<ms> total=<ms>`.
- `server/utils/character-derived.ts` (`deriveFromAssembledCharacter`) → `[roll-perf:derived] getWorldRuntime=<ms> buildActorStateAndEvaluate=<ms> total=<ms>`.
- `server/utils/world-effective-content.ts` (`resolveEffectiveContent`) → `[roll-perf:effective-content] parallelTrio=<ms> workspaceLoop.count=<N> workspaceLoop.total=<ms> workspaceLoop.perIteration=[<ms>,...]ms` — this is the line that finally reveals the real N and the real per-binding cost in production.
- `server/utils/world-content-sources.ts` (`loadWorkspaceAsSource`) → one line per binding, either `[roll-perf:workspace-source] workspaceId=<id> cacheHit=true getWorkspace=<ms> revisionCheck=<ms> revisionAuthoritative=<bool> total=<ms>` or (on a miss) the same fields plus `entityList=<ms> entityListSource=<postgres|directus> entityCount=<n> presentationAndMediaResolve=<ms>`.
- `server/utils/content-workspace-entity-atomic.ts` (`readWorkspaceRevisionAtomic`/`readWorkspaceEntityRowsPageAtomic`) → `[roll-perf:pg] <fn> poolAcquire=<ms> query=<ms>` — this is the "pool wait vs. query" split the brief specifically asked for; `getPool().connect()` (the pool-acquire step) and `client.query(...)` (the actual SQL) are already two distinct `await`s in the existing code, so splitting their timing required no restructuring.

**Known gap, stated rather than hidden**: this does not cover every Directus call on the path — `resolveWorldContent`/`listContentPackBindingsForWorld` (called inside `resolveEffectiveContent`'s own parallel trio) were not traced to confirm they use `directusServiceRequest` specifically (vs. one of the ~15 files' own local `dxFetch` pattern the project's own technical-debt notes already name); if either does, those specific round trips will not show a `[roll-perf:directus]` line. The `effective-content`/`workspace-source` lines still bound that gap from the outside (their own `total=`/`parallelTrio=` timings include whatever those calls cost, even if the calls themselves aren't separately itemized).

**Reviewed and confirmed before shipping, per explicit instruction**:
- **No credentials/connection strings/query parameters/private identifiers in logged paths**: grepped every `directusServiceRequest(\`...\`` call site reachable from a roll (`character-assembly.ts`, `rules-packages.ts`, `world-content-packs.ts`, `content-package-lineages.ts`) — the only thing any of them ever interpolates into its own path is a numeric Directus row id, never a name/slug/email/filter value (filters always travel in `options.query`, which this logger never reads at all). Redacted anyway: `sanitizePathForLogging()` in `directus.ts` replaces any numeric path segment with `:id` before the `[roll-perf:directus]` line is built, so even an opaque row id never appears in a pasted-back log line.
- **No logging when the flag is absent/false**: every new `console.log` across all six touched files is inside an `if (verbose)` block (or, in `directusServiceRequest`'s case, behind an early-return for the non-verbose path) — verified directly by reading the three lines immediately above each `console.log` call site, not assumed.
- **Correlation caveat, stated explicitly**: sequence numbers and nesting-within-one-call are only a valid correlation mechanism if NOTHING ELSE on the server is concurrently resolving a different roll (or any other request that happens to call `directusServiceRequest`) during the capture window — Node can interleave concurrent requests' awaits on the same event loop, and nothing at this layer carries a request/roll id to disambiguate. The owner capture procedure (§11) should be run against a quiet moment (no other active players on that World, ideally no other traffic at all) for this reason, not just "one roll at a time" from the owner's own browser.
- **Database clients released correctly on success and error**: `readWorkspaceRevisionAtomic`/`readWorkspaceEntityRowsPageAtomic`'s pre-existing `try { ... } finally { client.release() }` structure was not changed by this pass — the new timing capture and `console.log` were added strictly INSIDE the existing `try` block, after a successful `connect()` (so a `connect()` failure, which never acquires a client, is unaffected and was never going to call `release()` anyway, unchanged from before) and before the existing `return`. A query error still skips straight to the unchanged `finally`, releasing the client exactly as before this pass.

**Exact deployment/capture instructions for the owner**:
1. Deploy this revision's diff (once reviewed/approved/committed/pushed) — no schema change, no `bootstrap.mjs` run needed.
2. Set `ELDRA_ROLL_PERF_VERBOSE=true` on the running container for a short window (however the Dokploy environment-variable UI/CLI for this service works) and restart/redeploy so the process picks it up.
3. Follow §11's exact browser/VPS-log-capture procedure (one cold + three warm Shortbow Damage rolls, `docker service logs -f -t --tail 0 <service> | grep 'roll-perf'`) — the new `[roll-perf:*]` lines will interleave with the existing coarse `[roll-perf]` lines in the same stream; grepping for `roll-perf` already catches both, no change needed to that command.
4. **Turn the flag back off** after capture (set it back to unset/`false` and redeploy) — it is not meant to run continuously given its log volume.
5. Report back the full set of `[roll-perf:*]` lines for the 4 rolls, plus the `[roll-perf:effective-content]` line's `workspaceLoop.count` (the real N this whole investigation has been missing) and `workspaceLoop.perIteration` array (which binding, if any, is disproportionately slow).

This closes §12.6's "still needed" gap with an exact, safe, reversible mechanism rather than another round of guessing.

### 13.5 Workspace-loading parallelization — still not implemented, and why

Per instruction ("do not parallelize workspace loading speculatively... if evidence justifies it, use bounded concurrency and prove ordering/error behavior with tests") — this revision does **not** parallelize `world-effective-content.ts`'s sequential per-binding loop. The evidence that would justify it (the real N, and whether the loop's *total* time is actually the dominant share of `actionResolution` in production, vs. e.g. one disproportionately slow binding, or Directus round trips elsewhere on the path) does not exist yet — §13.3 narrows the field to "I/O-bound, somewhere on this path," not "specifically this loop." Implementing bounded concurrency now would be exactly the "guess a root cause from fast local measurements" the brief explicitly prohibits. §13.4's diagnostics are built specifically to produce that evidence; parallelizing is the natural next bounded change once it exists, not before.

### 13.6 Verification summary this pass

- **Full suite (corrected, see §13.8 for the count discrepancy this revision resolved)**: 313 files / 6414 tests pass.
- **Typecheck**: byte-identical error output before/after (`git stash` A/B on every file this pass touched) — 908 pre-existing errors, same files/lines/messages, zero new.
- **Lint**: byte-identical pre-existing error set on every touched file (`git stash` A/B) — zero new errors. (An initial pass added unnecessary `eslint-disable-next-line no-console` comments; removed once confirmed the existing shipped `[roll-perf]` line in `roll-events.ts` needs no such comment — `console.log` is not flagged in `server/utils/**` by this project's lint config.)
- **Build**: `pnpm build` exits 0.
- **Regression checks** (per instruction):
  - Equipped-item mechanics edits still affect the next roll — untouched code path (`loadWorkspaceAsSource`'s revision-check logic, `f842968`'s own shape, is read-only reused here, never modified).
  - `f842968`'s authoritative-source/fallback cache guarantee (only cache when BOTH revision and entity-list came from the authoritative Postgres path) — untouched, confirmed by reading the unmodified `if (revisionIsAuthoritative && entityListSource === 'postgres')` guard still gates the cache write exactly as before; the new diagnostics only read these same already-computed values to log them, never alter the condition.
  - Action validation, authorization, roll privacy, randomness, resource semantics — untouched; this pass's only production-behavior change is sharing one already-fetched assembly instead of fetching a second, content-identical one.
  - No duplicate roll/persistence/broadcast — untouched; `roll-events.ts` was not modified this pass.
  - Request-scoped reuse cannot leak across requests/Worlds/characters — the shared `assembly` is a plain return value threaded through one function call's own local scope, never a module-level cache/memo; nothing persists between calls or is keyed on anything that could be confused across requests.
  - Affected callers exercised: `resolveAttackAction` (weapon attack/damage), `resolveCombatAction` (attacker side), and — via the test-suite fix — the full Spell Casting surface (`castSpellAttack`/`castSpellAutomaticDamage`/`castSpellHeal`/`castSpellSave`/`castSpellUtility`, resource-funded and slot-funded) all pass with their exact pre-existing assertions intact.

### 13.7 Production hypotheses vs. established facts, and remaining bottleneck

**Established** (measured, not guessed):
- `b9fb452` produced a real, measured ~41% `actionResolution` reduction in production.
- `actionResolution` still dominates server roll time after that fix.
- Registry/graph construction and the full derived-value evaluation pass are both confirmed, by direct measurement against the real package on an idle local process, to cost low-single-digit milliseconds in isolation. This rules out computation COST as the dominant factor — it does **not** conclusively rule out production CPU contention (scheduling delay under concurrent load, GC pauses, a container CPU limit) as a contributor; see §13.3's qualification.

**Hypothesis, not yet established**: that the remaining time is dominated by Directus/Postgres round-trip count/latency specifically in the Content Workspace resolution path (the sequential per-binding loop and/or the Directus calls inside `assembleCharacter`). This is now the leading, CPU-ruled-out-by-elimination explanation, but §13.4's diagnostics — not yet run against production — are what would actually confirm it and say which specific stage dominates.

**Next measurement**: run §13.4's capture procedure once, with the flag on, for the same 4-roll sequence. That single capture should reveal: the real N, whether the workspace loop or something else dominates `actionResolution`'s remaining time, and whether any one binding/Directus call is disproportionately slow versus the rest — the exact evidence needed before deciding whether §13.5's parallelization is justified.

### 13.8 Review response — test-count discrepancy, diagnostic safety audit, and the CPU-contention qualification

The approving review flagged a real verification discrepancy: §13.6 had reported "315 files / 6415 tests," but the end-of-pass full-suite run actually showed 313 files / 6411 tests. Resolved as follows.

**Root cause, identified from repository evidence, not reconstructed from memory alone**: the committed baseline after `b9fb452` is **313 files / 6411 tests** — not 314/6414 as a prior report in this same document claimed. That 314/6414 figure was itself measured one step too early in the PRIOR pass: full-suite output at that point explicitly noted "this includes my temp diagnostic test file too, since it's at tests/ root and matched by the include pattern" (`tests/zzz-diagnostic-call-count.test.ts`, a temporary diagnostic with exactly 3 `it()` blocks: a `resolveAttackAction` call-count assertion, a `resolveCombatAction` call-count assertion, and a `[SIMULATED 200ms/round-trip]` wall-clock test). That file was correctly deleted immediately afterward per this session's own "TEMPORARY DIAGNOSTIC — not committed, deleted after use" convention, but the suite was never re-run after deletion before the 314/6414 figure was written down — so that number already reflected a file that was about to be removed. Confirmed via two independent pieces of repository evidence: (1) `git status` shows no *tracked* file was ever deleted (this file was never staged or committed — `b9fb452`'s own diff touches only `character-actions.ts`, `character-combat.ts`, and this trace document), so no committed coverage was ever at risk; (2) a stale Vitest cache at `node_modules/.vite/vitest/<hash>/results.json` still carries a file-level timing entry for `:tests/zzz-diagnostic-call-count.test.ts` and for `tests/integration/zzz-runtime-construction-cpu.integration.test.ts` (this pass's OWN earlier CPU-ruling-out diagnostic, also deleted, also never part of any suite-count claim since `tests/integration/**` is excluded from the default `vitest.config.ts` `include` entirely) — direct, on-disk confirmation both files existed and ran. The arithmetic is exact: 314 − 1 file = 313; 6414 − 3 tests = 6411, matching this pass's own correctly-measured 313/6411 exactly.

**Disposition**: temporary diagnostic, correctly deleted — not an accidental removal, not a consolidation of coverage into fewer tests. Nothing from the committed/pushed codebase was ever lost.

**Regression coverage restored anyway, as the stronger fix**: the deleted diagnostic's call-count assertions were themselves a genuine, valuable invariant — "resolveAttackAction/resolveCombatAction/getCharacterActions never run more than one assembleCharacter + one getWorldRuntime pass" — that no *existing* committed test actually asserts (every pre-existing test checks output correctness, which a reintroduced redundancy would not break, only slow down again). Rather than just re-explaining the deleted diagnostic away, this revision promotes its core assertion into **permanent, committed coverage**: three new `it()` blocks were added to the already-tracked `tests/server/utils/character-actions.test.ts` (two: `resolveAttackAction` and `getCharacterActions` each assert exactly 1 `assembleCharacter` + 1 `getWorldRuntime` call) and `tests/server/utils/character-combat.test.ts` (one: `resolveCombatAction` asserts exactly 2 + 2 total — attacker's shared 1+1, target's separate 1+1 — never the pre-fix 3+2). All three pass. This is why the full suite now reports **313 files / 6414 tests** — same 313 files as the true `b9fb452` baseline (no new files; the new assertions live in already-existing files), 3 more tests than 6411 (the 3 new permanent assertions), landing numerically back on "6414" for the right reason this time: durable regression coverage, not a leftover temp file.

**Diagnostic safety audit (per explicit instruction, each checked directly against the code, not assumed)**:
- *No credentials/connection strings/query parameters/private identifiers in logged paths*: confirmed by grepping every `directusServiceRequest(\`...\`` call site reachable from a roll — the only interpolated value anywhere is a numeric Directus row id, never a name/slug/email/filter (filters always travel in `options.query`, which the new logger never reads). A `sanitizePathForLogging()` helper was added to `directus.ts` anyway, replacing any numeric path segment with `:id` before the `[roll-perf:directus]` line is built, so even an opaque row id never appears in a line the owner might paste back.
- *No logging when `ELDRA_ROLL_PERF_VERBOSE` is absent/false*: verified by reading the lines immediately surrounding every new `console.log` call site across all six touched files — each is inside an `if (verbose)` block, or (in `directusServiceRequest`'s case) behind an early-return taken whenever the flag is off. No unconditional line exists.
- *Correlation sufficient to group one roll's stages*: holds only under the existing one-roll-at-a-time capture discipline (§11.4) AND, newly stated explicitly, only if nothing else on the server is concurrently handling a different request during the capture window — neither the coarse nor the new verbose diagnostics carry a request/roll id, so an unrelated concurrent request could interleave its own lines into the capture. §11.4 and §13.4 were both updated with this caveat; the owner should capture during a quiet moment, not merely "one roll at a time" from their own browser.
- *Database clients released correctly on success and error*: confirmed by direct inspection that `readWorkspaceRevisionAtomic`/`readWorkspaceEntityRowsPageAtomic`'s pre-existing `try { ... } finally { client.release() }` structure was not altered — the new timing/log code was added strictly inside the existing `try`, after a successful `connect()` and before the existing `return`; a query error still falls straight through to the unchanged `finally`.

**CPU-contention qualification added** (§13.3, §13.7): this revision's own local CPU measurements (registry/graph construction, derived-value evaluation) rule out computation *cost* as the dominant factor, measured on an otherwise-idle process — they do **not** conclusively rule out production CPU *contention* (scheduling delay under concurrent load, GC pauses, a container CPU limit/cgroup throttle) as a contributor. Both sections now say this explicitly rather than implying "ruled out" applies more broadly than it does. The new `[roll-perf:derived]` line's `buildActorStateAndEvaluate=` field, read from the real production process under real contention, is the one piece of §13.4's diagnostics that would actually distinguish the two if it ever comes back much higher than the 2–12ms measured locally.

---

## Continuation state for the next session

**Superseded by §13 — start there, not here.** (§8's original four-log-line ask and this section's old numbered list are kept below only for history; §13.4 is the current, exact next step.)

**Start here (current):**
1. Review and (if approved) commit/push/deploy this revision's diff (§13.2's shared-assembly fix + §13.4's opt-in diagnostics module).
2. Run §13.4's exact capture procedure once, flag on, 4-roll sequence — this is the single highest-value next step: it will reveal the real N (bound Content Workspaces) and which specific stage (`assembly`/`derived`/`effective-content`/`workspace-source`/`pg`) actually dominates the remaining ~1.8–2.2s of `actionResolution`.
3. Turn `ELDRA_ROLL_PERF_VERBOSE` back off after capture.
4. Based on what dominates: if it's the workspace-binding loop specifically and N ≥ 2, §13.5's bounded-concurrency parallelization (with ordering/error-behavior tests) becomes the justified next bounded change. If it's Directus call count/latency generally, investigate connection reuse/keep-alive on the production `$fetch` client. If one specific binding/call is an outlier, investigate that one directly rather than parallelizing everything.
5. If the client's own `queue+animation` ever becomes the dominant share (not expected — §13.1 shows it unchanged and already smaller than `actionResolution`): redirect to `useDiceAnimationQueue.ts` and whichever adapter `useDiceRendererMode()` currently selects (`worldAuthoredThreeDiceRendererAdapter.ts`/`worldDiceThreeRendererAdapter.ts`, confirmed real, not `EldraDiceBox.client.vue`).

**Prior (superseded) list, kept for history:**
1. Get the owner's four `[roll-perf]` log lines (§8) — superseded by §13.1's actual results and §13.4's deeper capture.
2. If `actionResolution` dominates in production: implement §5's two `Promise.all` changes — **done, as `b9fb452` + this revision's §13.2 fix**, not the originally-proposed Promise.all shape (reuse instead of parallelization, per explicit instruction).
3. If `persistence+displayName` or `broadcast` dominates instead — not the case; §13.1's results confirm `actionResolution` still dominates.
4. (Dice renderer redirect — superseded by point 5 above.)
