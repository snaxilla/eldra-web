# Content Publishing -- Backlog

Status: **recorded, not implemented.** Workflow/tooling backlog for the Content Pack
publication pipeline, kept separate from
[character-decisions-presentation-backlog.md](character-decisions-presentation-backlog.md),
which is Character Sheet/Creator presentation-only.

## `packages:sync` / Refresh Content Package does not pick up a newly added candidate category

**Observed**: when the `feature-options` Content Source category was added to the XPHB
provider (Character Creator V3 -- Selected Option Explanations), `pnpm run packages:sync
--world Solaris` kept reporting Content `CURRENT` and performed no action, even after
`--apply`. Traced directly: `scripts/directus/packages-sync.mjs`'s own classification (and the
`refreshContentSource` function it calls for `--apply`) regenerate candidates and keep ONLY
those whose `externalId` already exists in the Content Pack's last published version ("keep
whatever was already selected, rebuilt with today's pipeline" -- `refresh.ts`'s own documented
rule). A brand-new category's candidates have no prior `externalId` to match, so they are
silently excluded from every regeneration, and the tool's own report gives no hint that
candidates exist but are unselected. The new Feature Options were only made available in the
live `eldra.solaris.xphb` pack after a MANUAL publish + rebind outside this tool.

**Desired outcome**: an explicit, reviewable way to widen a Content Pack's published selection
from the terminal, without `packages:sync`/refresh ever silently including content nobody
reviewed. One concrete direction already sketched (not committed to): a narrow, explicit
opt-in CLI flag (e.g. `--include-category <key>`) that both (a) in classification, reports what
a named new category would add instead of silently saying `CURRENT`, and (b) in the apply path,
includes that category's current candidates in the next published version.

**Do NOT, when this is picked up:**
- Make `packages:sync`/refresh auto-include every candidate the provider now offers -- that is
  the exact "never silently pull in new entries nobody has reviewed" rule this gap doesn't
  violate today, and any fix must keep that invariant.
- Conflate this with a Rules Package change -- this is entirely the Content Pack publication
  axis (`content_packs` + `world_content_pack_bindings`), never `rules_packages`/
  `world_rules_config`.

Not implemented here -- this pass only fixed Creator-side consumption of the already-published
Feature Options; the publication workflow gap above is unchanged.

## Media Gallery thumbnail delivery (recorded 2026-11-12, observed during Content Workspaces Pass A)

Recorded here rather than in
[character-decisions-presentation-backlog.md](character-decisions-presentation-backlog.md)
because this is the media/asset axis of the content pipeline
([content-workspaces-and-studio.md §13](content-workspaces-and-studio.md)), not Character
Sheet presentation.

**Observed**: Media Gallery cards appear to request original full-size files. Caldera image
cards reference 146.5 MB originals, and previews stay blank while loading.

**Not yet verified**: that the gallery genuinely downloads the full original is an inference
from the card markup and the observed delay — **the actual request path has not been
inspected**. The first task when this is picked up is to confirm what the gallery really
requests (Directus serves `/assets/:id` with transform parameters such as `?width=&height=&fit=`
and named presets, so the fix may be a missing query parameter rather than a missing feature).
Do not assert the full original is downloaded until a network trace or the component's own
request URL shows it.

**Desired outcome**: gallery cards request appropriately sized thumbnails/transforms or
generated previews, with lazy loading and useful loading/error states, while the
**full-resolution original is preserved unchanged** for map use — map overlays and tiling read
the original by file id and must keep getting the full-resolution asset.

**Do NOT, when this is picked up:**
- Downscale, re-encode, or replace the stored original. Map tiling depends on it.
- Introduce a second upload or storage path; the ownership policy
  (`directus_files.world_id`, Phase 0) stays the single source of truth for which World an
  asset belongs to.

Not implemented in Pass A — recorded only.
