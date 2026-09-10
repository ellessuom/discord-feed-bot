import { describe, test, expect } from 'vitest'
import { extractSteamRefs, storeUrl } from '../../proposals/scan'

describe('extractSteamRefs', () => {
  test('extracts an appid from a full store URL with a slug', () => {
    const refs = extractSteamRefs('https://store.steampowered.com/app/774291/Last_Man_Sitting/')
    expect(refs).toEqual([{ kind: 'app', id: 774291 }])
  })

  test('treats a bare app URL and a slugged one as the same game', () => {
    const withSlug = extractSteamRefs('https://store.steampowered.com/app/774291/Last_Man_Sitting/')
    const bare = extractSteamRefs('https://store.steampowered.com/app/774291')
    expect(bare).toEqual(withSlug)
  })

  test('deduplicates the same game linked twice in one message', () => {
    const refs = extractSteamRefs(
      'https://store.steampowered.com/app/730/ and again https://store.steampowered.com/app/730/CS2/'
    )
    expect(refs).toHaveLength(1)
  })

  test('keeps app, sub and bundle ids in separate namespaces', () => {
    const refs = extractSteamRefs(
      'https://store.steampowered.com/app/12345/ https://store.steampowered.com/sub/12345/ https://store.steampowered.com/bundle/12345/'
    )
    expect(refs).toEqual([
      { kind: 'app', id: 12345 },
      { kind: 'sub', id: 12345 },
      { kind: 'bundle', id: 12345 },
    ])
  })

  test('handles agecheck URLs', () => {
    const refs = extractSteamRefs('https://store.steampowered.com/agecheck/app/1174180/')
    expect(refs).toEqual([{ kind: 'app', id: 1174180 }])
  })

  test('resolves s.team shortlinks as apps without a network call', () => {
    expect(extractSteamRefs('check this https://s.team/a/570')).toEqual([{ kind: 'app', id: 570 }])
  })

  test('extracts links embedded in surrounding prose', () => {
    const refs = extractSteamRefs(
      'we should play https://store.steampowered.com/app/1785150/Friends_vs_Friends/ tonight'
    )
    expect(refs).toEqual([{ kind: 'app', id: 1785150 }])
  })

  test('ignores non-Steam and malformed URLs', () => {
    expect(extractSteamRefs('https://example.com/app/123')).toEqual([])
    expect(extractSteamRefs('https://store.steampowered.com/app/notanumber')).toEqual([])
    expect(extractSteamRefs('no links here at all')).toEqual([])
  })

  test('storeUrl round-trips back to an extractable reference', () => {
    const url = storeUrl('app', 774291)
    expect(extractSteamRefs(url)).toEqual([{ kind: 'app', id: 774291 }])
  })
})
