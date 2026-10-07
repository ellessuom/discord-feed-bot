import { expect, test } from 'vitest'
import { newsText, patchCandidates } from '../../alerts/patches'

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
