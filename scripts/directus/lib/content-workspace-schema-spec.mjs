// Content Workspaces schema, declared once -- Content Workspaces & Studio
// Phase 1 (.github/docs/architecture/content-workspaces-and-studio.md §6).
// Pure data: imported by the provisioning script, the verification
// script, and a unit test. No side effects on import.
//
// UNIQUENESS IS A DATABASE GUARANTEE HERE, NOT A CONVENTION. Directus's
// Fields API cannot declare a composite unique constraint, but it can
// declare a single-column one. Every composite invariant this design
// depends on is therefore stored as ONE derived key column marked
// `unique`, written by server/utils/content-workspace-keys.ts:
//
//   identity_key   workspace + contentEntityId     one row per logical entity
//   address_key    workspace + system/type/slug    one entity per address
//   source_key     workspace + upstream address    a re-import cannot duplicate
//   snapshot_key   entity + base transition        a retry cannot duplicate
//   package_id     (already a single column)       one lineage row per package
//   channel_key    package + channel               one head per channel
//   asset_key      release + asset                 one row per release asset
//
// `provisionCollection` never alters a field that already exists, so
// scripts/directus/verify-content-workspaces-schema.mjs is what proves
// these constraints are present on a given instance.

const KEY_LENGTH = 1024

const timestamps = [
  { field: 'created_at', type: 'timestamp', required: true },
  { field: 'updated_at', type: 'timestamp', required: true }
]

export const CONTENT_WORKSPACE_COLLECTIONS = [
  {
    collection: 'content_workspaces',
    icon: 'edit_note',
    displayTemplate: '{{title}} ({{workspace_key}})',
    note: 'Mutable, platform-scoped authoring libraries. Never a release: published content stays in content_packs. See content-workspaces-and-studio.md §6.1.',
    fields: [
      { field: 'workspace_key', type: 'string', required: true, unique: true, maxLength: 64, note: 'Human-stable slug. Unique.' },
      { field: 'title', type: 'string', required: true },
      { field: 'description', type: 'text' },
      { field: 'system_key', type: 'string', required: true, note: 'The one game system this workspace holds content for.' },
      { field: 'source_game_system_key', type: 'string', note: 'Provider identity this workspace was seeded from, when it was.' },
      { field: 'source_collection_key', type: 'string' },
      { field: 'status', type: 'string', required: true, defaultValue: 'active', note: 'active | archived' },
      { field: 'owner_account_id', type: 'uuid', note: 'Attribution only. Workspaces are platform-owned.' },
      ...timestamps
    ]
  },
  {
    collection: 'content_workspace_entities',
    icon: 'category',
    displayTemplate: '{{title}} ({{entity_type}})',
    note: 'One logical content entity inside a workspace. See content-workspaces-and-studio.md §6.2.',
    fields: [
      { field: 'workspace_id', type: 'uuid', required: true, indexed: true },
      { field: 'content_entity_id', type: 'string', required: true, maxLength: 64, note: 'Canonical identity. Minted once, never changed.' },
      { field: 'identity_key', type: 'string', required: true, unique: true, maxLength: KEY_LENGTH, note: 'workspace + content_entity_id. Unique.' },
      { field: 'address_key', type: 'string', required: true, unique: true, maxLength: KEY_LENGTH, note: 'workspace + system/type/slug. Unique.' },
      { field: 'source_key', type: 'string', unique: true, maxLength: KEY_LENGTH, note: 'workspace + upstream source address. Unique when set; null for authored entities.' },
      { field: 'system_key', type: 'string', required: true },
      { field: 'entity_type', type: 'string', required: true },
      { field: 'slug', type: 'string', required: true },
      { field: 'title', type: 'string', required: true, maxLength: 512 },
      { field: 'origin', type: 'string', required: true, note: 'authored | imported | derived' },
      { field: 'state', type: 'string', required: true, defaultValue: 'active', note: 'active | disabled' },
      { field: 'base_data', type: 'json', note: 'The currently accepted upstream base. Advances only after a source snapshot is written.' },
      { field: 'base_data_hash', type: 'string' },
      { field: 'base_source_ref', type: 'json' },
      { field: 'base_missing', type: 'boolean', required: true, defaultValue: false },
      { field: 'base_refs', type: 'json', required: true, note: 'Explicit equivalence evidence: the legacy addresses this entity was observed at.' },
      { field: 'slug_aliases', type: 'json', required: true },
      { field: 'authored_data', type: 'json' },
      { field: 'authored_presentation', type: 'json', required: true },
      { field: 'authored_mechanics', type: 'json', required: true },
      { field: 'authored_facet', type: 'json' },
      ...timestamps
    ]
  },
  {
    collection: 'content_entity_source_snapshots',
    icon: 'history',
    displayTemplate: '{{content_entity_id}} @ {{at}}',
    note: 'Immutable record of upstream bases. Never updated, never pruned. See content-workspaces-and-studio.md §6.3.',
    fields: [
      { field: 'workspace_id', type: 'uuid', required: true, indexed: true },
      { field: 'content_entity_id', type: 'string', required: true, maxLength: 64, indexed: true },
      { field: 'snapshot_key', type: 'string', required: true, unique: true, maxLength: KEY_LENGTH, note: 'entity + base transition. Unique, so a retried import cannot write a second copy.' },
      { field: 'source_key', type: 'string', maxLength: KEY_LENGTH },
      { field: 'disposition', type: 'string', required: true, note: 'accepted (the base advanced to this) | pending-review (upstream changed; the base did not advance)' },
      { field: 'previous_base_data', type: 'json', note: 'The base accepted before this import. Null only for a first import.' },
      { field: 'previous_base_data_hash', type: 'string' },
      { field: 'previous_source_ref', type: 'json' },
      { field: 'incoming_base_data', type: 'json', note: 'The upstream payload awaiting review. Set only for pending-review.' },
      { field: 'new_base_data_hash', type: 'string', required: true },
      { field: 'new_source_ref', type: 'json', required: true },
      { field: 'reconciliation', type: 'json', required: true },
      { field: 'at', type: 'timestamp', required: true },
      { field: 'actor_account_id', type: 'uuid' }
    ]
  },
  {
    collection: 'content_entity_revisions',
    icon: 'manage_history',
    displayTemplate: '{{kind}} @ {{at}}',
    note: 'Append-only authoring history. Only kind=autosave is ever pruned. See content-workspaces-and-studio.md §6.4.',
    fields: [
      { field: 'workspace_id', type: 'uuid', required: true, indexed: true },
      { field: 'content_entity_id', type: 'string', maxLength: 64, note: 'Null for workspace-level events.' },
      { field: 'kind', type: 'string', required: true, note: 'autosave | checkpoint | publish | revert | disable | adopt | slug-change' },
      { field: 'label', type: 'string' },
      { field: 'actor_account_id', type: 'uuid' },
      { field: 'at', type: 'timestamp', required: true },
      { field: 'diff', type: 'json', required: true },
      { field: 'snapshot', type: 'json' }
    ]
  },
  {
    collection: 'content_package_lineages',
    icon: 'account_tree',
    displayTemplate: '{{package_id}}',
    note: 'Single-writer registry: which workspace, if any, is the sole publisher of a package lineage. Authoritative. See content-workspaces-and-studio.md §11.',
    fields: [
      { field: 'package_id', type: 'string', required: true, unique: true, note: 'Unique: at most one lineage row per package.' },
      { field: 'owner_workspace_id', type: 'uuid' },
      { field: 'status', type: 'string', required: true, defaultValue: 'unadopted', note: 'unadopted | adopted | frozen' },
      { field: 'supersedes', type: 'json', required: true },
      { field: 'adopted_at', type: 'timestamp' },
      { field: 'adopted_by_account_id', type: 'uuid' },
      ...timestamps
    ]
  },
  {
    collection: 'content_release_channels',
    icon: 'alt_route',
    displayTemplate: '{{package_id}} / {{channel}}',
    note: 'Named release pointers per package. Schema only; no code reads or writes it before Phase 9.',
    fields: [
      { field: 'package_id', type: 'string', required: true },
      { field: 'channel', type: 'string', required: true, maxLength: 64 },
      { field: 'channel_key', type: 'string', required: true, unique: true, maxLength: KEY_LENGTH, note: 'package + channel. Unique.' },
      { field: 'version', type: 'string', required: true },
      { field: 'integrity', type: 'string' },
      { field: 'promoted_at', type: 'timestamp' },
      { field: 'promoted_by_account_id', type: 'uuid' },
      ...timestamps
    ]
  },
  {
    collection: 'content_pack_assets',
    icon: 'perm_media',
    displayTemplate: '{{package_id}} @ {{version}} / {{asset_id}}',
    note: 'Portable asset metadata per release. Schema only; no code reads or writes it before Phase 8. See content-workspaces-and-studio.md §6.6.',
    fields: [
      { field: 'package_id', type: 'string', required: true },
      { field: 'version', type: 'string', required: true },
      { field: 'asset_id', type: 'string', required: true, note: 'sha256-<hex>, content-addressed.' },
      { field: 'asset_key', type: 'string', required: true, unique: true, maxLength: KEY_LENGTH, note: 'release + asset. Unique.' },
      { field: 'sha256', type: 'string', required: true },
      { field: 'mime', type: 'string', required: true },
      { field: 'bytes', type: 'integer', required: true },
      { field: 'width', type: 'integer' },
      { field: 'height', type: 'integer' },
      { field: 'credit', type: 'string' },
      { field: 'license_id', type: 'string' },
      { field: 'origin', type: 'json', required: true },
      { field: 'file', type: 'uuid', required: true, note: 'Directus file id, shared across releases when sha256 matches.' },
      { field: 'created_at', type: 'timestamp', required: true }
    ]
  }
]

// Additive columns on a collection create-world-content-pack-bindings-
// schema.mjs owns. `binding_mode` is NOT NULL with a default, so Postgres
// fills it on every existing row when the column is added and on every
// insert that omits it -- verified against Directus 11.12.0 / Postgres 16.
export const BINDING_MODE_FIELDS = {
  collection: 'world_content_pack_bindings',
  fields: [
    { field: 'binding_mode', type: 'string', required: true, defaultValue: 'pinned', maxLength: 32, note: 'pinned | channel | workspace. Only pinned is implemented.' },
    { field: 'channel', type: 'string', maxLength: 64 },
    { field: 'workspace_id', type: 'uuid' },
    { field: 'priority', type: 'integer', note: 'Explicit precedence; null sorts last.' }
  ]
}

export const CONTENT_WORKSPACE_COLLECTION_NAMES = CONTENT_WORKSPACE_COLLECTIONS.map((spec) => spec.collection)
