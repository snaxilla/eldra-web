// Pure helper behind Map creation/management (CREATION ENTRY POINTS, MAP
// THUMBNAILS, AND MAP WORDING). One capability covers every Map write --
// upload/create, set-parent, and set-default
// (server/api/worlds/[id]/maps/upload.post.ts,
// [mapId]/set-parent.post.ts, [mapId]/set-default.post.ts all require
// world.map.edit, confirmed by reading each route, not assumed).
export function canEditWorldMaps(capabilities: unknown): boolean {
  return Array.isArray(capabilities) && capabilities.includes('world.map.edit')
}
