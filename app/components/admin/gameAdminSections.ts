// Game Admin IA -- the rail's own section order, labels, and panel-key
// mapping. Extracted as a pure module (no I/O, no Vue) because this repo has
// no DOM test environment (vitest.config.ts is `environment: 'node'`), so
// the one thing worth unit-testing here -- "is the order/label/key mapping
// exactly what was agreed" -- needs to live beside admin.vue rather than
// inline inside it, the same reason characterBuilderSelection.ts exists
// beside create-v2.vue.
//
// PANEL KEY RENAMES, AND WHY: three of the ten keys below are NOT the same
// string the previous ('party'/'members'/'grants'/'transfers') panels used --
// `activePanel`'s own type in admin.vue is renamed to match, and every
// `v-else-if="activePanel === '...'"` in that template was updated alongside
// it, in the same commit, so no stale key is ever reachable.
//   party               -> player         (Player Management)
//   members             -> accounts       (User Accounts)
//   grants + transfers  -> inventory      (Inventory Management -- see
//                          admin.vue's own Inventory Management section
//                          header for why these two merge cleanly: both are
//                          operations over inventory ownership/movement,
//                          traced before merging, never assumed)
// `homebrew`, `overview`, `relationships`, `rules`, `content-packs`,
// `health`, `setup` are unchanged keys -- only their rail LABEL or ORDER
// moved, never their identity, so nothing that already branches on one of
// those seven needed to change.
import type { AdminRailSection } from './AdminSectionRail.vue'

export type GameAdminPanelKey =
  | 'overview'
  | 'player'
  | 'inventory'
  | 'homebrew'
  | 'accounts'
  | 'relationships'
  | 'rules'
  | 'content-packs'
  | 'health'
  | 'setup'

// PROCESS 2.0 -- GAME ADMIN IA & PLAYER OPERATIONS: this exact order and
// these exact labels, agreed before implementation (this task's own
// "AGREED GAME ADMIN SECTION ORDER" section) -- not alphabetized, not
// grouped by the previous panel boundaries.
export const GAME_ADMIN_SECTIONS: readonly (AdminRailSection & { key: GameAdminPanelKey })[] = [
  { key: 'overview', label: 'Overview', icon: 'i-lucide-layout-dashboard' },
  { key: 'player', label: 'Player Management', icon: 'i-lucide-users' },
  { key: 'inventory', label: 'Inventory Management', icon: 'i-lucide-gift' },
  { key: 'homebrew', label: 'Homebrew Lab', icon: 'i-lucide-flask-conical' },
  { key: 'accounts', label: 'User Accounts', icon: 'i-lucide-shield-check' },
  { key: 'relationships', label: 'Relationships', icon: 'i-lucide-share-2' },
  { key: 'rules', label: 'Rules', icon: 'i-lucide-scale' },
  { key: 'content-packs', label: 'Content Packs', icon: 'i-lucide-package-2' },
  { key: 'health', label: 'Project Health', icon: 'i-lucide-activity' },
  { key: 'setup', label: 'Page Setup', icon: 'i-lucide-sliders-horizontal' }
] as const
