import { describe, expect, test } from 'vitest'
import { parseAppInput, parseProfileInput } from '../steam'

describe('parseProfileInput', () => {
  test.each([
    ['https://steamcommunity.com/profiles/76561197960435530/', { steamId: '76561197960435530' }],
    ['steamcommunity.com/profiles/76561197960435530', { steamId: '76561197960435530' }],
    ['https://steamcommunity.com/id/robinwalker/', { vanity: 'robinwalker' }],
    ['https://steamcommunity.com/id/robin_walker?l=english', { vanity: 'robin_walker' }],
    ['76561197960435530', { steamId: '76561197960435530' }],
    ['  robinwalker ', { vanity: 'robinwalker' }],
  ])('%s', (input, expected) => {
    expect(parseProfileInput(input)).toEqual(expected)
  })

  test.each(['', 'not a profile!', 'https://store.steampowered.com/app/548430/'])(
    'rejects %j',
    (input) => {
      expect(parseProfileInput(input)).toBeNull()
    }
  )
})

describe('parseAppInput', () => {
  test.each([
    ['https://store.steampowered.com/app/548430/Deep_Rock_Galactic/', 548430],
    ['store.steampowered.com/app/2073850', 2073850],
    ['548430', 548430],
    ['Deep Rock Galactic', null],
    ['', null],
  ])('%s', (input, expected) => {
    expect(parseAppInput(input)).toBe(expected)
  })
})
