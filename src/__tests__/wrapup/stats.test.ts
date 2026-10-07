import { describe, expect, test } from 'vitest'
import {
  dailyDue,
  renderDaily,
  renderWeekly,
  voiceStats,
  weeklyDue,
  type Sample,
} from '../../wrapup/stats'

const DRG = 548430
const LETHAL = 1966720
const at = (iso: string) => Date.parse(iso) / 1000
const ticks = (startIso: string, count: number, from = 0) =>
  Array.from({ length: count }, (_, i) => at(startIso) + (from + i) * 120)
const sample = (ts: number, id: string, channel = 'v1', appid: number | null = null): Sample => ({
  ts,
  discord_id: id,
  channel_id: channel,
  appid,
})

// Friday 9 Oct 2026, 20:00 Dublin (IST, UTC+1).
const friday = ticks('2026-10-09T19:00:00Z', 10)
const fridayLate = ticks('2026-10-09T19:00:00Z', 2, 12) // after a 6-minute gap: same session
const samples: Sample[] = [
  ...friday.flatMap((ts) => [sample(ts, 'a', 'v1', DRG), sample(ts, 'b')]),
  ...friday.slice(0, 3).map((ts) => sample(ts, 'c', 'v2')), // alone in another channel
  ...fridayLate.flatMap((ts) => [sample(ts, 'a', 'v1', DRG), sample(ts, 'b'), sample(ts, 'c')]),
  // Saturday 01:00 Dublin: still Friday night.
  ...ticks('2026-10-10T00:00:00Z', 5).flatMap((ts) => [
    sample(ts, 'a'),
    sample(ts, 'c', 'v1', LETHAL),
  ]),
  // Sunday 21:00 Dublin.
  ...ticks('2026-10-11T20:00:00Z', 3).flatMap((ts) => [sample(ts, 'b'), sample(ts, 'c')]),
]

describe('voiceStats', () => {
  const stats = voiceStats(samples)

  test('counts only time with 2+ people in the same channel', () => {
    expect(stats.minutes).toBe(40)
    expect(stats.people).toEqual([
      ['a', 34],
      ['b', 30],
      ['c', 20],
    ])
    expect(stats.pairs).toEqual([
      ['a', 'b', 24],
      ['a', 'c', 14],
      ['b', 'c', 10],
    ])
    expect(stats.games).toEqual([
      [DRG, 24],
      [LETHAL, 10],
    ])
  })

  test('a short gap keeps one session; after midnight still counts as the evening before', () => {
    expect(stats.longest).toEqual({ minutes: 24, start: friday[0], people: ['a', 'b', 'c'] })
    expect(stats.busiest).toEqual({ start: friday[0], minutes: 34 })
  })

  test('the weekly message', () => {
    const names = new Map([
      [DRG, 'Deep Rock Galactic'],
      [LETHAL, 'Lethal Company'],
    ])
    const week = weeklyDue(Date.parse('2026-10-12T11:00:00Z')) // Monday 12:00 Dublin
    expect(week).not.toBeNull()
    expect(renderWeekly(stats, names, week?.from ?? 0, week?.to ?? 0)).toMatchInlineSnapshot(`
      "**The week in voice** (5 Oct to 11 Oct)
      **Together:** 40 min
      **Longest session:** 24 min on Friday, <@a> <@b> <@c>
      **Busiest evening:** Friday, 34 min
      **Most time together:** <@a> & <@b> 24 min · <@a> & <@c> 14 min · <@b> & <@c> 10 min
      **Played together:** Deep Rock Galactic 24 min · Lethal Company 10 min
      **Per person:** <@a> 34 min · <@b> 30 min · <@c> 20 min"
    `)
    expect(renderWeekly(voiceStats([]), names, 0, 1)).toBeNull()
  })
})

describe('when wrap-ups are due (Dublin time)', () => {
  test('weekly from Monday 12:00, covering last Monday to Monday; catches up later in the week', () => {
    expect(weeklyDue(Date.parse('2026-10-12T10:59:00Z'))).toBeNull() // 11:59 IST
    const due = weeklyDue(Date.parse('2026-10-12T11:00:00Z'))
    expect(due).toEqual({
      key: 'wrapup:weekly:2026-10-12',
      // Monday 06:00 IST to Monday 06:00 IST.
      from: Date.parse('2026-10-05T05:00:00Z'),
      to: Date.parse('2026-10-12T05:00:00Z'),
    })
    expect(weeklyDue(Date.parse('2026-10-15T09:00:00Z'))?.key).toBe('wrapup:weekly:2026-10-12')
  })

  test('the week the clocks go back is 169 hours', () => {
    const due = weeklyDue(Date.parse('2026-10-26T12:00:00Z')) // 12:00 GMT
    expect(due?.key).toBe('wrapup:weekly:2026-10-26')
    expect(((due?.to ?? 0) - (due?.from ?? 0)) / 3_600_000).toBe(169)
  })

  test('daily from 18:00', () => {
    expect(dailyDue(Date.parse('2026-10-08T16:59:00Z'))).toBeNull() // 17:59 IST
    expect(dailyDue(Date.parse('2026-10-08T17:00:00Z'))?.key).toBe('wrapup:daily:2026-10-08')
  })
})

test('the daily digest lists what went over the cap, with store links', () => {
  const rows = Array.from({ length: 10 }, (_, i) => ({
    key: `sale:${i + 1}:100`,
    appid: i + 1,
    line: `Game ${i + 1} −50%`,
  }))
  const message = renderDaily(rows)
  expect(message?.split('\n')[1]).toBe('• [Game 1 −50%](<https://store.steampowered.com/app/1/>)')
  expect(message?.split('\n').at(-1)).toBe('+2 more')
  expect(renderDaily([])).toBeNull()
})

test('patch rows link to the notes, and brackets in titles stay inside the link', () => {
  expect(renderDaily([{ key: 'patch:42', appid: 7, line: 'Game: [Update] 1.2' }])).toBe(
    '**Also today** (past the 5-a-day limit)\n' +
      '• [Game: \\[Update\\] 1.2](<https://store.steampowered.com/news/app/7/view/42>)'
  )
})

test('long lines: the digest stays under 2,000 characters and keeps the "+N more" line', () => {
  const rows = Array.from({ length: 8 }, (_, i) => ({
    key: `patch:${i}`,
    appid: i + 1,
    line: 'x'.repeat(200),
  }))
  const message = renderDaily(rows) ?? ''
  expect(message.length).toBeLessThanOrEqual(2000)
  expect(message.split('\n').at(-1)).toMatch(/^\+\d+ more$/)
})
