// Pure helper behind Timeline creation/editing (CREATION ENTRY POINTS,
// MAP THUMBNAILS, AND MAP WORDING). One capability covers every Timeline
// write -- create, edit, delete, and every event operation
// (server/api/worlds/[id]/timelines/index.post.ts,
// [timelineId].patch.ts, [timelineId].delete.ts,
// [timelineId]/events.post.ts, [timelineId]/events/[eventId].patch.ts,
// [timelineId]/events/[eventId].delete.ts all require
// world.timeline.edit, confirmed by reading each route, not assumed) --
// unlike entities, there is no separate world.timeline.create.
export function canEditWorldTimelines(capabilities: unknown): boolean {
  return Array.isArray(capabilities) && capabilities.includes('world.timeline.edit')
}
