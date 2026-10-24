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
