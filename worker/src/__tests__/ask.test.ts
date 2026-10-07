import { expect, test } from 'vitest'
import { cleanQuestion, factsBlock, render, sameGame, taggedIds, type GameBlock } from '../ask'

const facts = (overrides: Partial<GameBlock['facts']> = {}): GameBlock['facts'] => ({
  appid: 3241660,
  name: 'R.E.P.O.',
  released: '26 Feb, 2025, in Early Access',
  controller: null,
  features: ['Online Co-op', 'Single-player'],
  price: '€8.19',
  minimum: 'Minimum: · OS: Windows 10 · Memory: 8 GB RAM',
  reviews: 'Overwhelmingly Positive (123,456 reviews)',
  ...overrides,
})

test('facts name people only as Friend letters, including who lacks a game', () => {
  const block = factsBlock(
    ['a', 'b', 'c'],
    'c',
    [
      {
        facts: facts(),
        owners: [{ discord_id: 'a', playtime_forever: 2400 }],
        wishers: ['b'],
        lowest: { lowest: 655, currency: 'EUR' },
      },
    ],
    [{ name: 'Deep Rock Galactic', owners: '["a","b","c"]' }]
  )
  expect(block).toMatchInlineSnapshot(`
    "The group: 3 friends who linked Steam, Friend A to Friend C. The asker is Friend C.

    R.E.P.O. (Steam store):
    - Released: 26 Feb, 2025, in Early Access
    - Controller support: not listed
    - Features: Online Co-op, Single-player
    - Reviews: Overwhelmingly Positive (123,456 reviews)
    - Price: now €8.19; lowest we've recorded €6.55
    - PC requirements: Minimum: · OS: Windows 10 · Memory: 8 GB RAM
    - Owned by: Friend A (40 h). Wishlisted by: Friend B. Doesn't have it: Friend B, Friend C

    Co-op games the group owns, and who owns each:
    - Deep Rock Galactic: Friend A, Friend B, Friend C"
  `)
})

test('an unlinked asker and a game nobody owns', () => {
  const block = factsBlock(
    ['a'],
    'z',
    [{ facts: facts({ price: null }), owners: [], wishers: [], lowest: null }],
    []
  )
  expect(block).toContain("The asker hasn't linked Steam.")
  expect(block).toContain("- Owned by: nobody. Doesn't have it: Friend A")
  expect(block).not.toContain('Price')
})

test('render turns Friend letters into mentions, but never "F1 25" or unknown letters', () => {
  const message = render(
    'c',
    'games like REPO?',
    'Friend A owns F1 25; Friend Z and [a link](https://x.example) do not.',
    ['https://reddit.com/r/x'],
    ['a', 'b']
  )
  expect(message).toBe(
    '> <@c>: games like REPO?\n<@a> owns F1 25; Friend Z and a link do not.\n-# Sources: <https://reddit.com/r/x>'
  )
})

test('the echoed question loses links too', () => {
  expect(render('c', 'is [free nitro](https://x.example) real?', 'No.', [], [])).toBe(
    '> <@c>: is free nitro real?\nNo.'
  )
})

test('render stays under 2,000 characters after the mentions grow it', () => {
  const long = Array.from({ length: 60 }, () => 'Friend A and Friend B both own it.').join('\n')
  const message = render(
    'c',
    'q',
    long,
    ['https://reddit.com/r/x'],
    ['1'.repeat(19), '2'.repeat(19)]
  )
  expect(message.length).toBeLessThanOrEqual(2000)
  expect(message.endsWith('-# Sources: <https://reddit.com/r/x>')).toBe(true)
})

test('Steam matches are kept only when the names plausibly agree', () => {
  expect(sameGame('repo', 'R.E.P.O.')).toBe(true)
  expect(sameGame('Deep Rock', 'Deep Rock Galactic')).toBe(true)
  expect(sameGame('Zelda', 'Hollow Knight')).toBe(false)
})

test('questions lose Discord IDs before reaching OpenAI', () => {
  expect(cleanQuestion('does <@123> own\n  Valheim in <#456>?')).toBe(
    'does someone own Valheim in someone?'
  )
})

test('a tagged member becomes their Friend label for OpenAI, and their tag again in the reply', () => {
  const question = 'how many hours has <@222> played REPO? and <@999>?'
  const members = ['111', '222']
  const unlinked = taggedIds(question).filter((id) => !members.includes(id))
  const people = [...members, ...unlinked]
  const labelled = cleanQuestion(question, people)
  expect(labelled).toBe('how many hours has Friend B played REPO? and Friend C?')
  expect(factsBlock(members, '111', [], [], unlinked)).toContain(
    "Friend C hasn't linked Steam, so you know nothing about their games."
  )
  expect(render('111', labelled, 'Friend B has played 12 h.', [], people)).toBe(
    '> <@111>: how many hours has <@222> played REPO? and <@999>?\n<@222> has played 12 h.'
  )
})
