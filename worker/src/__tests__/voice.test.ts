import { describe, expect, test } from 'vitest'
import { toSamples } from '../voice'

describe('toSamples', () => {
  const ids = ['a', 'b', 'c', 'd']

  test('records who is in which channel, skipping absent members and the AFK channel', () => {
    const states = [{ channel_id: 'v1' }, null, { channel_id: 'afk' }, { channel_id: null }]
    expect(toSamples(ids, states, 'afk', new Map())).toEqual([
      { discord_id: 'a', channel_id: 'v1', appid: null },
    ])
  })

  test('keeps real Steam appids and drops non-Steam shortcut ids', () => {
    const states = [{ channel_id: 'v1' }, { channel_id: 'v1' }, null, null]
    const games = new Map([
      ['a', '294100'],
      ['b', '13319413591538065408'],
    ])
    expect(toSamples(ids, states, null, games)).toEqual([
      { discord_id: 'a', channel_id: 'v1', appid: 294100 },
      { discord_id: 'b', channel_id: 'v1', appid: null },
    ])
  })
})
