# Eldra Ownership, Identity, and Permissions Architecture

Status: **Partially implemented.** Phase 0 (enforcement skeleton), Phase 1 (Eldra-owned Account
identity and explicit platform grants), and Phase 2's World Membership model are implemented. Phases
3–6 and the repository/port extraction remain proposed. See **§12.1 Implementation status** for the
precise, per-phase line between what exists in the repository and what is still design.

Companion to [world-configuration.md](./world-configuration.md),
[rules-package-infrastructure.md](./rules-package-infrastructure.md), and
[rules-engine.md](./rules-engine.md). Read rules-engine.md §24 (Permissions Model) and §23 (Security
Model) first — both were written explicitly as *forward contracts against a permissions system that
does not exist*. This document is that system.

## Revision history

- **Revision 1** — established that Eldra has no server-side authorization boundary, and designed
  Accounts, memberships, capabilities, two-tier entity ownership, and Content Packs on top of that
  finding.
- **Revision 3** — no architectural change. Revision 2's design is unaltered; this revision records
  which parts of it are now **built**, and corrects the places where the document still described
  implemented behavior in the future tense. The only substantive correction is to §6.3's framing of
  what Phase 1 buys: owning an Account id makes *identity* Directus-independent, not
  *authentication*, and the document now says so in both places it matters (§6.3, §12.1).
- **Revision 2** — Ownership and permissions are **not redesigned**; every
  conclusion from revision 1 survives. What changes is that revision 1 expressed those conclusions in
  Directus's vocabulary — collections, columns, tables — which made a storage engine look like the
  architecture. Revision 2 introduces a **persistence boundary**, re-derives Content Packs from
  domain reasons rather than storage reasons, splits `resolvePrincipal`/`requireCapability` across
  their correct layers, and audits revision 1 for every place it leaked Directus into the domain
  (§4). Directus remains the default implementation throughout.

---

# 1. Executive Summary

Eldra has **two** missing boundaries, and revision 1 found only one of them.

> **First: there is no server-side authorization boundary.** 142 server API routes; exactly three
> read the session cookie, and all three are `/api/auth/*` themselves. Every other route — including
> `POST /api/worlds/:id/rules/activate` — executes against Directus with the **service token**,
> unauthenticated, for any caller who can reach the origin.
>
> **Second: there is no persistence boundary.** Domain logic and Directus access are fused in the
> same modules. `server/utils/` contains character-sheet rules, entity construction, scene-graph
> translation, and rules-package loading — each interleaved with HTTP calls to a specific CMS.
> Replacing Directus today means rewriting the domain.

The second finding sharpens the first rather than competing with it. Authorization is the **highest-
risk code in the system to couple to a vendor**, because it is the code you least want to rewrite
under time pressure. Building the authorization boundary of §9 directly on Directus would be
building the most security-critical layer in Eldra on the assumption that revision 1 was told to
remove.

There is already proof inside this repository that the discipline works. `app/lib/rules/` is 22
modules and ~860 tests of pure, I/O-free domain logic; the only six occurrences of the word
"Directus" in the entire directory are **comments asserting that Directus is absent**. The Rules
Engine is already a domain layer built correctly. Nothing in this revision is novel to Eldra — it is
the generalization of a pattern the project has already executed, tested, and shipped.

Nine decisions carry the design. Decisions 1–7 are revision 1's, restated in persistence-agnostic
terms; 8 and 9 are new.

1. **The Account is an Eldra domain concept, not a `directus_users` row** — and, revision 2 adds, not
   an "accounts collection" either. How an Account is stored is an adapter's business.
2. **Authorization is capability-based; roles are a bundling convenience.** Every enforcement site
   asks `can(principal, capability, scope)`, never `if (isGM)`.
3. **World is the isolation boundary, and membership is the single source of truth.** Ownership is a
   membership role, which makes transfer a domain operation rather than a schema concern.
4. **Platform Administration and World Administration are disjoint. Platform Admin is *not* a world
   superuser.** Cross-world access is an explicit, audited break-glass action.
5. **Catalogue content belongs to the Platform as immutable, versioned Content Packs; Worlds pin a
   version and overlay their own changes.** Revision 2 re-derives this from provenance, campaign
   stability, and licensing — **not** from row-count efficiency, which was revision 1's stated reason
   and was the wrong kind of reason (§7).
6. **Ownership is two-tier, not an ACL.** Worlds own content; an Entity may carry an owning Account,
   used only for player characters.
7. **Authentication grants nothing.** A valid session confers exactly one right: to be evaluated.
8. **Dependencies point inward. The domain has no outward dependencies at all.** Domain → nothing;
   Application → Domain + Ports; Infrastructure → everything, and nothing depends on Infrastructure.
   Directus lives entirely in Infrastructure, as one adapter behind ports the application defines.
9. **Repositories express domain intent, not storage mechanics.** A repository that leaks filter
   syntax, row shapes, or vendor identifiers has moved the coupling rather than removed it (§10.3).

**What I think is wrong with the framing of this task**, stated plainly:

- **"The design feels too Directus-shaped" is correct, and the diagnosis is more specific than
  taste.** Revision 1 did not merely *sound* Directus-shaped; it made eleven concrete substitutions of
  storage vocabulary for domain vocabulary, each of which quietly transfers a design decision to the
  adapter. §4 lists all eleven. The most consequential is the Content Pack argument, which was
  justified by row duplication — a storage-efficiency claim that a different adapter could simply
  falsify, taking the recommendation down with it.

- **"Directus should become an implementation detail" is right, but the word "detail" undersells one
  thing.** Directus is not only a data store; it is currently also the **authentication provider**
  and the **file/asset host**. Those are three separable ports, and conflating them into one
  "replace Directus" question is what makes the task look larger than it is. §6.3 keeps Directus as
  the credential verifier even while Accounts become domain objects — which *reduces* the cost
  revision 1 flagged as its honest downside.

- **The largest Directus leak in Eldra today is not in the server at all.** `nuxt.config.ts` publishes
  `public.directusUrl` to every browser, and at least ten components build
  `` `${directusBase}/assets/${id}` `` image URLs directly. The browser fetches media straight from
  Directus. That contradicts CLAUDE.md's own stated boundary — *"Client never talks to Directus
  directly"* — and it means a Directus replacement currently breaks the **presentation layer**, which
  is the layer with the least business knowing the CMS exists (§3.3).

- **The real risk in this revision is over-correction.** CLAUDE.md is explicit: prefer incremental
  evolution, avoid inventing abstractions, favour small reviewable changes. A full hexagonal rewrite
  of 142 routes and 46 utility modules would violate all three and stall the roadmap. §12 therefore
  recommends introducing the boundary **only at the seam of new work**, letting legacy paths migrate
  opportunistically, and explicitly permits some of them never to migrate.

---

# 2. Current Repo Findings

**Fact** = verified this session against the code and the live Directus instance. **Consequence** =
what follows.

## 2.1 There is no server-side authorization, anywhere

**Fact.** 142 files under `server/api/`. A search for any session read
(`eldra_session` / `getCookie` / `getSessionToken`) returns exactly three: `auth/login.post.ts`,
`auth/logout.post.ts`, `auth/me.get.ts`. `server/api/worlds/[id]/rules/activate.post.ts` — which
changes which game a world runs — parses its body, calls `activateWorldRulesPackage`, and returns. No
identity enters the handler.

**Consequence.** Every authorization statement in the product is currently false, and enforcement
infrastructure therefore precedes ownership semantics: an owner field nothing checks is a comment.

Worth recording precisely: rules-package-infrastructure.md §2.3 identified "Game Admin has no auth
guard" as *the one genuine blocker*, and Infra Commit 1 added `middleware: 'admin'` to
`app/pages/worlds/[id]/admin.vue`. That secured the **page**. The **endpoints the page calls** were
never guarded and are not guarded now. Correct fix, insufficient scope.

## 2.2 `app/lib/` is already a clean domain layer — and proves the pattern

**Fact.** `app/lib/rules/` contains 22 modules and the bulk of the suite's ~860 tests. Occurrences of
"Directus" in that directory: **six, all of them comments asserting its absence** — e.g.
`world-runtime.ts:19` *"performs NO I/O (no fetch, no file read, no Directus)"*, `types.ts:373`
*"no Directus, no persistence, no I/O."* `app/lib/systems/`, `app/lib/importers/`, and
`app/lib/eldra/` contain **zero** references each.

**Consequence.** This is the single most important finding in revision 2, and it is a positive one.
Eldra already contains a rigorously persistence-agnostic domain layer, built deliberately, documented
in comments, and defended by tests. The Rules Engine would survive a Directus replacement **entirely
untouched, today, with no work**. Revision 2 is therefore not proposing a new architecture — it is
proposing that the boundary `app/lib/rules/` already respects be extended to ownership, permissions,
content, and character logic. That is an evolution argument, which is what CLAUDE.md asks for, rather
than an invention argument, which is what it warns against.

## 2.3 Domain logic and Directus access are fused in `server/utils/`

**Fact.** `directusServiceRequest` is imported by 46 files, including `character-sheets.ts`,
`entity-factory.ts`, `entity-relationships.ts`, `scene-layer-objects.ts`, `rules-packages.ts`,
`world-rules-config.ts`, `import-save.ts`, and `homebrew/`. A further ~20 files hold hand-rolled
`dxFetch`/`DIRECTUS_URL` copies (CLAUDE.md's known debt). `directusRequest` — the session-aware
client — is imported by exactly two API routes, both of them `/api/auth/*`.

**Consequence.** These modules are not persistence adapters that happen to contain logic; they are
domain logic that happens to contain HTTP. `character-sheets.ts` decides what a default ability-score
block is *and* how to PATCH it. Splitting them is the actual work of this revision, and §12 argues it
must be incremental rather than wholesale.

Note that Directus's own permission engine is bypassed on 100% of data operations. That is not a bug
to fix by forwarding user tokens — the BFF is the intended authorization layer (§9.1) — but it does
mean no permission enforcement exists at either level today.

## 2.4 The browser knows Directus exists

**Fact.** `nuxt.config.ts:12` publishes `directusUrl` under `runtimeConfig.public`, shipping the
vendor's URL to every browser. At least ten components and pages build asset URLs directly —
`BlockRenderer.vue:25` returns `` `${directusBase}/assets/${value}` ``, and `EntityBlockCard.vue`,
`MapImageOverlayEditor.vue`, `SheetManageCharacterRail.vue`, `MonsterPreviewPanel.vue`,
`AdminHomebrewDraftImagePicker.vue`, and others do the same. Page-level normalization carries fields
literally named `directusFileId` / `directus_file_id` (`maps.vue:35`,
`MapImageOverlayEditor.vue:40`).

**Consequence.** Two distinct problems, and the second is worse than the first:

- **Media is not behind the BFF.** CLAUDE.md's stated boundary — *"Client never talks to Directus
  directly. All access goes through `server/api/**`"* — is already violated for images. This is a
  pre-existing architectural inconsistency, not something this revision introduces.
- **A vendor name has entered domain-shaped data.** `directusFileId` on a map overlay is exactly what
  the Scene Graph doc forbids in its own terms: objects must describe *intent*, never
  engine-specific data. `MediaRef` is the domain concept; which CMS assigned the id is an adapter
  fact. Encouragingly, `app/lib/` itself is clean — the leak lives in page-level normalization, which
  is where it is cheapest to fix.

## 2.5 World ownership exists as a column and as nothing else

**Fact.** `worlds.owner_id` is provisioned as a nullable `uuid` (`create_worlds_only.sh:112`), read in
two files as a passthrough, and **never written** — there is no `POST /api/worlds` route at all;
worlds are created in the Directus admin UI. Live: the one world (`Varin`) has `owner_id: null`,
`visibility: "private"`.

**Consequence.** Not a foundation — an unpopulated column with no writer. Replacing it with a
membership concept costs nothing now and real work later. Note also what the absence of a
world-creation route implies: **world creation is currently a Directus-admin operation**, i.e. a core
domain use case is presently implemented by the vendor's UI. That is the purest possible example of
Directus having absorbed something that belongs to Eldra.

## 2.6 `visibility` is written everywhere and enforced nowhere

**Fact.** `entities.visibility`, `character_sheets.visibility`, `worlds.visibility` all exist and are
populated — `entity-factory.ts:120`, `character-sheets.ts:232`, `import-save.ts:91,144` hardcode
`'world'`. No read filter on the field exists anywhere in the repo.

**Consequence.** This is deliberate and correct per rules-engine.md §24.3 ("carry it from day one…
nothing enforces this"). The field is an asset. But it is currently *uniform*, so it encodes no intent
yet, and it is a **domain classification** — enforcement belongs in domain policy (§8.3), never in an
adapter's row filter, or each adapter would have to reimplement it.

## 2.7 Every Directus user is an Administrator

> **ADDRESSED (Phase 1).** Still true of *Directus* — this instance's human users do hold
> Administrator — but it no longer has any bearing on Eldra. `resolvePrincipal` no longer reads
> `admin_access`, and `app/composables/useAuth.ts`'s `isAdmin` no longer reads it either; both now
> read `eldra_platform_grants`. A Directus Administrator with no grant row holds no Eldra platform
> capability and no World access beyond their membership rows. `server/api/auth/require-admin.get.ts`
> — a second, broken, unreferenced admin gate that read `role.admin_access` on the wrong object and
> so always returned 403 — was removed rather than left as a parallel path.

**Fact.** Live: three `directus_users`, all role `Administrator`; two have `email: null`. The instance
holds exactly two policies — `Administrator` (`admin_access: true`) and `$t:public_label`.

**Consequence.** `isAdmin` evaluates **true for every human user**, so `middleware/admin.ts` filters
nobody — the sharper statement than CLAUDE.md's "acceptable only for development." And **email is not
a viable identity key**: two of three accounts have none, which is decisive for §6.2.

## 2.8 Content is world-scoped copies

**Fact.** `server/api/import/save/5etools/*.post.ts` requires `worldId` and calls
`persistImportedEntities({ worldId, … })`. The pre-reset audit measured, for a **single** world:
`item=812`, `spell=533`, `feat=51`, `species=38`, `background=18`, `class=13` — ~1,465 catalogue rows
plus 2,948 `block_instances` bodies.

**Consequence.** Revision 1 drew a storage conclusion from this (duplication at scale). Revision 2
draws a **domain** conclusion instead, which §7 develops: the same Longsword exists in every world
using SRD 5.1, and today Eldra has no way to say so. Row count is a symptom of the missing concept,
not the reason to add it.

## 2.9 `worldId` is trusted from the URL

**Fact.** World-scoped routes read `getRouterParam(event, 'id')` and pass it straight into a Directus
filter. No route compares it against the caller, because no route knows the caller (§2.1).

**Consequence.** The mechanism by which a half-built permission system becomes worse than none.
§9.4 makes scope derivation a property of the authorization primitive rather than a per-route
discipline — and, in revision 2, a property that holds regardless of which adapter is underneath.

## 2.10 The audit log's stated precondition is this document

**Fact.** rules-package-infrastructure.md Q9 defers `rules_audit_log`, blocked on *"a
permissions/identity model to attribute entries to."*

**Consequence.** Satisfied by §6. The audit log is the natural first consumer of Accounts.

---

# 3. Where Directus Should Stop, and Eldra Begin

## 3.1 Eldra already has a boundary — and it is doing a different job

CLAUDE.md's architectural rule is that the client never talks to Directus; everything goes through
`server/api/**`. That is a real, valuable boundary, and it is worth being precise about what it
protects:

```
Browser  ──────────────►  Nuxt server (BFF)  ──────────────►  Directus
         the BFF boundary                     ← no boundary here at all
         protects the CLIENT from Directus     the DOMAIN is fused to Directus
```

The BFF boundary is **horizontal** — it keeps a network tier from reaching a store. The boundary this
revision needs is **vertical** — it keeps *business logic* from depending on a *vendor*. Having the
first does not give you the second, which is precisely why 46 server modules can honour CLAUDE.md's
rule perfectly while still being unable to survive a Directus replacement.

(And as §2.4 shows, even the horizontal boundary is currently breached for media.)

## 3.2 The layering, and the one rule that matters

```
┌─ DOMAIN ─────────────────────────────────────────────────────────────────┐
│  Pure. No I/O, no framework, no vendor. Fully unit-testable.             │
│  Rules Engine (ALREADY THIS)  ·  Permission policy  ·  Content identity  │
│  & override resolution  ·  World / Entity / Account / Membership /       │
│  Invitation concepts and invariants  ·  Character sheet math             │
└──────────────────────────────────────────────────────────────────────────┘
            ▲ depends on nothing
┌─ APPLICATION ────────────────────────────────────────────────────────────┐
│  Use cases. Orchestrates domain + ports. Knows ports as INTERFACES only. │
│  "activate a rules package for a world" · "invite a member" ·            │
│  "execute a roll" · "publish a content pack" · "create a world"          │
│  Owns the PORT definitions (repositories, session, clock, ids, media).   │
└──────────────────────────────────────────────────────────────────────────┘
            ▲ depends on domain + its own ports
┌─ INFRASTRUCTURE ─────────────────────────────────────────────────────────┐
│  Adapters. Directus repositories · Nitro HTTP routes · Leaflet ·         │
│  dice box · file storage · schema provisioning scripts                   │
└──────────────────────────────────────────────────────────────────────────┘
            nothing depends on this
```

**The rule: dependencies point inward, and the domain has no outward dependencies at all.** Everything
else in this document follows from it mechanically. A test for any given module: *if this file
imported nothing but other domain files, would it still express what it means?* `world-config.ts`
passes today. `character-sheets.ts` does not.

## 3.3 Which existing concepts sit where

| Concept | Layer | Note |
|---|---|---|
| Rules Engine, expression evaluation, roll execution | **Domain** | Already correct (§2.2) |
| World config resolution, binding gaps, roll-type composition | **Domain** | Already correct — `app/lib/rules/world-config.ts` |
| Permission policy: role → capability, scope check | **Domain** | Does not exist yet; §9.2 |
| Content pack identity, version pinning, override resolution | **Domain** | Does not exist yet; §7 |
| Character sheet math | **Domain** | Exists but entangled with persistence (§2.3) |
| Scene Graph object model | **Domain** | `app/lib/eldra/scene.ts` is clean; page normalization leaks (§2.4) |
| "Activate package for world", "invite member", "import pack" | **Application** | Partly exists as `server/utils/world-rules-activation.ts` |
| Repository / session / media / clock / id ports | **Application** (definitions) | Do not exist |
| Directus HTTP client, row↔model translation, schema scripts | **Infrastructure** | Exists, correctly placed, wrongly *reached* |
| Nitro routes, cookies, HTTP status mapping | **Infrastructure** | Exists |
| Vue components, Leaflet, dice box | **Infrastructure** (presentation) | Should never name a vendor (§2.4) |

Two placements deserve defending because they are counter-intuitive:

- **Ports are defined by the Application, not by Infrastructure.** The application declares what it
  needs (`MembershipRepository` returns memberships); infrastructure satisfies it. If infrastructure
  defined the interfaces, the adapter would once again dictate the domain's shape — the exact failure
  this revision exists to prevent.
- **HTTP routes are infrastructure, not application.** A Nitro handler is a *delivery mechanism* for a
  use case. This matters practically: it is why the same use case can later be reached by an HTTP
  route, a CLI script, a websocket session, or a test, without duplication — and Eldra already has
  the CLI case (`scripts/directus/*.mjs`), which today reimplements logic rather than calling it.

---

# 4. Where Revision 1 Leaked Directus — a self-audit

The task asks for every place the previous draft let a storage engine into the domain. Eleven, plus
one exoneration. Each leak is small in isolation; collectively they are what made the document read
as Directus-shaped.

| # | Revision 1 said | The leak | Why it matters | Revision 2 says |
|---|---|---|---|---|
| **L1** | "introduce an `accounts` **collection**" (§5.1) | "Collection" is Directus vocabulary | Names the rendering, not the concept — and pre-decides that Accounts are one flat table | **Account** is a domain entity; `AccountRepository` persists it; the Directus adapter happens to use a collection (§6.1) |
| **L2** | `IdentityLink` presented as a column list (§5.2) | Row shape presented *as* the model | Uniqueness reads as a DB constraint rather than a domain invariant | IdentityLink is a domain value object; "one identity per (provider, subject)" is an invariant the domain enforces and an adapter *may* also index (§6.2) |
| **L3** | "`entities.owner_account_id` **nullable column**" (§7) | A column decision standing in for a domain fact | Makes ownership look like a migration, so a non-SQL adapter has nothing to implement | An **Entity may have an owning Account**. Optional by nature, not by nullability (§8.4) |
| **L4** | `world_members` **table** with columns (§10.1) | Same substitution | "Ownership is a role not a column" was the right idea *expressed as a schema argument* | **Membership** is a domain relation with an invariant (exactly one Owner per World), persisted by `MembershipRepository` (§8.5) |
| **L5** | `world_invitations` **table** (§10.2) | Same | Expiry/revocation read as columns rather than lifecycle | **Invitation** is a domain aggregate with a lifecycle: issued → accepted \| revoked \| expired (§8.6) |
| **L6** | `resolvePrincipal(event)` (§9.2) | An **H3Event** in the signature | Fuses HTTP transport, session verification, and repository reads into one function bound to Nitro | Split three ways across layers (§9.3) |
| **L7** | "~46 files using `directusServiceRequest` need a capability declaration" (§9.5) | Frames the retrofit as *adding checks to Directus callers* | Assumes routes keep calling Directus forever; makes the boundary unreachable by construction | Routes invoke **use cases**; the Directus client leaves route code entirely (§11) |
| **L8** | Content Packs justified by **row duplication** (§2.6, §6.2) | A storage-efficiency argument carrying a domain recommendation | Adapter-specific and falsifiable — "storage is cheap" defeats the whole section | Re-derived from **provenance, campaign stability, licensing**; row count demoted to corroboration (§7) |
| **L9** | Phase 1: "Migrate the existing Directus users to Accounts" (§11) | Adapter data movement inside a domain phase | Conflates *introducing a concept* with *backfilling one vendor's rows* | Domain introduction and adapter backfill are separate steps (§12) |
| **L10** | Risk 6: "the `dxFetch` duplication becomes a security bug" (§12) | Treats *duplication* as the hazard | The hazard is domain code calling **any** Directus client, shared or not | The repository boundary dissolves the question: domain code calls no HTTP client at all (§13) |
| **L11** | §9.1 framed as "should **Directus** decide authorization?" | Asking the question at all makes Directus architectural | Positions a vendor as a candidate owner of policy | The question is *which layer owns policy* (domain) and *which owns data access* (ports). Directus is never a candidate for the former (§9.1) |
| **✓** | `may_read(principal, entity)` pseudocode (§8.3) | **Not a leak** | Expressed purely in domain terms — visibility, membership, ownership — with no storage vocabulary | **Kept verbatim** (§8.3). It is the model for how the rest should read |

Three further leaks exist in the **codebase** rather than in revision 1, and are recorded here because
they are the same class of error: `public.directusUrl` shipped to browsers, client-built
`/assets/<id>` URLs, and `directusFileId` in page-level domain shapes (§2.4).

---

# 5. What Revision 2 Does Not Change

Per instruction, ownership and permissions are **not** redesigned. For the avoidance of doubt, these
revision-1 conclusions stand unchanged in substance:

- Accounts are Eldra's identity, not the CMS's user table.
- Capability-based authorization; roles as bundles; enforcement never names a role.
- World is the isolation boundary; membership is the single source of truth; Owner is a role.
- Platform Admin is not a world superuser; break-glass is explicit and audited.
- Two-tier ownership: worlds own content, entities may carry an owning Account (player characters).
- Authentication grants nothing.
- The capability matrix and role bundles of §8.7 are carried over verbatim.

What changes is the **vocabulary** they are expressed in, the **layer** each piece is assigned to, and
the **justification** for Content Packs.

---

# 6. Identity

## 6.1 Should Accounts be Eldra domain objects or Directus collections?

> **IMPLEMENTED (Phase 1).** `server/utils/eldra-accounts.ts`, backed by the `eldra_accounts`,
> `eldra_identity_links` and `eldra_platform_grants` collections
> (`scripts/directus/create-eldra-accounts-schema.mjs`). `Principal.accountId` is an Eldra-generated
> id; the Directus user id survives only as an `eldra_identity_links.provider_subject` value.

**Domain objects — and the persistence boundary makes this argument stronger, not weaker.**

Revision 1 argued from category error: Directus users are CMS staff, players are not, and the two
have already merged (all three live users are Administrators, §2.7). That still holds. Revision 2 adds
the decisive one:

> **If Accounts live in `directus_users`, then Eldra's identity model is defined by whichever
> persistence engine is installed.** Swapping to Postgres, PocketBase, or Supabase would not merely
> move rows — it would change what an Account *is*, because each of those systems has its own user
> model with its own fields, its own auth semantics, and its own idea of a role. A domain concept
> whose shape is dictated by the adapter is not a domain concept.

So: **Account** is a domain entity — an identity that owns things, holds memberships, and is the
subject of every permission decision. `AccountRepository` persists it. The Directus adapter may store
it in a custom collection; a Postgres adapter in a table; a future adapter however it likes. None of
that reaches the domain.

**What an Account is *not*:** it is not a credential, not a session, and not a profile row. Those are
three separate concerns, and separating them is what makes §6.3 possible.

## 6.2 Identity links are domain values, not rows

> **IMPLEMENTED (Phase 1), with one provider.** All four rules below hold in
> `server/utils/eldra-accounts.ts`. Rule 2 is enforced structurally:
> `resolveAccountForIdentity` takes `(provider, providerSubject, displayName)` and has **no email
> parameter**, so no caller can match an Account by one; `(provider, provider_subject)` additionally
> carries a real database-level unique constraint via the canonical `identity_key` column. Rule 4 is
> enforced by `Principal` carrying no provider field, so no capability decision can read one.
> Rule 3 (`password` as a provider) is **not** implemented — Directus remains the credential
> verifier, so there is no local credential to model yet. Only `provider = 'directus'` exists.

An Account may hold many **IdentityLinks**, each naming an external authentication provider and that
provider's stable subject. Four rules, all domain-level:

1. **Many links, one Account.** Signing in with Discord and later Google must reach the same Account,
   or a player loses their characters by clicking a different button.
2. **The identity key is `(provider, provider_subject)`, never email.** Emails are mutable,
   reassignable, and — as §2.7 proves against live data — frequently absent. Email-as-key is also an
   account-takeover vector wherever a provider does not verify it. This is an **invariant the domain
   enforces**; an adapter may additionally index it, but correctness must not depend on the adapter
   having done so (only four real foreign keys exist in the current schema — the domain cannot assume
   the store will defend anything).
3. **`password` is just another provider.** Local credentials are one IdentityLink among many, which
   keeps the zero-provider self-hosted case on the main path rather than as a special case.
4. **The provider is never a permission input.** No capability may depend on *how* someone
   authenticated, or adding a provider becomes a security review of the entire capability set.

## 6.3 Authentication is infrastructure; identity is domain — and Directus can keep the former

Revision 1's stated honest cost was that owning Accounts means owning session issuance: rotation,
revocation, fixation, CSRF. The persistence boundary **reduces** that cost, because it separates two
things revision 1 treated as one:

| Concern | Layer | Directus's role |
|---|---|---|
| *Is this credential valid?* | Infrastructure (`CredentialVerifier` port) | **Can remain the implementation** — this is what `/api/auth/login` already does |
| *Does this session token map to a principal?* | Infrastructure (`SessionStore` port) | Can remain the implementation initially |
| *Who is this Account, and what may they do?* | **Domain** | **None, ever** |

Directus therefore stays the default authentication provider — satisfying the instruction that it
remains the default implementation — while Accounts, memberships, and capabilities become domain
concepts it never sees. A self-hoster swapping Directus reimplements two narrow ports; they do not
touch identity semantics. This is strictly better than revision 1, which implied Eldra had to build
session issuance up front.

> **IMPLEMENTED (Phase 1): the third row only.** "Who is this Account, and what may they do" is now
> Eldra's, and Directus has no part in it. The first two rows are **unchanged and still Directus**:
> `/api/auth/login` posts to Directus's own `/auth/login`, `eldra_session` carries a raw Directus
> access token, `eldra_refresh` carries a Directus refresh token, and `resolvePrincipal` validates a
> session by calling Directus `/users/me`.
>
> **The claim to avoid.** Phase 1 does *not* make authentication Directus-independent, and the
> existing administrator is not "Directus-independent" merely because they now have an Eldra Account
> row. If Directus is unavailable, nobody can sign in. What Phase 1 changes is that the identity
> every authorization decision is made *about*, and every capability that decision reads, no longer
> come from Directus's user model. Those two statements are different and only the second is true
> today. `CredentialVerifier` and `SessionStore` are still **ports in design only** — no such module
> exists; `server/utils/directus.ts` is called directly.

Note also that Phase 1 narrowed `directusRequest` in the same pass: the user-scoped Directus client
no longer falls back to the **service** token when it cannot resolve a user session. It fails closed
(401), and the two credential-free Directus endpoints (`/auth/login`, `/auth/logout`) opt in
explicitly. Privilege is now something a call site states rather than something it inherits by
omission — `directusServiceRequest` remains the only way to ask for service privileges.

## 6.4 What authentication may imply

**Nothing.** A valid session confers exactly one right: to be the subject of an authorization check. A
brand-new Account with no memberships may read its own profile, accept an invitation, and — if
platform policy allows — create a world.

The current system inverts this in both directions: unauthenticated callers are fully authorized
through the API (§2.1), and authenticated ones are all administrators (§2.7).

---

# 7. Content Packs — does the concept belong to Eldra, or is it accidentally Directus?

The task asks this directly, and the honest answer is: **the concept belongs to Eldra, but revision 1
justified it so badly that it looked like a storage optimization.**

## 7.1 The bad argument, retired

Revision 1's headline reason was duplication: ~1,465 catalogue rows per world, ~14,650 across ten
worlds. That is a **storage-efficiency** claim, and it fails as an architectural argument for three
reasons:

- It is **adapter-specific.** A different engine may deduplicate, compress, or simply not care.
  "Storage is cheap" is a complete rebuttal, and an architecture that collapses under it was never
  resting on architecture.
- It **describes a symptom.** Duplication is what you observe *because* the model cannot express that
  two worlds use the same content. The missing concept is the cause; the row count is the shadow.
- It **invites the wrong implementation.** If deduplication is the goal, the obvious solution is a
  shared table with foreign keys — a schema decision, made in the adapter, for the domain.

## 7.2 The domain argument, which is the real one

Content Packs earn their place on three grounds, none of which mentions storage:

1. **Provenance is a domain fact.** A Longsword from SRD 5.1 *is the same Longsword* in every world
   that uses SRD 5.1. That is a statement about the game, not the database. Today Eldra cannot express
   it: two identical items in two worlds are unrelated rows with no shared identity, so "where did
   this come from?" has no answer beyond an `import_source` block on each copy.
2. **Campaign stability is a domain requirement.** A campaign in progress must not silently change
   because content was updated. That demands *versioned, pinned* content with deliberate repinning —
   the identical requirement that produced `(package_id, version)` pinning for rules, for the identical
   reason (world-configuration.md §B.6). It is a game-design constraint, not a data constraint.
3. **Licensing is first-class and legally load-bearing.** rules-engine.md §30 requires per-source
   license metadata with attribution *surfaced in the UI*, and warns that a repository's LICENSE file
   frequently governs only its code. Attribution attaches to a **body of content**, which is precisely
   what a pack is. Copies scatter that obligation across thousands of rows with no coherent unit to
   attach it to.

All three survive any change of persistence engine, because none of them is about persistence.

## 7.3 The liberating consequence: the adapter may still store copies

This is the payoff of re-deriving the argument, and it dissolves the trade-off revision 1 agonized
over in its §6.2.

If the domain contract is *identity + version pinning + override resolution*, then **how an adapter
realizes a pack binding is an adapter decision**. It may store one shared copy and resolve by
reference. It may equally **materialize a stamped copy per world**, provided each copy carries its
pack identity and version so the domain contract still holds.

That means:

- The **domain** says: *this world uses `srd-5.1@1.0.0` and overrides three entries.*
- The **adapter** decides whether that is a join or a copy.
- Revision 1's feared complexity — overlay resolution on read, "reset to pack default", repin
  behaviour — is **domain logic that exists either way**, because it is the same logic
  `resolveWorldConfig` already implements for roll types: a stale override naming an entry the new
  version no longer declares emits a warning, contributes nothing, and leaves the stored key untouched
  so a downgrade restores it (world-configuration.md Q12). Adopt that policy verbatim rather than
  inventing a second one.
- A performance-motivated switch between reference and copy becomes an **adapter change with no
  domain impact** — exactly the property the boundary exists to provide.

Revision 1 presented reference-vs-copy as the architectural decision. It is not. **Pack identity and
version pinning** are the architectural decision; reference-vs-copy is an implementation strategy that
the boundary makes reversible.

## 7.4 Is "ContentPack" accidentally a Directus concept?

**No — but "content_pack_bindings", the way revision 1 drew it, was.** Revision 1's diagram named a
join table. The domain concept is *"a World uses these packs at these versions, with these
overrides"*, which is an attribute of the World aggregate. Whether an adapter stores it as a join
table, an embedded document, or a column of JSON is not the domain's business — and notably, the
existing `world_rules_config` design already made the right call here by keeping the world's rules
binding in **one row of its own**, not a join table.

## 7.5 Where content ownership lands (unchanged from revision 1)

| Content | Owner | Rationale |
|---|---|---|
| SRD / published catalogue | **Platform** (Content Pack) | Shared identity, versioned, licensed, updatable |
| Homebrew, campaign NPCs, locations, maps, timelines | **World** | Campaign-specific; no other world has a claim |
| Pack entry overrides | **World** | A world's opinion about shared content |
| Player characters | **World**, with an owning **Account** | Lives in the campaign; controlled by a person |
| Rules Packages | **Platform** | Already correct |

**Installing a pack is a Platform action; binding one to a world is a World action.** Installation
writes to a namespace shared by every world; binding affects exactly one. This is the same split as
rules packages, and it is why `platform.contentpack.install` and `world.content.bind_pack` are
different capabilities.

---

# 8. The Domain Model, Persistence-Agnostically

Same model as revision 1; storage vocabulary removed.

## 8.1 Aggregates

**Account** · **World** · **Entity** · **Membership** · **Invitation** · **ContentPack** ·
**RulesPackage**. Each is a domain concept with invariants the domain enforces — not a table.

## 8.2 Scopes, and the deliberate discontinuity

```
Platform    operates the deployment      (install packages, manage accounts, break-glass)
   ╎        ← NO implicit authority downward
World       operates one game            (members, rules activation, content, maps)
   ├─ Entity     world-owned by default; optionally account-owned (player characters)
   └─ Session    future: who is at the table right now
```

## 8.3 Visibility is a domain classification, not a storage filter

Carried verbatim from revision 1, which expressed it correctly:

```
may_read(principal, entity) =
      has(principal, 'world.read', entity.world)
  AND ( entity.visibility === 'public'
     OR entity.visibility === 'world'    AND is_member(principal, entity.world)
     OR entity.visibility === 'private'  AND ( entity.owner === principal.account
                                            OR has(principal, 'world.character.edit_any', entity.world) ) )
```

Revision 2 adds one rule the boundary makes necessary: **this is domain logic and must not be pushed
into an adapter's query filter.** It is tempting — filtering in the store is faster — but it would
require every adapter to reimplement the rule identically, and a subtle divergence between two
adapters becomes a data-disclosure bug. Adapters may filter as an *optimization*; the domain must
remain the authority.

rules-engine.md §J.5's warning is adopted unchanged: roll broadcast policy (`public|gm|self|blind`)
and data classification (`public|world|private`) are different vocabularies and must not be collapsed.

**Public worlds** fall out for free: a public world grants `world.read` to unauthenticated principals
for public entities only. No new mechanism — which is the test of whether the model was right.

## 8.4 Entity ownership (unchanged)

An **Entity may have an owning Account.** Populated only for player characters; absent for items,
spells, locations, factions, and NPCs, which belong to the world.

The temptation is a general per-object ACL. Rejected: the use cases do not exist, and
rules-engine.md §21.5's warning about free-form overrides applies to permissions equally — the general
mechanism is the one that becomes un-migratable. Two capabilities (`character.edit_own`,
`character.edit_any`) cover the one real case.

A character sheet has no owner independent of its character; it inherits ownership through the entity
rather than carrying its own.

**This remains one of the two decisions that must be made before content is imported** (§14.5) — not
because a column is expensive to add, but because ownership cannot be reconstructed later: imported
data records no owner, so a late decision means backfilling from a source of truth that does not
exist.

## 8.5 Membership

A **Membership** binds an Account to a World with exactly one role. Invariant: **exactly one Owner per
World.** A world with zero owners is unadministrable; one with two has an ambiguous `world.delete`.

**The domain enforces this invariant.** Revision 1 noted "Directus will not do it"; revision 2
generalizes: *no adapter may be assumed to*. With four real foreign keys in the current schema, the
store defends nothing, and a future store defending it would be a bonus rather than the mechanism.

Ownership transfer is a domain operation on the membership set, not a schema concern. The unused
`worlds.owner_id` should be retired rather than maintained in parallel — two sources of truth for
ownership disagree silently. Per CLAUDE.md this is a persistence-model change requiring explicit
approval.

## 8.6 Invitation

An **Invitation** grants one role in one world, and has a lifecycle: issued → accepted | revoked |
expired.

- **The token is the invitation; email is optional metadata.** Email delivery must not be a hard
  dependency — a self-hosted instance may have no mail transport, and §2.7 proves accounts may lack
  email entirely. A GM pastes a link into a group chat and it works.
- **Acceptance requires authentication; any provider satisfies it.** The invitation binds to whichever
  Account accepts, never pre-binding to an email address (which would recreate the coupling §6.2
  rejects).
- **No invitation ever grants platform capability.** This keeps privilege escalation off the
  invitation surface entirely.
- **Expiry and revocation are part of the lifecycle**, not optional fields — a permanent unrevocable
  join link is an unbounded liability, and retrofitting expiry onto issued tokens is impossible.

## 8.7 Capabilities (carried over unchanged)

Roles are the assignment primitive; capabilities are the enforcement primitive. Enforcement code never
names a role.

**Platform:** `platform.account.manage` · `platform.package.install|publish|remove` ·
`platform.contentpack.install|publish|remove` · `platform.world.list` (metadata only) ·
`platform.world.delete` · `platform.settings.manage` · `platform.breakglass.enter`

| Capability | Owner | Game Master | Worldbuilder | Player | Observer |
|---|:--:|:--:|:--:|:--:|:--:|
| `world.read` | ✓ | ✓ | ✓ | ✓ | ✓ (public only) |
| `world.settings.edit` | ✓ | ✓ | — | — | — |
| `world.delete` | ✓ | — | — | — | — |
| `world.transfer_ownership` | ✓ | — | — | — | — |
| `world.member.invite` | ✓ | ✓ | — | — | — |
| `world.member.remove` / `.assign_role` | ✓ | ✓ | — | — | — |
| `world.rules.activate` / `.configure` | ✓ | ✓ | — | — | — |
| `world.content.bind_pack` | ✓ | ✓ | — | — | — |
| `world.entity.create` / `.edit` / `.delete` | ✓ | ✓ | ✓ | — | — |
| `world.homebrew.manage` | ✓ | ✓ | ✓ | — | — |
| `world.map.edit` / `world.scene.edit` | ✓ | ✓ | ✓ | — | — |
| `world.timeline.edit` | ✓ | ✓ | ✓ | — | — |
| `world.npc.manage` | ✓ | ✓ | ✓ | — | — |
| `world.character.create` | ✓ | ✓ | — | ✓ | — |
| `world.character.edit_own` | ✓ | ✓ | — | ✓ | — |
| `world.character.edit_any` / `.approve` | ✓ | ✓ | — | — | — |
| `world.grant.issue` | ✓ | ✓ | — | — | — |
| `world.roll.execute` | ✓ | ✓ | — | ✓ | — |
| `world.roll.see_gm` / `.override` | ✓ | ✓ | — | — | — |
| `world.session.run` *(future)* | ✓ | ✓ | — | — | — |

**Platform Admin is not a world superuser.** An operator who can silently read every private world has
destroyed the product's shared-world story; `platform.breakglass.enter` provides an explicit, audited,
time-boxed path instead. For the solo self-hoster this is invisible — the installing account is
Platform Admin *and* Owner of every world it creates.

Roles are **not hierarchical** (GM is not "Player plus more" — `character.edit_own` belongs to Player
and is meaningless for a GM who owns no character). Custom roles are not V1, but because enforcement
is capability-based, adding them later is a data change rather than an architectural one.

---

# 9. Authorization — which layer owns what

## 9.1 Reframing revision 1's rejected alternative

Revision 1 asked "should Directus decide authorization?" and answered no. The answer was right; the
**question was the leak** (L11). Under a persistence boundary, a storage adapter is not a candidate
owner of policy at all — asking makes it architectural.

The correct question is *which layer owns policy*, and the answer follows from §3.2: **policy is
domain**, because it is a pure function of principal, capability, and scope; **data access is a
port**, because it requires I/O.

Revision 1's four reasons for rejecting Directus-as-authorizer survive intact and are strengthened:

1. Dynamic per-world membership does not map onto a static role/policy system without generating a
   role per world per role.
2. **Authorization would live outside the repository** — unversioned, unreviewable, untestable, and
   invisible to the ~860-test suite that is currently the project's only correctness gate (CLAUDE.md
   records lint + typecheck as the sole CI checks, with no e2e). Under a persistence boundary this
   becomes decisive rather than merely strong: policy in the domain is testable *with no store at
   all*.
3. It requires every player to be a CMS user (§6.1).
4. It contradicts the BFF boundary.

Directus permissions remain valuable as **defence in depth** — the service credential should be scoped
to what it genuinely needs — but they are not the authorization model, and no adapter is.

## 9.2 `can()` is domain

```
can(principal, capability, scope) → boolean
```

Pure: no I/O, no framework, no vendor. It receives a **Principal** — an Account with its platform
roles and world memberships already resolved — and answers a question about it.

This is genuinely domain logic because it encodes Eldra's rules: the role→capability mapping of §8.7,
the Platform/World discontinuity of §8.2, and the ownership check of §8.4. Those are product
decisions, not storage decisions.

The dividend is testability: **the entire permission matrix — every role against every capability —
is unit-testable with no database, no HTTP, and no adapter**, in exactly the style
`server/utils/world-rules-roll.ts` already demonstrates. Given that §9.1 rejects the Directus
alternative primarily *on testability grounds*, the recommended design must actually deliver it.

## 9.3 `resolvePrincipal(event)` was three things fused — the L6 correction

Revision 1's signature took an `H3Event`: a Nitro type, in a function meant to express identity. It
did four jobs at once. They belong to three layers:

| Job | Layer | Why |
|---|---|---|
| Extract the credential from the request | **Infrastructure** | HTTP/cookie transport. A CLI, websocket, or test has no cookie |
| Verify credential → account identity | **Infrastructure** (`SessionStore` port) | I/O against whatever issued the session — Directus today (§6.3) |
| Load the Account, its platform roles, its memberships | **Application** (via repositories) | Orchestration over ports |
| Assemble the **Principal** | **Domain** | Principal is a domain concept; assembling it is domain construction |

`requireCapability` likewise splits: the **decision** is `can()` (domain, pure); **throwing HTTP 403**
is infrastructure, because 403 is an HTTP fact. A CLI invocation of the same use case should fail
with a domain error, not an HTTP one.

The practical consequence is the point: a use case like *"activate a rules package for this world"*
becomes reachable from an HTTP route, a maintenance script, or a test **with identical authorization
semantics**, because none of the authorization logic knows how the caller arrived. Eldra already has
the script case — `scripts/directus/*.mjs` currently reimplements logic rather than calling it,
which is why the reset script needed its own tests to prove behaviour the application already
encoded elsewhere.

## 9.4 Scope must be derived, never accepted

Because `worldId` arrives from the URL and is trusted (§2.9), the membership lookup must authorize
the scope in the same operation that authorizes the action. If the principal holds no membership in
that world, the check fails regardless of what the URL says.

Under the boundary this becomes stronger than revision 1 could state it: **the derivation lives in
domain policy over repository-supplied memberships, so it holds identically under every adapter.** An
adapter cannot weaken it, forget it, or implement it differently — which is precisely the failure mode
that makes horizontal privilege escalation survive audits.

---

# 10. The Repository Boundary

## 10.1 Purpose

Not abstraction for its own sake. One purpose: **Eldra's domain and application layers must be able
to express everything they need without naming a storage engine.** Directus becomes one
implementation; Postgres, Supabase, PocketBase, Appwrite, or a bespoke store become others.

## 10.2 The repositories, and what each is *for*

Named by the domain concept they serve, never by the table they read:

| Repository | Serves | Notable operations (intent, not signatures) |
|---|---|---|
| `AccountRepository` | Account identity | find by id; find by identity link; create; link/unlink a provider |
| `MembershipRepository` | Membership | memberships for an account; members of a world; assign/remove role |
| `InvitationRepository` | Invitation | issue; find by token; accept; revoke; expire |
| `WorldRepository` | World | create (with an owner); read; update settings; delete; list for an account |
| `EntityRepository` | Entity + blocks | read; create; update; delete; list by world/type; **ownership** |
| `CharacterSheetRepository` | Character sheets + inventory | load aggregate; save aggregate |
| `RulesPackageRepository` | Rules packages | list installed; load published by (id, version); publish |
| `WorldRulesConfigRepository` | World rules binding | load; save; bump config version |
| `ContentPackRepository` | Content packs | list installed; load by (id, version); publish |
| `SceneRepository` | Scenes, layers, layer objects | load scene; create/update/delete layer objects |
| `MediaRepository` | Media references | store; resolve a `MediaRef` to a URL (§10.4) |
| `AuditRepository` | Audit entries | append; query |

Two supporting ports that are not repositories but belong to the same boundary: `SessionStore`
(§6.3) and `Clock`/`IdGenerator` (so domain logic remains deterministic and testable — the Rules
Engine's existing seed discipline already depends on this idea).

## 10.3 The rule that decides whether this works

> **A repository must express domain intent. The moment its interface admits storage mechanics, the
> coupling has moved rather than disappeared.**

This is where repository layers usually fail, so the prohibitions are explicit. A repository must
**not**:

- accept or return **filter syntax** — no `{ world_id: { _eq: 5 } }`. That is Directus's query
  language wearing an interface. `membersOf(worldId)` is intent; a filter object is mechanics.
- return **raw rows**. `directusServiceRequest` returns snake_case shapes that CLAUDE.md notes are
  hand-normalized per call site. Normalization belongs *inside* the adapter; the domain receives
  domain objects.
- expose **vendor identifiers**. `directusFileId` (§2.4) is the canonical violation. The domain has a
  `MediaRef`; only the adapter knows it resolves to a Directus asset id.
- leak **pagination, `fields=`, or `limit=-1` semantics**. These are transport concerns; a store that
  returns everything in one call and one that pages should be indistinguishable.
- offer a **generic escape hatch** — no `raw(query)`. One such method makes every other guarantee
  optional, and it will be used under deadline pressure.

A useful test: *could this interface be implemented over a JSON file, in memory, and over Postgres,
without any of the three feeling wrong?* If not, storage has leaked in.

## 10.4 Media is a port, and it is the most urgent one

§2.4 found the browser building `` `${directusBase}/assets/${id}` `` in at least ten components, with
`public.directusUrl` shipped in the client bundle. This is simultaneously:

- a violation of CLAUDE.md's existing rule that the client never talks to Directus,
- the reason a Directus replacement currently breaks the **presentation layer**, and
- the easiest leak to seal, because the domain concept (`MediaRef` → a URL) is trivial.

It is called out separately because it is the one leak that has already escaped the server entirely,
and every new component that renders an image widens it.

---

# 11. Enforcement — Phase 0, revisited

The task asks whether authorization should operate against repositories or against Directus. **Against
repositories**, and the implications for maintainability are the strongest argument in this document.

## 11.1 If authorization queried Directus directly

- The most security-critical code in Eldra would be the **most vendor-coupled**, and replacing the
  store would mean rewriting security under schedule pressure — the worst possible circumstance for
  that particular rewrite.
- Permission tests would require a live Directus (or elaborate HTTP mocks), so in practice the
  permission matrix would be **under-tested exactly where correctness matters most**. §9.1 rejects the
  Directus alternative *because* it is untestable; an enforcement layer that queries Directus directly
  reintroduces the same defect through the back door.
- Each of ~66 call sites would embed its own query, so a policy change (adding a role, changing an
  inheritance rule) would be a survey of the codebase rather than an edit to one module.

## 11.2 Against repositories

- Policy is pure and centralized; the store is swappable beneath it.
- The permission matrix is unit-testable with in-memory repositories — no database, no HTTP.
- A new adapter inherits **all** authorization behaviour with zero security code written. That is the
  property that makes "self-hosters may replace Directus" a safe offer rather than a liability: a
  self-hoster implementing `MembershipRepository` cannot accidentally weaken authorization, because
  they never touch it.

## 11.3 Phase 0, restated

Revision 1's Phase 0 (deny-by-default middleware, capability declarations on existing routes) is
**still the correct first step and still comes before ownership semantics.** Revision 2 changes one
thing: the checks resolve principals and memberships through **ports**, even while the only
implementation is Directus and even while single-user mode returns an implicit Owner.

That single constraint is what prevents Phase 0 from becoming the largest new pile of Directus-coupled
code in the repository — which is exactly what would have happened under revision 1 as written (L7).

The deny-by-default property is unchanged and remains essential: a route that forgets to declare a
capability must **break loudly in development**, not silently serve data. This is the structural
version of CLAUDE.md's observation that a forgotten `bootstrap.mjs` line failed silently and cost
weeks — the same class of error, given a loud failure mode.

---

# 12. Adoption — deliberately incremental

CLAUDE.md is unambiguous: *prefer incremental evolution over rewrites; favour small reviewable changes
over large sweeping refactors; do not invent abstractions unless asked.* A big-bang hexagonal rewrite
of 142 routes and 46 utility modules would violate all three and block the roadmap's stated #1 and #2
priorities.

**The boundary is introduced at the seam of new work, and legacy paths migrate opportunistically —
some may never migrate, and that is acceptable.** This is the same strategy that took
`scene_layer_objects` to production alongside `map_pins`, including the part where the legacy
collection stays in use indefinitely.

**Phase 0 — Enforcement skeleton, port-shaped from birth.** ✅ **Done.**
Authorization policy as pure domain; principal resolution split per §9.3; deny-by-default middleware;
capability declarations on existing routes. `resolvePrincipal` may return an implicit single Owner.
Converts today's open API into a closed one, and delivers value even if every later phase is deferred.

**Phase 1 — Accounts and identity.** ✅ **Done** (storage adapter, not ports — see §12.1).
Account and IdentityLink as domain concepts; Directus remains the credential verifier (§6.3).
`isAdmin` becomes platform capabilities. *Adapter backfill of existing Directus users is a separate
step from introducing the concept* (L9) — implemented as **lazy provisioning on first
authentication** plus one deliberate, explicitly-invoked bootstrap for the existing administrator;
no bulk migration of `directus_users` was performed or is planned.
`AccountRepository`/`SessionStore` as named ports are **not** built; `server/utils/eldra-accounts.ts`
is a single module with its Directus adapter isolated behind an internal divider.

**Phase 2 — Worlds, membership, ownership.** ◐ **Membership done; `worlds.owner_id` not retired.**
`WorldRepository`, `MembershipRepository`. **A world-creation use case — which does not exist today
(§2.5)** — and with it, the retirement of `worlds.owner_id`.

**Phase 3 — Invitations.** `InvitationRepository`, accept flow, role assignment in Game Admin.
*Future phase — not started.*

**Phase 4 — Entity ownership.** Owning Account on entities; `character.edit_own` vs `.edit_any`.
*Future phase — not started, and deliberately excluded from Phase 1.* It is now **unblocked**: a
stable, provider-neutral Account id is the thing it needed and did not have. What it still needs is
its own linked-record semantics and tests (what happens to a character when its owning Account is
removed), which is why it was not bundled in.

**Phase 5 — External providers.** OAuth/OIDC per provider as additional `CredentialVerifier`
implementations. *Future phase — not started. No provider is configured, chosen, or named in code:*
the only `eldra_identity_links.provider` value that exists is `'directus'`. Deliberately last: most
visible, least architectural, and doing it before Phase 1 would hardcode a provider into the identity
model. Adding one is a new row value plus a verifier, not a change to the identity model — which is
the property Phase 1 was built to buy.

**Phase 6 — Audit log.** Whose stated blocker was exactly this document (§2.10). *Future phase — not
started.*

---

## 12.1 Implementation status

Precise, so nothing in this document is mistaken for working code.

### Built

| Thing | Where |
|---|---|
| Capability vocabulary, `WORLD_ROLE_CAPABILITIES`, `Scope`, `can()`, `requireCapability()` | `server/utils/authorization.ts` |
| Deny-by-default `/api/**` enforcement | `server/middleware/authorize.ts` |
| World Membership persistence + administration | `server/utils/world-memberships.ts`, `world_memberships` |
| Eldra Account / IdentityLink / platform grant | `server/utils/eldra-accounts.ts`, `eldra_accounts` / `eldra_identity_links` / `eldra_platform_grants` |
| Schema provisioning | `scripts/directus/create-eldra-accounts-schema.mjs` (registered in `bootstrap.mjs`) |
| Deliberate administrator grant + ownerless-World backfill | `scripts/directus/bootstrap-eldra-platform-admin.mjs` |

### Deliberately not built, and why

- **`CredentialVerifier` / `SessionStore` / repository ports.** Named in §6.3/§10 as design. Phase 1
  needed neither to make identity provider-neutral, and inventing them with one implementation each
  would be the speculative abstraction §12's own preamble rules out.
- **Eldra-issued sessions and local password hashing.** Directus still verifies credentials and
  issues tokens. Owning password hashes means owning their parameters, rotation and reset flow — a
  separate, larger decision, and nothing in Phase 1 required it.
- **Re-keying live `world_memberships` / `roll_events` rows.** Both stores hold Directus user ids in
  rows written before Phase 1. Rather than mutate live content, reads match the Account id **and**
  every linked provider subject (`Principal.accountLookupKeys`), while writes always use the Account
  id — so the legacy half only shrinks. A bulk re-key is a separate, approvable migration and is not
  required for correctness.

### What a Directus outage means today

| Capability | Works without Directus? |
|---|---|
| Sign in / refresh / sign out | **No** — Directus is the credential verifier and session issuer |
| Resolve a Principal | **No** — session validation calls Directus `/users/me` |
| Eldra Account / grant / membership reads | **No** — stored in Directus's PostgreSQL via its REST API |
| Capability *policy* evaluation (`can()`, role→capability) | **Yes** — pure, no I/O, no Directus |

The fourth row is the only one Phase 1 was about. The first three are Phase 5/§6.3 work.

### Storage choice, stated plainly

The three identity collections live in Directus's PostgreSQL and are reached through its REST API,
not through a direct `pg` connection. PostgreSQL is the storage baseline; no claim of
database-engine portability is made or implied. The reasons, in order: Directus's response cache
invalidates only on its own `ItemsService` mutations, so writing *around* it reintroduces exactly
the stale-read class of bug `server/utils/character-resource-atomic.ts` documents against production;
deploying needed no new database credential or grant; and the two composite uniqueness constraints
that actually matter are enforced at the database through canonical `identity_key` / `grant_key`
columns. A direct-`pg` adapter — following the bounded-pool, least-privilege, parameterized-query
precedent already in `character-resource-atomic.ts` — remains available and would mean rewriting one
module's adapter section.

### Deployment runbook

Phase 1 removes the implicit "Directus Administrator ⇒ Eldra platform administrator" grant. Until
`bootstrap-eldra-platform-admin.mjs` runs, the administrator signs in successfully and holds **no**
platform capability — fail-closed, and the admin workspace is unreachable. Every step below is
idempotent.

**Step 1 — provision the collections.** `node scripts/directus/bootstrap.mjs`.

**Step 2 — verify the schema actually exists.** Directus answers an *unprovisioned* collection and an
*inaccessible* one with the byte-identical `403 FORBIDDEN` (verified against 11.12.0 with an
`admin_access` token, against a control collection that does not exist), so a 403 proves neither.
Confirm instead that `GET /collections` lists `eldra_accounts`, `eldra_identity_links` and
`eldra_platform_grants`, **and** that an item read against each succeeds. Collection *schema* access
and collection *item* access are separate Directus concerns.

**Step 3 — confirm the subject, read-only, before granting anything.** This is mandatory, not
advisory. `--directus-user-id` is never inferred, and the specific mistake to rule out is granting
Eldra platform administration to the **service account whose token the script itself authenticates
with** — which would make the two permission systems Phase 1 just separated share a principal again.
Run `--list-users` and confirm the chosen id:

- **has an email and a non-null `last_access`** — i.e. it is a human who interactively signs in; and
- **is not the id that `GET /users/me` returns for `DIRECTUS_TOKEN`** — that one is the service
  account, and on this instance it has no email and has never signed in.

The script prints a `SUBJECT CHECK` block and warns loudly when the subject has no email, but the
operator confirms it.

*Verified read-only for this instance:* `12dbac5d-476b-4933-819a-c83de299239a` is
`sam@theledouxs.com` / "Admin User" / `Administrator` / last access 2026-11-02 — the interactive
administrator. The service token resolves to `04523cf3-7953-4b6a-b924-509c865228ad` /
"Eldra Automation" / no email / never accessed. They are different accounts.

**Step 4 — grant, dry-run first.**
`bootstrap-eldra-platform-admin.mjs --directus-user-id=<uuid>` prints the full plan and writes
nothing; re-run with `--apply`. This writes **only** to the three Phase 1 collections: the Account,
its IdentityLink, and one grant row per capability.

**Step 5 — restore access to ownerless Worlds, as a separate decision.** `--apply` deliberately does
*not* create World memberships. A World with no membership rows at all (on this instance: World 1
"Varin") was reachable only through the removed fallback, so it now grants nothing to anyone and
needs a real owner — but that write lands in live shared data, assigns ownership of a World that
currently has none, and is **not** undone by `--revoke`. It therefore requires
`--backfill-ownerless-worlds` passed explicitly. The plan always lists the candidates, marked out of
scope, so the separation costs no visibility.

**Step 6 — deploy the application, then verify** that a real sign-in works and the admin workspace
loads.

**Rollback.** `--revoke --apply` deletes exactly the grant rows; the Account and IdentityLink remain
and are inert without grants. Backfilled memberships are *not* removed — they are listed for manual
removal, which is the main reason step 5 is separate. Reverting the code alone also restores prior
behaviour, because Phase 1 rewrites no pre-existing row.

**Ordering note.** Steps 1–2 before step 6 is strongly preferred but no longer load-bearing for
recoverability: `/api/auth/login` sets session cookies only after every required identity resolution
succeeds, so a deploy that reaches users before the schema exists produces an ordinary failed login
(error, no cookie, `/login` still renders) rather than a cookie-bearing session that breaks every
page including the login form.

**Running in parallel:**

- **Content Packs** gate the content re-import and cannot wait for Phase 4 (§14.5).
- **The media port** (§10.4) is independently valuable, small, and fixes an existing CLAUDE.md
  violation.
- **Repository extraction for existing subsystems** happens *when those subsystems are next touched
  for other reasons* — never as a standalone refactor. The Character Sheet infrastructure refactor is
  already the roadmap's #1 priority, which makes it the natural first candidate.

---

# 13. Long-Term Risks

1. **The enforcement retrofit is abandoned half-finished.** Memberships ship, the UI respects them,
   thirty routes still answer unauthenticated callers — strictly worse than today, because it invites
   trust. *Mitigation: deny-by-default lands first, in Phase 0, before any ownership model exists.*

2. **The boundary becomes ceremony.** Repositories that wrap single Directus calls one-for-one, adding
   indirection without decoupling — the classic failure. *Mitigation: §10.3's prohibitions, and the
   test that an interface must be implementable over a JSON file without feeling wrong. If a
   repository method reads like a query, it is one.*

3. **Over-correction stalls the roadmap.** A full architectural rewrite is not what CLAUDE.md asks for
   and would block Character Sheet work indefinitely. *Mitigation: §12 — boundary at the seam of new
   work only; explicit permission for legacy paths never to migrate.*

4. **Content packs are deferred "just for this import."** The copy model calcifies the moment content
   is re-imported, and every later migration must reconcile per-world edits that did not exist at
   import time — rules-engine.md §31.11's predicted data-loss scenario arriving through the content
   door. *Note that under §7.3 this risk is smaller than revision 1 implied: what must be decided now
   is pack identity and version pinning, not the physical storage strategy.*

5. **Platform Admin quietly becomes a world superuser** because it is convenient during development —
   and because it is *already* true (§2.7). *Mitigation: break-glass exists from Phase 1 so there is
   always a sanctioned path.*

6. **Two half-migrated worlds.** During a long incremental migration, some code reaches repositories
   and some reaches Directus directly, and it becomes unclear which rules apply where. *Mitigation:
   the direction of travel must be one-way — new code never adds a direct Directus call outside an
   adapter, even when a neighbouring file does.*

7. **The media leak widens.** Every new component that renders an image copies the
   `${directusBase}/assets/` pattern from its neighbour (§10.4).

8. **Capability sprawl.** Twenty-three world capabilities is near the limit of what a human assigns
   correctly. Each new one must justify itself against an existing bundle.

---

# 14. Rejected Alternatives

| Rejected | Why |
|---|---|
| **Directus permissions as the authorization engine** | Dynamic per-world membership does not map to static roles/policies; policy would live outside the repo, untestable and unversioned; requires every player to be a CMS user (§9.1). |
| **Authorization querying Directus directly** *(new in rev 2)* | Makes the most security-critical code the most vendor-coupled, and makes the permission matrix untestable — reintroducing the exact defect that disqualified the row above (§11.1). |
| **Keep `directus_users` as the player directory** | Lets the installed persistence engine define Eldra's identity model. Already leaking: all live users are Administrators, two lack email (§6.1). |
| **Content Packs justified by storage deduplication** *(rev 1's own argument, retired)* | Adapter-specific and falsifiable; describes a symptom rather than the missing concept; invites a schema solution to a domain problem (§7.1). |
| **Reference-vs-copy as an architectural decision** *(new in rev 2)* | It is an implementation strategy. Pack identity and version pinning are the architecture; the boundary makes the storage strategy reversible (§7.3). |
| **Pure RBAC with `if (isGM)` checked inline** | Every new role touches every enforcement site; custom roles become architectural rather than data changes (§8.7). |
| **Full per-object ACL from day one** | Solves cases nobody has. Two-tier ownership solves the one real case (§8.4). |
| **Organizations / Teams as world owners** | Nothing on either side of the boundary yet — the same reasoning world-configuration.md §1 used to reject Campaign-vs-World, which proved correct. Membership already supports multi-user worlds. |
| **Email as the identity key** | Mutable, reassignable, frequently absent — two of three live accounts have none (§6.2). |
| **Route middleware as the security boundary** | Vue router middleware runs in a browser that chooses to run it; the API beneath is open regardless (§2.1). |
| **Big-bang hexagonal rewrite** *(new in rev 2)* | Violates CLAUDE.md's incremental-evolution rule and blocks the roadmap's top two priorities (§12). |
| **A generic `raw(query)` escape hatch on repositories** *(new in rev 2)* | One such method makes every other guarantee optional, and deadline pressure guarantees its use (§10.3). |

---

# 15. If Directus disappeared tomorrow, what should remain completely unchanged?

The deliverable's central question, answered concretely against real paths.

## 15.1 Unchanged today, with no work — verified

| Path | Evidence |
|---|---|
| `app/lib/rules/**` (22 modules, bulk of ~860 tests) | Six mentions of "Directus", all comments *asserting its absence* |
| `app/lib/systems/**` | Zero references |
| `app/lib/importers/**` (pure 5etools mappers) | Zero references |
| `app/lib/eldra/**` (domain types, Scene Graph model) | Zero references |

**The entire Rules Platform — engine, expression language, evaluator, modifier pipeline, roll engine,
world-config resolution, package validation — survives a persistence replacement untouched, today.**
That is not aspiration; it is the current state, and it is the proof that the discipline is
achievable in this codebase.

## 15.2 Unchanged once the boundary exists

- Permission policy (`can()`, role→capability, scope derivation)
- Content pack identity, version pinning, override resolution
- Character sheet math, once separated from character-sheet persistence
- Every Vue component and page — **after** the media port closes §2.4's leak
- Use cases, which depend on ports rather than adapters

## 15.3 Must change — correctly, because this *is* the adapter

- `server/utils/directus.ts`, `directus-admin.ts`
- `scripts/directus/**` (schema provisioning)
- The Directus repository implementations
- `server/utils/eldra-accounts.ts`'s adapter section (below its own `DIRECTUS ADAPTER` divider) —
  the identity *model* above that divider is storage-agnostic; the queries below it are not, and are
  meant to be the thing that gets rewritten

This is the definition of success: the blast radius of replacing a store is exactly the store's own
adapter.

## 15.4 Would change today but should not — the honest gap

- ~46 `server/utils/*.ts` modules fusing domain logic with Directus calls: `character-sheets.ts`,
  `entity-factory.ts`, `entity-relationships.ts`, `scene-layer-objects.ts`, `rules-packages.ts`,
  `world-rules-config.ts`, `import-save.ts`, `map-data.ts`, `map-pins.ts`, `homebrew/**`
- ~20 further modules with hand-rolled `dxFetch` copies
- 142 `server/api/**` routes
- ~10 Vue components building `/assets/` URLs, plus `nuxt.config.ts`'s `public.directusUrl`
- Page-level normalization carrying `directusFileId`

**§15.4 is the work.** Its size is why §12 insists on incremental adoption rather than a single
refactor.

---

# 16. Project Knowledge Review

**1. Which parts of Eldra should never know Directus exists?**

The **domain** and the **presentation** layers, at both ends of the stack.

*Domain:* the Rules Engine, expression evaluation, world-config resolution, permission policy,
content pack identity and override resolution, character sheet math, and the World/Entity/Account/
Membership/Invitation concepts and invariants. These express what Eldra *is*; a storage engine cannot
be allowed to shape them, or the product's meaning changes when its infrastructure does.

*Presentation:* every Vue component and page. Today ten of them build Directus asset URLs and the
vendor's URL ships in the browser bundle (§2.4) — a leak that violates CLAUDE.md's own rule and makes
a store replacement break the UI.

The proof this is achievable: `app/lib/**` already satisfies it, with zero Directus references outside
purity assertions.

**2. What belongs inside the persistence layer?**

Everything that knows *how* data is stored and retrieved: the HTTP client and credentials; Directus's
query and filter syntax; row↔domain-object translation (including the snake_case normalization
CLAUDE.md notes is currently hand-rolled per call site); pagination, `fields=`, and `limit=-1`
mechanics; asset-URL construction; schema provisioning scripts; and vendor identifiers such as
Directus file ids.

Also, importantly: **compensating for what a store cannot enforce.** With only four real foreign keys
in the current schema, referential integrity is an application invariant. A future store enforcing it
is a bonus, never the mechanism.

**3. What belongs inside the domain layer?**

Everything that would still be true if Eldra stored its data in files: the rules of the game
(mechanics, evaluation, rolls), the rules of the product (who may do what, what a World is, what
ownership means, what a Content Pack is and how a pinned version resolves against overrides), and the
invariants that must hold regardless of store — exactly one Owner per World, one identity per
`(provider, subject)`, no cross-world references.

The test: *would this still be true on a different database?* If yes, it is domain.

**4. What belongs inside the application layer?**

Use cases and the port definitions they depend on. "Activate a rules package for this world", "invite
a member", "accept an invitation", "import a content pack", "execute a roll", "create a world" — each
orchestrating domain logic over repositories without knowing which implementation is present.

The application layer **owns the port interfaces**. If infrastructure defined them, the adapter would
again dictate the domain's shape. It also owns transaction/consistency orchestration — which matters
here because Directus offers no cross-collection transaction (as the reset script's design notes
established), so "safe against partial execution" is an application-level property expressed as
ordering and idempotence.

**5. Would replacing Directus require changes to the Rules Platform?**

**No — and this is verifiable today, not a promise.** `app/lib/rules/` contains 22 modules whose only
Directus mentions are comments asserting its absence. The engine receives a manifest, definitions, a
world config, and an actor state as plain objects; it performs no I/O by construction
(rules-engine.md §21.6: "Directus must never be in the evaluation path").

What *would* change: `server/utils/rules-packages.ts` and `world-rules-config.ts`, which load those
plain objects from Directus. Under §10.2 they become `RulesPackageRepository` and
`WorldRulesConfigRepository`, and the change is confined to their adapters. The boundary the Rules
Platform already respects is exactly the boundary this revision generalizes.

**6. Would replacing Directus require changes to the permission model?**

**No, provided §11's recommendation is followed** — and **yes, extensively, if it is not.**

This is the sharpest fork in the document. Authorization built directly on Directus queries would make
the most security-critical code the most vendor-coupled, force security to be rewritten under schedule
pressure, and leave the permission matrix untestable — reintroducing the exact defect that
disqualified Directus-as-authorizer in the first place (§9.1). Authorization built on
`MembershipRepository` yields pure, centralized, in-memory-testable policy that a new adapter inherits
**with zero security code written**. That property is what makes "self-hosters may replace Directus" a
safe offer: a self-hoster implementing a repository cannot weaken authorization, because they never
touch it.

**7. Would replacing Directus require changes to the Character Sheet?**

**Today, yes — and it is the worst case in the codebase.** Sheet logic is spread across
`character-sheets.ts`, `character-sheet-math.ts`, `character-sheet-resolver.ts`,
`character-sheet-inventory.ts`, and siblings, with Directus calls interleaved through several of them
(§2.3), plus an ~8,900-line `sheet.vue` that CLAUDE.md already identifies as the codebase's largest
deviation from its own conventions.

**After separation, no.** Sheet *math* is pure domain and would be untouched; sheet *persistence*
becomes `CharacterSheetRepository`; the Vue layer already talks only to `/api`.

The timing is fortunate rather than coincidental: **Character Sheet infrastructure refactor is the
roadmap's #1 priority.** That refactor is happening regardless, which makes it the natural place to
introduce the boundary for this subsystem — sequencing this work *with* the roadmap instead of
against it, and satisfying CLAUDE.md's "extract rather than rewrite" rule at the moment extraction is
already the plan.

---

# 17. What must be decided before another gameplay entity is imported

Unchanged from revision 1 in substance, sharpened by §7.3:

1. **Content Pack identity and version pinning** (§7). Not the physical storage strategy — the
   boundary makes reference-vs-copy reversible — but *whether imported content has a pack identity and
   a pinned version at all*. Content imported without one cannot acquire it later: provenance not
   captured at import is not reconstructible.
2. **Whether an Entity may carry an owning Account** (§8.4). Free against an empty store;
   unbackfillable later, because imported data records no owner. **Phase 1 unblocked the dependency**
   (a stable, provider-neutral Account id now exists to point at) but deliberately did not implement
   it — the decision, and its linked-record semantics, are still outstanding.

Strongly advisable though not strictly blocking:

3. **Phase 0's deny-by-default enforcement** (§11.3) — not because import requires it, but because
   `POST /api/import/save/5etools/*` is itself an unauthenticated, world-id-trusting write endpoint.
   Importing thousands of rows through it while it is open is the largest write surface the platform
   has ever exposed.

Everything else — accounts, providers, invitations, roles, session runtime, audit log, and the bulk of
the repository extraction — can land after content exists without re-migrating it.

**Decide identity, provenance, and ownership now. Decide storage strategy, people, and adapters
later.**
