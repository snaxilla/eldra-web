// POST /api/players -- creates a new Player entirely from Eldra. This is
// the "Create Player" half of this task's OBJECTIVE
// ("Create Player -> Add Player to World, without exposing Directus").
// server/utils/players.ts does the actual work; this route parses/validates
// the request and translates failures into HTTP status codes.
//
// Authorization: authenticated-only, matching server/api/accounts/search.get.ts's
// own precedent exactly -- creating a Player is not itself a world- or
// platform-scoped privileged action (there is no Scope to check a
// capability against), and this task's own AUTHORIZATION section says so
// directly: "Reuse the existing authorization model. Do NOT redesign
// capabilities." The actual privileged operation -- adding this Player to
// a World -- is already gated by `world.member.invite` at
// POST /api/worlds/:id/members, unchanged by this task.
//
// Password/confirmation matching is checked HERE, not in createPlayer --
// see that function's own comment for why (the same split
// server/utils/worlds.ts already uses for `name` validation).
//
// createError/defineEventHandler/readBody/setResponseStatus are imported
// explicitly (the same reason server/middleware/authorize.ts does) so this
// route is directly unit-testable under plain Vitest.
import { createError, defineEventHandler, readBody, setResponseStatus } from 'h3'
import { createPlayer } from '../../utils/players'

export default defineEventHandler(async (event) => {
  const principal = event.context.principal ?? null
  if (!principal) {
    throw createError({ statusCode: 401, statusMessage: 'Authentication required' })
  }

  const body = await readBody(event).catch(() => ({}))
  const displayName = typeof body?.displayName === 'string' ? body.displayName : ''
  const username = typeof body?.username === 'string' ? body.username : ''
  const password = typeof body?.password === 'string' ? body.password : ''
  const passwordConfirmation = typeof body?.passwordConfirmation === 'string' ? body.passwordConfirmation : ''

  if (password !== passwordConfirmation) {
    throw createError({ statusCode: 400, statusMessage: 'Password and confirmation do not match' })
  }

  const player = await createPlayer({ displayName, username, password })

  setResponseStatus(event, 201)
  return { player }
})
