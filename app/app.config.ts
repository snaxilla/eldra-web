// Nuxt UI app config. `colors.primary`/`neutral` are the platform-default
// (Fantasy) values; useEldraThemeRoot() overwrites them at runtime from the
// active theme (app/lib/eldra/themes.ts). Component slot classes below only
// reference theme-agnostic classes and token utilities (themes/surfaces.css,
// main.css) -- never theme colors -- so every theme restyles them through
// tokens. Surface colors themselves come from the --ui-* variable bridge in
// app/assets/css/themes/nuxt-ui.css.
export default defineAppConfig({
  ui: {
    colors: {
      primary: 'gold',
      neutral: 'slate'
    },
    // Dialogs are major surfaces: glass + the theme's corner ornaments.
    modal: {
      slots: {
        overlay: 'bg-eldra-ink/70 backdrop-blur-[2px]',
        content: 'eldra-glass-surface eldra-ornamented divide-eldra-accent/15 ring-1 ring-eldra-accent/30',
        title: 'eldra-display text-eldra-text-strong'
      }
    },
    slideover: {
      slots: {
        overlay: 'bg-eldra-ink/70',
        content: 'eldra-glass-surface eldra-ornamented divide-eldra-accent/15'
      }
    },
    // Menus, popovers and tooltips stay clean: quiet glass, no ornament.
    popover: {
      slots: {
        content: 'eldra-glass-menu ring-eldra-accent/30'
      }
    },
    dropdownMenu: {
      slots: {
        content: 'eldra-glass-menu ring-eldra-accent/30'
      }
    },
    contextMenu: {
      slots: {
        content: 'eldra-glass-menu ring-eldra-accent/30'
      }
    },
    selectMenu: {
      slots: {
        content: 'eldra-glass-menu ring-eldra-accent/30'
      }
    },
    select: {
      slots: {
        content: 'eldra-glass-menu ring-eldra-accent/30'
      }
    },
    tooltip: {
      slots: {
        content: 'eldra-glass-menu ring-eldra-accent/40 text-eldra-text-strong'
      }
    }
  }
})
