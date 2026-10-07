import { describe, expect, test } from 'vitest'
import { isAdmin, type Interaction } from '../discord'

const withPermissions = (permissions?: string): Interaction => ({
  type: 2,
  token: 't',
  member: { user: { id: '1' }, ...(permissions === undefined ? {} : { permissions }) },
})

describe('isAdmin', () => {
  test.each([
    ['8', true],
    ['2147483656', true], // Administrator plus Use Application Commands
    ['2147483648', false], // Use Application Commands only
    ['0', false],
    [undefined, false],
  ])('permissions %s → %s', (permissions, expected) => {
    expect(isAdmin(withPermissions(permissions))).toBe(expected)
  })
})
