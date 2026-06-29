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

function titleCase(value: any) {
  return cleanText(value)
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function worldSlugPrefix(worldId: number) {
  return `w${worldId}-`
}

function blockKey(block: any) {
  return String(block?.block_key || block?.blockKey || '')
}

function blockByKey(blocks: any[], key: string) {
  return blocks.find((block: any) => blockKey(block) === key) || null
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

  const prefix = worldSlugPrefix(worldId)

  const erasRes = await directusServiceRequest('/items/eras', {
    method: 'GET',
    query: {
      filter: {
        slug: { _starts_with: prefix }
      },
      sort: 'sort,name',
      limit: -1,
      fields: 'id,name,slug,description,start_year,end_year,sort,visibility'
    }
  }).catch(() => ({ data: [] }))

  const entities = Array.isArray(entitiesRes?.data) ? entitiesRes.data : []
  const eras = Array.isArray(erasRes?.data) ? erasRes.data : []
  const eraIds = eras.map((era: any) => era.id).filter(Boolean)

  const eventsRes = eraIds.length
    ? await directusServiceRequest('/items/events', {
        method: 'GET',
        query: {
          filter: {
            era: { _in: eraIds }
          },
          sort: 'start_date,title',
          limit: -1,
          fields: 'id,title,slug,era,start_date,end_date,summary,body,visibility,status'
        }
      }).catch(() => ({ data: [] }))
    : { data: [] }

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

  const eraById = new Map<string, any>()
  for (const era of eras) {
    eraById.set(String(era.id), era)
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
      eras.find((item: any) => normalizedKey(item?.name) === wanted) ||
      eras.find((item: any) => normalizedKey(item?.slug) === wanted) ||
      eras.find((item: any) => normalizedKey(String(item?.slug || '').replace(prefix, '').replace(/-/g, ' ')) === wanted) ||
      eras.find((item: any) => normalizedKey(item?.name).includes(wanted)) ||
      null
    )
  }

  const out: Record<string, any> = {}

  for (const mention of mentions) {
    const key = normalizedKey(mention)

    const timelineEvent = findTimelineEventForMention(mention)

    if (timelineEvent) {
      const era = eraById.get(String(timelineEvent.era)) || null
      const timelineTitle = cleanText(era?.name || 'Timeline')
      const timelineSlug = cleanText(era?.slug || era?.id || '')
      const eventSlug = cleanText(timelineEvent.slug || timelineEvent.id)
      const dateRange = cleanText(
        timelineEvent.start_date && timelineEvent.end_date
          ? `${timelineEvent.start_date} - ${timelineEvent.end_date}`
          : timelineEvent.start_date || timelineEvent.end_date || ''
      )
      const url = `/worlds/${worldId}/timelines/${timelineSlug || timelineEvent.era}#${eventSlug}`

      const target = {
        resolved: true,
        label: mention,
        id: timelineEvent.id,
        title: cleanText(timelineEvent.title || mention),
        slug: eventSlug,
        entityType: 'timeline_event',
        type: 'timeline_event',
        displayType: 'Timeline Event',
        summary: shortText(timelineEvent.body || timelineEvent.summary || ''),
        url,
        tags: ['Timeline Event', timelineTitle, dateRange].filter(Boolean),
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

    const era = findTimelineForMention(mention)

    if (era) {
      const yearRange = cleanText(
        era.start_year != null && era.end_year != null
          ? `${era.start_year} - ${era.end_year}`
          : era.start_year ?? era.end_year ?? ''
      )

      const target = {
        resolved: true,
        label: mention,
        id: era.id,
        title: cleanText(era.name || mention),
        slug: era.slug,
        entityType: 'timeline',
        type: 'timeline',
        displayType: 'Timeline',
        summary: shortText(era.description || ''),
        url: `/worlds/${worldId}/timelines/${era.slug || era.id}`,
        tags: ['Timeline', yearRange].filter(Boolean),
        detailLines: [
          yearRange ? `Years: ${yearRange}` : '',
          era.visibility ? `Visibility: ${titleCase(era.visibility)}` : ''
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
