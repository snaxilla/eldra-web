// Pure helper behind the "Customize Page" entry point (World Page
// Presentation: background/mode) -- sibling to
// worldEntityDirectEditEligibility.ts's canEditWorldEntities, following
// the same established pattern: pure, capability-only, no `mode`
// parameter by construction, so gating this on Play/Build state can't be
// reintroduced through this gate the way entity Edit/Delete once was
// (see that file's own header for the full history). The server's own
// requireCapability('world.settings.edit', {kind:'world', worldId}) on
// the presentation write routes remains the real, unaffected,
// authoritative gate regardless of what this returns.
export function canEditWorldSettings(capabilities: unknown): boolean {
  return Array.isArray(capabilities) && capabilities.includes('world.settings.edit')
}
