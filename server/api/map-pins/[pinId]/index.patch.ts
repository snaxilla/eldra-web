import { updatePin } from '../../../utils/map-pins'

function normalizeEntityId(value: any): number | null | undefined {
  if (value === undefined) return undefined
  if (value === null || value === '' || value === 'null') return null
  const num = Number(value)
  return Number.isFinite(num) ? num : null
}

function normalizeString(value: any): string | null | undefined {
  if (value === undefined) return undefined
  if (value === null || value === '') return null
  return String(value)
}

export default defineEventHandler(async (event) => {
  const pinId = String(getRouterParam(event, 'pinId') || '')
  const body = await readBody(event)

  if (!pinId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing pinId' })
  }

  return await updatePin(pinId, {
    title: normalizeString(body.title),
    x: body.x !== undefined ? Number(body.x) : undefined,
    y: body.y !== undefined ? Number(body.y) : undefined,
    color: normalizeString(body.color),
    pinType: normalizeString(body.pinType),
    icon: normalizeString(body.icon),
    entityId: normalizeEntityId(body.entityId),
    linkedMapId: normalizeString(body.linkedMapId),
    summary: normalizeString(body.summary),
    image: normalizeString(body.image),
    inheritFromEntity: body.inheritFromEntity !== undefined ? body.inheritFromEntity === true : undefined,
  })
})
