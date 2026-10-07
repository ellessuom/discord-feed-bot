import { describe, expect, test } from 'vitest'
import {
  isSkip,
  newsText,
  patchCandidates,
  pickPatches,
  type PatchNews,
} from '../../alerts/patches'

test('games the group played 2 h+ in the last 2 weeks, with who played most first', () => {
  const candidates = patchCandidates([
    { discord_id: 'a', appid: 1, playtime_2weeks: 30 },
    { discord_id: 'b', appid: 1, playtime_2weeks: 100 },
    { discord_id: 'a', appid: 2, playtime_2weeks: 119 },
    { discord_id: 'c', appid: 3, playtime_2weeks: 0 },
  ])
  expect([...candidates]).toEqual([[1, ['b', 'a']]])
})

test("Steam's BBCode becomes plain text, images and link targets dropped", () => {
  const contents =
    '[img]{STEAM_CLAN_IMAGE}/1/a.png[/img][h2]Fixes[/h2][list][*]Fixed a crash[*]Faster [url=https://x.example]loading[/url][/list][p]Thanks![/p]'
  expect(newsText(contents)).toBe('Fixes\n\n- Fixed a crash\n- Faster loading\nThanks!')
})

describe('pickPatches', () => {
  const NOW = Date.parse('2026-10-08T12:00:00Z')
  const hoursAgo = (h: number) => Math.floor((NOW - h * 3_600_000) / 1000)
  const news = (gid: string, h: number, appid = 1): PatchNews => ({
    appid,
    players: ['a'],
    item: { gid, title: gid, contents: '', date: hoursAgo(h) },
  })
  const posts = [
    news('old', 49),
    news('seen', 1),
    news('a', 5),
    news('b', 2),
    news('c', 3),
    news('d', 4),
    news('b', 2, 2), // the same post under a second app
  ]
  const known = new Set(['patch:seen'])
  const gids = (list: PatchNews[]) => list.map((n) => n.item.gid)

  test('new posts from the last 48 h, newest first, each once; at most 3 summarized', () => {
    const picked = pickPatches(posts, known, 5, NOW)
    expect(gids(picked.summarize)).toEqual(['b', 'c', 'd'])
    expect(picked.overflow).toEqual([])
  })

  test('never more summaries than free slots', () => {
    expect(gids(pickPatches(posts, known, 1, NOW).summarize)).toEqual(['b'])
  })

  test('with no slot left today they all go to the digest unsummarized', () => {
    const picked = pickPatches(posts, known, 0, NOW)
    expect(picked.summarize).toEqual([])
    expect(gids(picked.overflow)).toEqual(['b', 'c', 'd', 'a'])
  })
})

test('SKIP is recognised however the model punctuates it', () => {
  expect(isSkip('SKIP')).toBe(true)
  expect(isSkip(' skip.')).toBe(true)
  expect(isSkip('- Skipping animations is now faster')).toBe(false)
})
