// Unit tests for describeWorldCreateError
// (app/utils/describeWorldCreateError.ts). See
// app/components/world/WorldCreateModal.vue's own header comment for why
// this logic is extracted into a pure, separately-testable module: this
// codebase has no Vue component-testing infrastructure, so this is the one
// piece of the Create World UI's new logic that can be verified by an
// automated test rather than by manual browser verification.

import { describe, expect, it } from 'vitest'
import { describeWorldCreateError } from '../../../app/utils/describeWorldCreateError'

describe('describeWorldCreateError', () => {
  it('returns the server-provided message for a 400 validation failure', () => {
    const error = { statusCode: 400, data: { statusMessage: 'World name is required' } }
    expect(describeWorldCreateError(error)).toBe('World name is required')
  })

  it('falls back to a generic message for a 400 with no server message', () => {
    const error = { statusCode: 400 }
    expect(describeWorldCreateError(error)).toBe('Please check the World details and try again.')
  })

  it('maps 401 to an authentication-specific message -- never the raw error', () => {
    const error = { statusCode: 401, data: { statusMessage: 'Authentication required' } }
    expect(describeWorldCreateError(error)).toBe('You must be signed in to create a World.')
  })

  it('maps 403 to an authorization-specific message -- never the raw error', () => {
    const error = { statusCode: 403, data: { statusMessage: "Missing capability 'platform.world.create'" } }
    expect(describeWorldCreateError(error)).toBe('You do not have permission to create a World.')
  })

  it('maps 409 (duplicate slug / membership race) to a retry-oriented message', () => {
    const error = { statusCode: 409, data: { statusMessage: 'Account x already has a membership in world 5' } }
    expect(describeWorldCreateError(error)).toBe('A World with that name already exists. Try a slightly different name.')
  })

  it('falls back to a generic message for a raw/unexpected error shape -- never exposes it', () => {
    const rawDirectusError = {
      data: {
        errors: [{ message: 'FOREIGN KEY constraint violation on world_memberships.world_id', extensions: { code: 'FAILED_VALIDATION' } }]
      }
    }
    const message = describeWorldCreateError(rawDirectusError)

    expect(message).toBe('Something went wrong while creating this World. Please try again.')
    expect(message).not.toContain('FOREIGN KEY')
    expect(message).not.toContain('FAILED_VALIDATION')
  })

  it('falls back to a generic message for a network-level failure with no statusCode at all', () => {
    const error = new Error('Failed to fetch')
    expect(describeWorldCreateError(error)).toBe('Something went wrong while creating this World. Please try again.')
  })

  it('reads statusCode from $fetch\'s response.status shape as a fallback', () => {
    const error = { response: { status: 403 } }
    expect(describeWorldCreateError(error)).toBe('You do not have permission to create a World.')
  })
})
