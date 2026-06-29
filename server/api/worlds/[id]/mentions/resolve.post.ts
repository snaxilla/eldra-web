import { directusServiceRequest } from '../../../../utils/directus'

function cleanText(value: any) {
  return String(value ?? '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[#*_`>~-]/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizedKey(value: any) {
  return cleanText(value)
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function shortText(value: any, limit = 420) {
  const text = cleanText(value)
  if (!text) return ''
  return text.length > limit ? `${text.slice(0, limit).trim()}...` : text
}

function blockKey(block: any) {
  return String(block?.block_key || block?.blockKey || '')
}

function blockByKey(blocks: any[], key: string) {
  return blocks.find((block: any) => blockKey(block) === key) || null
}

function titleCase(value: any) {
  return cleanText(value)
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function extractImageUrl(entity: any, blocks: any[] = []) {
  if (entity?.image) {
    if (typeof entity.image === 'string') return `/api/assets/${entity.image}`

    if (typeof entity.image === 'object') {
      if (entity.image.image_url) return entity.image.image_url
      if (entity.image.file_id) return `/api/assets/${entity.image.file_id}`
      if (entity.image.id) return `/api/assets/${entity.image.id}`
    }
  }

  for (const block of blocks) {
    const image = block?.data?.image

    if (!image) continue

    if (typeof image === 'string' && image.trim()) return `/api/assets/${image}`

    if (typeof image === 'object') {
      if (image.image_url) return image.image_url
      if (image.file_id) return `/api/assets/${image.file_id}`
      if (image.id) return `/api/assets/${image.id}`
    }
  }

  return ''
}

function displayTypeFromBlocks(entity: any, blocks: any[]) {
  const locationCore = blockByKey(blocks, 'location_core')?.data || null
  const characterCore = blockByKey(blocks, 'character_core')?.data || null
  const itemCore = blockByKey(blocks, 'item_core')?.data || null
  const spellCore = blockByKey(blocks, 'spell_core')?.data || null
  const speciesCore = blockByKey(blocks, 'species_core')?.data || null
  const classCore = blockByKey(blocks, 'class_core')?.data || null
  const backgroundCore = blockByKey(blocks, 'background_core')?.data || null

  return cleanText(
    locationCore?.location_type ||
    locationCore?.locationType ||
    locationCore?.type ||
    characterCore?.character_type ||
    characterCore?.characterType ||
    characterCore?.type ||
    itemCore?.item_type ||
    itemCore?.itemType ||
    itemCore?.type ||
    spellCore?.school ||
    speciesCore?.type ||
    classCore?.type ||
    backgroundCore?.type ||
    entity?.entity_type ||
    'Entity'
  )
}

function tagsFromEntity(entity: any, blocks: any[]) {
  const tags: string[] = []
  const type = displayTypeFromBlocks(entity, blocks)

  if (type) tags.push(type)
  if (entity?.id) tags.push('Linked Article')

  return Array.from(new Set(tags.filter(Boolean)))
}

function summaryFromEntity(entity: any, blocks: any[]) {
  const articleOverride = String(blockByKey(blocks, 'article_override')?.data?.markdown || '').trim()
  const overview = String(blockByKey(blocks, 'overview')?.data?.text || '').trim()
  const itemCore = blockByKey(blocks, 'item_core')?.data || null
  const spellCore = blockByKey(blocks, 'spell_core')?.data || null
  const speciesCore = blockByKey(blocks, 'species_core')?.data || null
  const classCore = blockByKey(blocks, 'class_core')?.data || null
  const backgroundCore = blockByKey(blocks, 'background_core')?.data || null
  const locationCore = blockByKey(blocks, 'location_core')?.data || null
  const characterCore = blockByKey(blocks, 'character_core')?.data || null

  return shortText(
    entity?.summary ||
    articleOverride ||
    overview ||
    itemCore?.description ||
    spellCore?.description ||
    speciesCore?.description ||
    classCore?.description ||
    backgroundCore?.description ||
    locationCore?.description ||
    characterCore?.description ||
    ''
  )
}

function mentionMarkdown(target: any) {
  if (!target?.resolved) {
    return `No matching world entity was found for **${target?.title || target?.label || 'this mention'}**.`
  }

  return target.summary || 'No summary has been written for this entity yet.'
}

export default defineEventHandler(async (event) => {
  const worldId = Number(getRouterParam(event, 'id') || 0)

  if (!worldId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing world id'
    })
  }

  const body = await readBody(event).catch(() => ({}))
  const mentions = Array.from(new Set(
    (Array.isArray(body?.mentions) ? body.mentions : [])
      .map((mention: any) => cleanText(mention))
      .filter(Boolean)
      .slice(0, 80)
  ))

  if (!mentions.length) {
    return { mentions: {} }
  }

  const entitiesRes = await directusServiceRequest('/items/entities', {
    method: 'GET',
    query: {
      filter: { world_id: { _eq: worldId } },
      sort: 'title',
      limit: -1,
      fields: [
        'id',
        'title',
        'slug',
        'world_id',
        'system_key',
        'entity_type',
        'status',
        'visibility',
        'summary',
        'image'
      ].join(',')
    }
  })

  const timelinesRes = await directusServiceRequest('/items/world_timelines', {
    method: 'GET',
    query: {
      filter: { world_id: { _eq: worldId } },
      sort: 'sort_order,title',
      limit: -1,
      fields: '*'
    }
  }).catch(() => ({ data: [] }))

  const eventsRes = await directusServiceRequest('/items/world_timeline_events', {
    method: 'GET',
    query: {
      filter: { world_id: { _eq: worldId } },
      sort: 'sort_order,date_label,title',
      limit: -1,
      fields: '*'
    }
  }).catch(() => ({ data: [] }))

  const entities = Array.isArray(entitiesRes?.data) ? entitiesRes.data : []
  const timelines = Array.isArray(timelinesRes?.data) ? timelinesRes.data : []
  const timelineEvents = Array.isArray(eventsRes?.data) ? eventsRes.data : []
  const entityIds = entities.map((entity: any) => entity.id).filter(Boolean)

  let blocks: any[] = []

  if (entityIds.length) {
    const blocksRes = await directusServiceRequest('/items/block_instances', {
      method: 'GET',
      query: {
        filter: { entity_id: { _in: entityIds } },
        sort: 'entity_id,sort',
        limit: -1,
        fields: '*'
      }
    })

    blocks = Array.isArray(blocksRes?.data) ? blocksRes.data : []
  }

  const blocksByEntityId = new Map<string, any[]>()

  for (const block of blocks) {
    const entityId = String(block.entity_id || '')
    if (!entityId) continue

    if (!blocksByEntityId.has(entityId)) {
      blocksByEntityId.set(entityId, [])
    }

    blocksByEntityId.get(entityId)!.push(block)
  }

  const timelineById = new Map<string, any>()
  for (const timeline of timelines) {
    timelineById.set(String(timeline.id), timeline)
  }

  function findEntityForMention(mention: string) {
    const wanted = normalizedKey(mention)

    if (!wanted) return null

    return (
      entities.find((entity: any) => normalizedKey(entity?.title) === wanted) ||
      entities.find((entity: any) => normalizedKey(entity?.slug) === wanted) ||
      entities.find((entity: any) => normalizedKey(String(entity?.slug || '').replace(/-/g, ' ')) === wanted) ||
      entities.find((entity: any) => normalizedKey(entity?.title).includes(wanted)) ||
      null
    )
  }

  function findTimelineEventForMention(mention: string) {
    const wanted = normalizedKey(mention)

    if (!wanted) return null

    return (
      timelineEvents.find((item: any) => normalizedKey(item?.title) === wanted) ||
      timelineEvents.find((item: any) => normalizedKey(item?.slug) === wanted) ||
      timelineEvents.find((item: any) => normalizedKey(String(item?.slug || '').replace(/-/g, ' ')) === wanted) ||
      timelineEvents.find((item: any) => normalizedKey(item?.title).includes(wanted)) ||
      null
    )
  }

  function findTimelineForMention(mention: string) {
    const wanted = normalizedKey(mention)

    if (!wanted) return null

    return (
      timelines.find((item: any) => normalizedKey(item?.title) === wanted) ||
      timelines.find((item: any) => normalizedKey(item?.slug) === wanted) ||
      timelines.find((item: any) => normalizedKey(String(item?.slug || '').replace(/-/g, ' ')) === wanted) ||
      timelines.find((item: any) => normalizedKey(item?.title).includes(wanted)) ||
      null
    )
  }

  const out: Record<string, any> = {}

  for (const mention of mentions) {
    const key = normalizedKey(mention)

    const timelineEvent = findTimelineEventForMention(mention)

    if (timelineEvent) {
      const timeline = timelineById.get(String(timelineEvent.timeline_id)) || null
      const timelineTitle = cleanText(timeline?.title || 'Timeline')
      const timelineSlug = cleanText(timeline?.slug || timeline?.id || '')
      const eventSlug = cleanText(timelineEvent.slug || timelineEvent.id)
      const dateRange = cleanText(
        timelineEvent.date_label && timelineEvent.end_date_label
          ? `${timelineEvent.date_label} - ${timelineEvent.end_date_label}`
          : timelineEvent.date_label || timelineEvent.end_date_label || ''
      )
      const displayType = titleCase(timelineEvent.event_kind || 'Timeline Event') || 'Timeline Event'
      const url = `/worlds/${worldId}/timelines/${timelineSlug || timelineEvent.timeline_id}#${eventSlug}`

      const target = {
        resolved: true,
        label: mention,
        id: timelineEvent.id,
        title: cleanText(timelineEvent.title || mention),
        slug: eventSlug,
        entityType: 'timeline_event',
        type: 'timeline_event',
        displayType,
        summary: shortText(timelineEvent.summary_markdown || ''),
        url,
        tags: [displayType, timelineTitle, dateRange].filter(Boolean),
        detailLines: [
          timelineTitle ? `Timeline: ${timelineTitle}` : '',
          dateRange ? `Date: ${dateRange}` : '',
          timelineEvent.visibility ? `Visibility: ${titleCase(timelineEvent.visibility)}` : ''
        ].filter(Boolean)
      }

      out[key] = {
        ...target,
        markdown: mentionMarkdown(target)
      }

      continue
    }

    const timeline = findTimelineForMention(mention)

    if (timeline) {
      const target = {
        resolved: true,
        label: mention,
        id: timeline.id,
        title: cleanText(timeline.title || mention),
        slug: timeline.slug,
        entityType: 'timeline',
        type: 'timeline',
        displayType: 'Timeline',
        summary: shortText(timeline.description || ''),
        url: `/worlds/${worldId}/timelines/${timeline.slug || timeline.id}`,
        tags: ['Timeline'],
        detailLines: [
          timeline.visibility ? `Visibility: ${titleCase(timeline.visibility)}` : ''
        ].filter(Boolean)
      }

      out[key] = {
        ...target,
        markdown: mentionMarkdown(target)
      }

      continue
    }

    const entity = findEntityForMention(mention)

    if (!entity) {
      const unresolved = {
        resolved: false,
        label: mention,
        title: mention,
        entityType: '',
        summary: `No matching world entity was found for "${mention}".`,
        markdown: `No matching world entity was found for **${mention}**.`
      }

      out[key] = unresolved
      continue
    }

    const entityBlocks = blocksByEntityId.get(String(entity.id)) || []
    const title = String(entity.title || mention)
    const entityType = String(entity.entity_type || 'entity')
    const url = `/worlds/${worldId}/entities/${entity.id}`
    const imageUrl = extractImageUrl(entity, entityBlocks)
    const displayType = displayTypeFromBlocks(entity, entityBlocks)

    const target = {
      resolved: true,
      label: mention,
      id: entity.id,
      title,
      slug: entity.slug,
      entityType,
      type: entityType,
      displayType,
      summary: summaryFromEntity(entity, entityBlocks),
      imageUrl,
      url,
      tags: tagsFromEntity(entity, entityBlocks)
    }

    out[key] = {
      ...target,
      markdown: mentionMarkdown(target)
    }
  }

  return {
    mentions: out
  }
})
