# ADR-023 — Server-Authoritative Gameplay Events

**Status.** Accepted (pending push/deploy — this is a documentation-only commit; nothing in this ADR is implemented yet).
**Context.** Designing the Roll System (`eldra-roll-system.md`) surfaced a pattern already present, unnamed, in three of Eldra's existing subsystems. Naming it now, before a fourth and fifth system reinvent it slightly differently, is cheaper than reconciling three divergent styles later.
**Decision.** Every **gameplay event** — a fact about the game world that changes because a player or the game clock acted, not because someone edited a description — is requested by a client, validated and decided entirely on the server, persisted, then broadcast. Clients present; they never decide.
**Consequences.** One mental model for every future gameplay system (combat, initiative, conditions, crafting, downtime, travel, economy, quests, calendar), instead of one bespoke trust model per feature. Every gameplay fact becomes auditable and replayable by construction. The cost is an extra network round trip for anything gameplay actually touches — accepted deliberately, see §14.
**Risks.** Read §14 in full before treating this as a license to route *everything* through the server — §5 exists specifically to stop that overreach.
**Revisit when.** A gameplay system is demonstrably too latency-sensitive for a round trip even with optimistic UI (§14) — not before then, and not as a blanket exception.

---

## 0. Why this ADR exists, and why it isn't about dice

This ADR was written while designing `eldra-roll-system.md`. Read that document for the roll-specific mechanics (OpenDice, `roll_events`, visibility states, the phase plan) — none of that is repeated here. What that design work actually produced, once the roll-specific details were stripped away, was a realization: **the shape of "request → validate → derive → decide → persist → broadcast → present" is not a dice-rolling idea.** It is already how Combat Resolution, Inventory Transfers, and the Rules Engine's own evaluation model work, independently arrived at, in three different subsystems written at different times by different task briefs, none of which cite each other.

That is not a coincidence worth leaving unexamined. It is a convergent architectural instinct that deserves a name, so the next gameplay system (initiative, crafting, downtime — see §4) is *designed toward* this pattern deliberately, instead of *arriving at* a slightly different version of it by accident, the way it happened three times already.

**This ADR would be exactly as true if Eldra had no dice at all.** Nothing below depends on a d20. It depends on Eldra being a *shared, contested, trust-sensitive game state* — which was already true before the Roll System existed, is true of the systems that already conform to it, and will be true of every gameplay system CLAUDE.md's roadmap names for Eldra 2.0/2.1/3.0.

---

## 1. Core decision

> **Gameplay truth is always server-authoritative.**
> Clients request gameplay. Servers decide gameplay. Clients present gameplay.

This is now a permanent architectural rule for this codebase, at the same weight as CLAUDE.md's existing "Known Architectural Boundaries" (client never talks to Directus directly; `.client.vue` suffix for browser-only APIs) — not a per-feature style preference, a load-bearing invariant a reviewer checks every future gameplay PR against.

**"Gameplay" is the operative word**, and it has a precise boundary, drawn in §4/§5: a *gameplay* fact is one whose value another player, a GM, or an audit log could ever have a reason to dispute or need to trust. A UI preference cannot be disputed; a damage total can.

---

## 2. Canonical event flow

Every gameplay event in Eldra, present and future, moves through the same seven stages, in the same order:

```
1. User requests event         (client: "I want to attack", "I want to craft this", "I want to roll Stealth")
        │
        ▼
2. Server validates            (capability check, actor/world access — server/utils/authorization.ts's
        │                       existing can()/requireCapability(), reused, never a bespoke per-feature gate)
        ▼
3. Server derives authoritative state
        │                      (re-reads the actor's own already-computed Rules Engine output —
        │                       never trusts a number the request body supplied)
        ▼
4. Server decides the outcome  (rolls the dice, resolves the check, applies the transfer —
        │                       the one step that is allowed to consult randomness or game rules)
        ▼
5. Server persists the outcome (a durable, queryable record exists before anyone is told about it)
        ▼
6. Server broadcasts the outcome
        │                      (optional, presentation-layer — §8. A single-player action with no
        │                       audience skips this stage; the outcome is no less authoritative for it)
        ▼
7. Clients present the outcome (render the number, animate the dice, update the sheet — compute nothing)
```

Every existing conforming system in §12 can be read against these seven stages with no stage skipped and no stage reordered. A future gameplay system whose design doesn't map cleanly onto this list is the signal to stop and reconsider the design, not to file the mismatch away as an acceptable exception.

---

## 3. Rationale — why this beats the client-authoritative alternative

The alternative this ADR rejects is not hypothetical — it is the default a framework nudges you toward (compute locally, PATCH the result) unless something stops it. Named explicitly, for each of the brief's own examples:

- **Client-computed rolls.** A client that computes "you rolled a 17" and POSTs `{ total: 17 }` is asking the server to trust a number it has no way to verify came from a fair, unmodified process. This is the exact failure mode `eldra-roll-system.md` §1/§13 documents OpenDice's own README warning against, generalized: *any* number a client asserts about a chance outcome is unverifiable by construction, regardless of which dice library computed it.
- **Client-side inventory mutation.** A client that removes an item from its own local state and tells the server afterward has already shown the player "you have it" (or "you don't") before the server has agreed. If the server later disagrees — someone else took the last one first — the client has to *un-show* something the player already believed, which is a strictly worse experience than never having shown it until it was true, and it is exactly the race condition a shared multiplayer inventory needs to resolve authoritatively somewhere.
- **Client-side combat.** Two players' clients computing "did that attack hit" independently can disagree — different cached AC, a condition one client hasn't refreshed, a modifier the other player's browser tab is one refresh behind on. A fight where the two participants' screens can show different outcomes for the same swing is not a bug in either client; it is the predictable result of not having one place gameplay truth lives.
- **Client-side condition tracking.** A condition ("Poisoned", "Prone") that a client applies locally and only later syncs is a condition a GM cannot trust when deciding what a player can do this turn — which is precisely the scenario `world.roll.see_gm`/`world.roll.override` (already-existing capabilities, `server/utils/authorization.ts`) exist to make meaningful for a GM at all.

**What server authority buys, concretely, mapped to the brief's own emphasis list:**

| Property | What breaks without server authority |
|---|---|
| **Trust** | A player can, deliberately or by a stale client, assert a game fact nobody else can verify. |
| **Auditability** | "What actually happened in that fight" has no single answer if two clients computed it independently. |
| **Replayability** | A disputed outcome can only be replayed from a record the server itself produced — a client-computed one was never captured anywhere durable. |
| **Persistence** | Nothing to persist if the fact only ever existed transiently in one browser tab's memory. |
| **Realtime synchronization** | Broadcasting a client's own guess to other clients propagates disagreement, not truth — §8 depends on there being one truth to broadcast. |
| **Future multiplayer** | Every one of the above compounds as headcount grows; a two-player disagreement is a bug report, a six-player one is unplayable. |
| **GM authority** | A GM who cannot see or trust a number cannot exercise §17.8's own already-declared "GM override" (`rules-engine.md`) meaningfully — override requires there to be one authoritative thing to override. |

---

## 4. Applies to

This ADR governs, explicitly, every system CLAUDE.md's roadmap names or implies as a future gameplay feature, whether or not a line of it exists yet:

Dice Rolls (`eldra-roll-system.md`) · Combat · Initiative · Conditions · Inventory Transfers · Crafting · Downtime · Travel · Economy · Quest progression · Calendar events · **any future gameplay system**, named or not, that this list doesn't yet anticipate.

The last clause is deliberate: this is a standing rule for *category membership* (§5 draws the test), not a closed enumeration a future system could argue its way around by not appearing on this list by name.

---

## 5. Does not apply to

**This ADR does not mean every UI interaction requires a server round trip.** That misreading would be a real regression — CLAUDE.md's own Coding Conventions already push business logic to composables/pages and presentation to components precisely so components stay fast and simple; requiring a network call for every click would undo that, not honor it.

Explicitly client-side, no round trip, no exception:

Opening drawers · Changing tabs · Sorting inventory · Filtering actions · Searching · Hover state · Animation · Presentation.

**The test that separates §4 from §5** is not "does this touch data" — nearly everything does. It is:

> **Could another player, a GM, or an audit log ever have a reason to dispute this value, or need to trust that it happened exactly once, exactly this way?**

Sorting the Inventory panel's item list by name is a client preference — nobody disputes *the order rows render in*. Removing an item from the Inventory panel is a gameplay fact — someone could reasonably ask "wait, did that actually happen, and in what order relative to the other thing that happened to that same item." The Desktop IA pass's own `CharacterActionsPanel.vue` filter pills (`Attack`/`Spell`, `resolvable-only`) are a textbook §5 case: filtering which already-fetched actions are visible is presentation, and correctly has zero server involvement today.

**A component may compute a *preview*, provided it is never mistaken for the answer.** `rules-engine.md`'s own ADR-008 (§10 below) already establishes exactly this split for Rules Engine evaluation — client-side preview for responsiveness, server decides for real — and this ADR generalizes that same split to every gameplay system, not just Rules Engine evaluation specifically.

---

## 6. Event model

Four distinct concepts, frequently conflated in casual conversation about "game state," kept deliberately separate here because each belongs in a different place in the codebase:

| Concept | Definition | Where it lives |
|---|---|---|
| **Gameplay Request** | What a client sends: *intent*, never a result — "I want to attack this target with this weapon," "I want to roll Stealth," "I want to move this item from A to B." Structurally identical to what `CharacterActionsPanel.vue`'s existing `resolve`/`select` emits already are, and to `eldra-roll-system.md` §7's `POST /rolls` body. | The client — a composable/component emits it; a thin `server/api/**` route receives it. |
| **Gameplay Event** | What the server produces after step 4 of §2: an immutable, timestamped fact — "this attack happened, here is what the dice showed, here is what changed." Once created, an Event is never edited, only ever superseded by a *later* Event (a GM's reveal/override is itself a new Event referencing the one it revises, never a mutation of the original). | `server/utils/*.ts` orchestrates its creation; a dedicated, append-only collection persists it (§7). |
| **Gameplay State** | The *current* condition an Event caused — this character's current HP, this item's current owner, this Encounter's current round. State is a **projection**, computed by folding the relevant Events forward, or (as most of Eldra already does) stored as the *latest* value and updated by an Event's own persistence step, per system §7's own current-vs-historical judgment call. | `block_instances` rows (current HP, current inventory) or `entities` fields — exactly Eldra's existing persistence surfaces, unchanged by this ADR. |
| **Gameplay Projection** | A read-only derived VIEW assembled from State (and, for anything Rules-Engine-backed, from Rules Engine evaluation over that State) for display — `characterDerivedValues.ts`'s `DerivedValue`, `character-assembly.ts`'s resolved blueprint, `character-actions.ts`'s assembled action list. A Projection computes nothing authoritative itself; it reads what State and the Rules Engine already decided. | `app/lib/**` pure modules + `server/utils/character-derived.ts`/`character-assembly.ts`, exactly as they already work today. |

**The relationship, stated once:** an Event is what *happened*; State is what's *true right now* because of everything that has happened; a Projection is a *lens* onto State for one particular screen. Confusing an Event with State is how a system ends up needing to "replay" something that was never recorded as a discrete fact in the first place (§7). Confusing State with a Projection is how a system ends up with two places claiming to be "the current HP" (exactly the failure `character-derived.ts`'s own `findDerivedNumber` note already warns against for Health — reading the same fact through two different paths).

---

## 7. Persistence — append-only Events vs. current State

**Why gameplay Events should generally become append-only records, not overwritten rows:**

An append-only Event log answers a question a mutable "current value" row structurally cannot: *what actually happened, in what order, and can I prove it?* Overwriting a row destroys the previous value the moment the new one lands — there is no "what was this before," which is precisely the property a disputed roll, a contested trade, or an audited combat log needs.

**When each is appropriate — the two are not competitors, they are two different questions about the same system:**

- **Historical Events** (append-only) answer *"what happened, and when, and who caused it."* Appropriate for anything §4 names: a roll, an attack, a completed trade, a crafted item, a day of downtime spent. Nothing here is ever mutated after creation.
- **Current State** (a mutable row, upserted) answers *"what is true right now."* Appropriate for the *consequence* of an Event — current HP after the damage Event, current inventory contents after the transfer Event. Eldra already does this correctly and consistently: `character-health.ts`'s current-HP row, `character-notes.ts`'s current-notes row — both are exactly the `block_instances` find-then-upsert pattern `eldra-roll-system.md` §6 already contrasted against rolls' own append-only shape.

**The Roll System as the motivating example, stated precisely:** a roll's *State* (if it even has one worth naming) is nothing — nobody needs "the current value of your last Stealth check." A roll's entire value **is** its Event: one fact, permanently true, that either did or didn't happen and either was or wasn't a 17. This is why `eldra-roll-system.md` §6 rejected `block_instances` outright for `roll_events` and proposed a dedicated collection — the roll system is the *purest* case of "this system has Events and effectively no State," which is exactly why it was the system that surfaced this whole pattern: it has no current-value row to accidentally conflate the Event with.

Most future systems in §4 will have **both** — combat has attack Events *and* current-HP State; inventory transfers have transfer Events *and* current-inventory State; crafting will have a crafting-attempt Event *and* a current-item-exists State. Design each new system by asking both questions separately, not by picking one persistence shape and forcing the whole feature through it.

---

## 8. Realtime

**Realtime is an optional presentation layer. It is never where truth is created.**

By the time a broadcast happens (§2 stage 6), the authoritative Event already exists — persisted, in step 5, unconditionally, whether or not anyone is listening. A crash between persistence and broadcast loses a *notification*, never a *fact*: the Event is still there, retrievable by the next `GET`, exactly as `eldra-roll-system.md` §13 already states for the Roll System specifically ("Server stores the result before broadcasting it — a `roll_events` row exists before `broadcastRollEvent` ever fires").

This is why `server/utils/inventory-transfer-realtime-bridge.ts` — the one realtime system Eldra already ships — is correctly named a *bridge*, not a *source*: it relays an Event that was already decided and already persisted through `character-sheet-inventory-transfers.ts`'s own `offerInventoryTransfer`/`acceptInventoryTransfer` server functions. It never originates a transfer itself. Every future realtime surface (§4's systems, once they exist) should be built the same shape: realtime code *fans out* an Event, it never *computes* one.

**Practically:** if a broadcast mechanism (SSE, WebSocket, polling — `eldra-roll-system.md` §10 evaluates the options for one concrete case) is ever down, delayed, or dropped, the correct failure mode is *a client finds out about a true fact later than it would like*, never *a client never finds out, or finds out something false*. A system whose realtime layer's failure could produce the second or third outcome has put decision-making in the transport layer, which this ADR forbids regardless of which transport it is.

---

## 9. Security — trust boundaries

Restated as a standing rule, generalized from the identical language `eldra-roll-system.md` §13 already committed to for rolls specifically:

- **Clients may request.** A request names *intent* — what the player wants to happen — never the outcome.
- **Servers validate.** Every request is checked against `server/utils/authorization.ts`'s existing `Principal`/`can()`/`requireCapability()` — a *new* per-feature permission model is a smell; reuse the existing capability vocabulary (`world.roll.execute`, `world.character.edit_own`, etc.) and extend it with new, equally-named capabilities (`world.craft.execute`, say) rather than inventing a parallel authorization concept.
- **Servers derive.** Whatever number/state the decision needs is re-read from the server's own already-computed source of truth (Rules Engine evaluation, current inventory State, current HP) — never trusted from the request body. This is `rules-engine.md` §17.5's existing principle ("Costs are validated server-side against freshly re-evaluated state, never against client-sent numbers"), generalized here from Rules Engine costs specifically to every gameplay decision.
- **Servers decide.** The one step permitted to consult randomness, apply game rules, or resolve a contested race (two players trying to take the same item first) is server code, exactly once, per request.
- **Servers persist.** Before anyone — including the requester — is told the outcome (§8).
- **Clients present.** Full stop. A client render function that also happens to decide something is a client that has quietly become authoritative for that one thing, which this ADR exists to prevent.

**Never allow a client to author an authoritative gameplay outcome.** Stated as bluntly as the brief itself states it, because this is the one sentence in this whole document a future PR reviewer should be able to recall from memory: *if a number a player sees came from anywhere other than a server response, it is not gameplay truth — it is, at best, a preview (§5's exception), and it must never be persisted, broadcast, or trusted as if it were.*

---

## 10. Relationship to existing ADRs and systems

This ADR does not stand alone — it is the generalization of a principle Eldra had already, independently, adopted twice at a narrower scope, and it is explicitly consistent with the architecture the largest existing design documents already describe. It duplicates none of them; it names the pattern they all already share.

- **ADR-008 — "Isomorphic engine; client previews, server decides"** (`rules-engine.md` §32) is the closest existing precedent, and this ADR is best understood as **ADR-008, generalized from Rules Engine evaluation specifically to every gameplay event Eldra will ever have.** ADR-008's own Context — "Client evaluation is required for responsiveness and can never be trusted" — is word-for-word the same tension this ADR resolves for combat, inventory, crafting, and everything else in §4. Where ADR-008 says "one implementation, server authoritative" for *Rules Engine expression evaluation*, this ADR says the identical thing for *every gameplay decision*, whether or not it happens to touch a Rules Engine expression at all (a coin flip in a downtime mini-game has no `@value:` reference anywhere, and is still governed by this ADR).
- **ADR-003 — "Derived values are never stored"** (`rules-engine.md` §32) is the root of this ADR's Gameplay Projection concept (§6): a Projection, like a derived Rules Engine value, is recomputed from State on read, never cached as if it were itself a source of truth. This ADR does not change ADR-003 — Rules Engine derived values remain unstored exactly as ADR-003 requires — it simply names the *distinct* concept (a persisted Event) that ADR-003 was never about, so nobody mistakes "derived values are never stored" for "gameplay events are never stored," which would be a serious, damaging misreading.
- **`rules-engine.md` §15.8 / §17.4 / §24.3 / §24.4** already state, narrowly, that the server is "authoritative... for all randomness," that rolls take an explicit server-generated seed, and that Value/Action/Roll visibility should be classified from day one even before it's enforced. This ADR is the project-wide version of those three roll-scoped statements — the reason `eldra-roll-system.md` could cite them so directly is that this ADR's pattern was already latent in the Rules Engine's own design.
- **Provider architecture / Module architecture / Character Assembly / Actor Bridge** (`content-source-architecture.md`, `rules-package-architecture.md`, `character-assembly.ts`, `character-actor-bridge.ts`) are **Projection-layer** systems in this ADR's vocabulary (§6) — they resolve *what a character currently has and is*, authoritatively, server-side, but they are not themselves gameplay Events: assembling a character's blueprint from bindings and content packs is not "something happened," it is "here is the current truth, read fresh." This ADR does not change how any of them work; it clarifies that they sit one layer below where a gameplay Event's "derive authoritative state" step (§2 stage 3) reads from — Character Assembly and the Actor Bridge are exactly the kind of already-tested, already-server-side source of truth §9's "servers derive" clause tells a new gameplay system to reuse, not reimplement.

---

## 11. Relationship to the Roll System

**The Roll System is the first major implementation of this ADR — it is not the reason this ADR exists.** Read the two documents in the order they were actually produced, not the order that would make the Roll System look foundational: designing `eldra-roll-system.md` required reconciling the new work against `character-combat.ts` and `roll-engine.ts`/`roll-service.ts`, both of which were *already* server-authoritative before a single line of the Roll System was written. That reconciliation is what surfaced the pattern this ADR names. Dice happened to be the feature already in flight when the pattern became impossible not to notice; they are not what makes the pattern true.

**The test this framing has to survive, stated explicitly:** if Eldra had never added dice rolling at all, would this ADR still be worth writing? Yes — Combat Resolution and Inventory Transfers alone already justify it, and Initiative/Conditions/Crafting/Downtime/Travel/Economy/Quests/Calendar (§4) would each eventually reinvent some version of "request → server decides → persist → tell everyone" on their own regardless of whether a d20 was ever involved. The Roll System is simply the most recently and most visibly documented instance of a rule that was always true.

---

## 12. Implementation impact

**Already following this philosophy today** (verified against source, not assumed):

- **Combat** (`server/utils/character-combat.ts`) — server-generates its own seed (`randomBytes(16)`), rolls server-side, computes hit/damage server-side, returns the outcome; the client (`CharacterActionsPanel.vue`) never computes a result, only renders one it received.
- **Inventory transfer** (`server/utils/character-sheet-inventory-transfers.ts` + `inventory-transfer-realtime-bridge.ts`) — `offerInventoryTransfer`/`acceptInventoryTransfer`/`declineInventoryTransfer` decide and persist server-side; the realtime bridge only relays what already happened (§8).
- **Rules evaluation** (`app/lib/rules/evaluator.ts`, per ADR-008) — the client may preview an evaluation for responsiveness, but the server's own evaluation is what's ever trusted for an actual outcome.
- **Character assembly** (`server/utils/character-assembly.ts`, `character-actor-bridge.ts`) — a Projection-layer system (§6/§10) that already computes every displayed value server-side; V2's own stated architecture ("zero calculation in Vue") is this ADR's §1 rule, already enforced for character data specifically.

**Should migrate toward it** (named, not yet done — each is its own future task, not authorized by this ADR alone):

- **Roll history** — `eldra-roll-system.md`'s own Phase 1–6, already fully scoped; this ADR is the philosophy that plan already embodies, not new work on top of it.
- **Crafting** — not yet designed at all; when it is, design it against §2's seven stages from the start rather than retrofitting them afterward.
- **Future encounter state** (initiative order, round tracking beyond what `encounter-view.ts`/`encounter-actions.ts` already do) — extend the existing Encounter system's already-server-side shape, don't parallel it.
- **Future DM screen** — `eldra-roll-system.md` §5/§9's GM-visibility work (`world.roll.see_gm`, the reveal endpoint) is this ADR's §9 applied to one screen; a real DM screen generalizes that same visibility-filtering discipline across every gameplay system's Events, not just rolls.

---

## 13. Anti-patterns

Each one named here has a concrete, already-avoided failure mode behind it — these are not hypothetical cautionary tales, they are the specific mistakes this ADR exists to make structurally harder to make by accident:

| Anti-pattern | Why it violates this ADR |
|---|---|
| **Client computes authoritative damage.** | The number shown is only as trustworthy as the browser tab that computed it — indistinguishable, to the server, from a modified client asserting whatever number it likes. |
| **Client invents HP.** | HP is State (§6) with real gameplay consequences (death saves, downed status); a client-invented value can silently diverge from what every other client and the server believe is true. |
| **Client mutates inventory first, tells the server after.** | Shows the player a fact before the server has agreed to it (§3's inventory example) — the exact race condition a shared, contested resource needs a single arbiter for. |
| **Client broadcasts gameplay.** | Conflates realtime (§8, presentation) with authority — a client that can broadcast "X happened" to other clients directly has made itself the source of truth, which no client is ever allowed to be under this ADR. |
| **Client determines roll outcomes.** | `eldra-roll-system.md` §1/§13's entire OpenDice-trust-boundary discussion exists because of exactly this failure mode, generalized here beyond dice specifically. |
| **Server trusts client totals.** | The single most dangerous anti-pattern on this list, because it looks like a shortcut rather than a bug: a server that receives `{ total: 24 }` and stores it without re-deriving anything has fully delegated its own authority to the client that sent the request, which is the opposite of everything §1–§9 establish. |

A code reviewer checking a future gameplay PR against this ADR should be able to find the specific row above that a suspicious diff resembles, and cite it directly rather than re-deriving the objection from first principles each time.

---

## 14. Risks

This ADR is not free, and pretending otherwise would make it easy to apply too bluntly (see §5's own warning). Each cost is named, together with how this architecture addresses or knowingly accepts it:

| Risk | How it's addressed or accepted |
|---|---|
| **Latency.** Every gameplay action costs a round trip that a purely client-side implementation wouldn't. | **Accepted, deliberately**, for anything meeting §5's dispute-or-trust test. Eldra is not a twitch-reflex game — a d20 roll, an inventory move, or a crafting attempt tolerating a network round trip is the correct trade for the trust properties in §3. Genuinely latency-critical presentation (§5's list) pays no round trip at all, by design. |
| **Offline mode.** A server-authoritative model has no obvious story for a client with no connection. | **Not solved by this ADR, and not silently assumed away.** Eldra has no offline mode today (`useFetch`/`$fetch` against `server/api/**` already require connectivity for nearly everything), so this ADR introduces no new offline gap — it is an existing, larger, unaddressed product question, not something this document is scoped to answer. |
| **Optimistic UI.** A player expects some feedback before the round trip resolves. | **Addressed, not rejected** — §5's "preview" carve-out is exactly this: a client may show a provisional state (a pending spinner, a locally-computed *preview* number per ADR-08's own precedent) as long as it is visually and structurally distinguishable from the authoritative result and is discarded/corrected the moment the server responds. `character-combat.ts`'s own `resolving` flag (already consumed by `CharacterActionsPanel.vue`) is the existing pattern to extend, not a new one to invent. |
| **Server load.** Centralizing every gameplay decision server-side concentrates load that used to be distributed across clients' own CPUs. | **Accepted at Eldra's current scale** (a self-hosted, small-table VTT, per CLAUDE.md's own Product Vision — not a mass-multiplayer service); revisit if and when real usage data shows the server, not the client, is the bottleneck for a specific gameplay path — not preemptively. |
| **Replay growth.** Append-only Events (§7) accumulate forever with no automatic pruning. | **Named as an open question, not solved here** — `eldra-roll-system.md` §15's own "Persistence volume / pruning" risk applies identically to every future append-only Event log this ADR governs; a retention policy is a separate, future, explicitly-scoped decision for whichever system first needs one in practice. |
| **Scaling.** The realtime bridge pattern (§8, `inventory-transfer-realtime-bridge.ts`) is a single in-process `Map`, correct for one Nitro process, silently incomplete across several. | **A known, accepted limitation at today's deployment shape** (CLAUDE.md's Deployment Checklist: one Dokploy-managed container) — `eldra-roll-system.md` §10 already names the exact same limitation for its own realtime bridge and the exact same fix (a shared pub/sub layer) for whenever the deployment is ever horizontally scaled. This ADR does not require solving it now for every future realtime surface; it requires every future realtime surface be built on the same, already-understood limitation rather than a new, differently-broken one. |

---

## 15. Project Knowledge Review

**1. Why is server-authoritative gameplay a product philosophy rather than a dice implementation?**

Because the property it protects — that a game fact, once it happens, is one thing everyone at the table can trust — has nothing to do with dice specifically. It is exactly as necessary for "did that trade actually go through" or "is this character actually poisoned right now" as it is for "what did the d20 show." Dice made the pattern visible first, purely because the Roll System was the feature already being designed when the reconciliation against `character-combat.ts` and the Rules Engine forced the pattern into the open (§11) — not because dice are architecturally special. Treating it as a dice-only rule would mean re-litigating the identical trust argument from scratch for every one of the systems named in §4, which is precisely the wasted, inconsistent effort this ADR exists to prevent.

**2. Why should gameplay truth and presentation remain separate?**

Because they answer different questions to different degrees of rigor, and conflating them degrades the stricter one. Truth answers "what actually, provably happened," and needs to survive a dispute, a replay, or a GM's scrutiny (§3). Presentation answers "how does this look right now," and is allowed to be provisional, approximate, or even briefly wrong (a die that visually settles on a different face than the authoritative roll, per `eldra-roll-system.md` §11's own documented `@3d-dice/dice-box` limitation) without costing anything, *because nothing that matters was ever sourced from the presentation layer in the first place*. The moment a codebase lets presentation quietly become a source of truth — a client-computed total that just happens to usually match the server, until it doesn't — both questions get the weaker answer: the truth is no longer provably true, and the presentation is now afraid to diverge from a number it was never supposed to be responsible for.

**3. Why are append-only gameplay events valuable?**

Because "what happened" and "what's true now" are genuinely different questions (§6/§7), and only one of them is well-served by a value that overwrites its own history. A mutable "current" row can tell you today's HP; it cannot tell you *how* the character got to today's HP, in what order, or prove that a specific disputed hit actually landed the way someone remembers it. An append-only Event log answers exactly that question by construction — nothing needs to be specially instrumented to make a roll or an attack auditable later, because the record that made it true in the first place already *is* the audit trail. This is also the property that lets Realtime and Persistence (§7/§8) stay honestly decoupled: the append-only Event is what a broadcast relays, so a lost broadcast never means a lost fact.

**4. How should future Eldra systems use this ADR?**

Design against §2's seven stages from the first sketch, not as a retrofit once a client-side prototype already exists. Concretely: before writing a line of a new gameplay feature (initiative, crafting, downtime — §4), answer §5's dispute-or-trust test for every value the feature touches; for everything that passes, name its Gameplay Request shape, decide whether it needs an Event, State, or both (§7), reuse `server/utils/authorization.ts`'s existing capability vocabulary rather than inventing a parallel one (§9), and reuse an already-derived source of truth (Character Assembly, the Actor Bridge, `character-derived.ts`) wherever the feature needs to know something about a character rather than re-deriving it. `eldra-roll-system.md`'s own Phase 0–8 plan (§12 above) is the worked example to imitate the *shape* of, not the content of, for whichever gameplay system comes next.

---

## Appendix — Evidence Index

Files read or cited while writing this ADR, beyond CLAUDE.md (read in full, per this task's own first instruction) and `eldra-roll-system.md` (this ADR's own immediate predecessor, read in full as prior context from the same design effort):

**The existing ADR sequence, format, and numbering** — `.github/docs/architecture/rules-engine.md` §32 (`### ADR-001` through `### ADR-022`, read in full to confirm ADR-023 is the correct next number and to match the house Context/Options/Decision/Consequences/Risks/Revisit-when format for this ADR's own opening block), and a repo-wide grep confirming no other file declares an ADR of its own and no `ADR-023` or higher exists anywhere yet.

**Already-conforming systems, re-verified for this document** — `server/utils/character-combat.ts` (targeted, seed generation and server-side resolution), `server/utils/character-sheet-inventory-transfers.ts` (targeted, confirming `offerInventoryTransfer`/`acceptInventoryTransfer`/`declineInventoryTransfer` are server-side decision points, not client-mutate-then-notify), `server/utils/inventory-transfer-realtime-bridge.ts` (already read in full for `eldra-roll-system.md`; re-cited here as this ADR's §8 precedent).

**Architecture cross-references** — `rules-engine.md` §17 (Action/Check/Roll Model) and §24 (Permissions), §32 ADR-003/ADR-008 specifically (full text read), all already read in full for `eldra-roll-system.md` and re-cited here rather than re-read.
