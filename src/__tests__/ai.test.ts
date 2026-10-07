import { beforeEach, describe, expect, test } from 'vitest'
import { readResponse, reserve, sanitize, settle, type Sql } from '../ai'
import { schemaStatements } from '../d1'

// node:sqlite (Node 22) is loaded at runtime: vite-node rewrites `node:` imports.
interface Db {
  exec(sql: string): void
  prepare(sql: string): { all(...params: unknown[]): Record<string, unknown>[] }
}
const { DatabaseSync } = process.getBuiltinModule('node:sqlite') as unknown as {
  DatabaseSync: new (path: string) => Db
}

describe('readResponse', () => {
  test('bills tokens plus one cent per web search item, and keeps 2 cited pages', () => {
    const result = readResponse({
      output: [
        { type: 'web_search_call' },
        { type: 'web_search_call' },
        {
          type: 'message',
          content: [
            {
              type: 'output_text',
              text: 'Yes, full controller support.',
              annotations: [
                { type: 'url_citation', url: 'https://reddit.com/r/x?utm_source=openai' },
                { type: 'url_citation', url: 'https://reddit.com/r/x' },
                { type: 'url_citation', url: 'javascript:alert(1)' },
                { type: 'url_citation', url: 'https://pcgamingwiki.com/wiki/X' },
                { type: 'url_citation', url: 'https://third.example/' },
              ],
            },
          ],
        },
      ],
      usage: { input_tokens: 10_000, output_tokens: 1_000 },
    })
    expect(result.text).toBe('Yes, full controller support.')
    expect(result.usd).toBeCloseTo(0.02 + 0.001 + 0.0005, 6)
    expect(result.sources).toEqual(['https://reddit.com/r/x', 'https://pcgamingwiki.com/wiki/X'])
  })
})

describe('sanitize', () => {
  test('strips every link, mention and invite the model wrote', () => {
    const text = [
      'Try [this guide](https://evil.example/login) first ([reddit.com](https://reddit.com/x)).',
      'More at https://evil.example/a or <https://evil.example/b>',
      'Ask <@123> or <@&456> in <#789>, @everyone, join discord.gg/abc',
    ].join('\n')
    expect(sanitize(text, 500)).toBe(
      ['Try this guide first.', 'More at  or', 'Ask  or  in , everyone, join'].join('\n')
    )
  })

  test('caps on a line boundary when one is near, else mid-line with an ellipsis', () => {
    const text = '- one line here\n- two line here\n- three'
    expect(sanitize(text, 31)).toBe('- one line here\n- two line here')
    expect(sanitize(text, 12)).toBe('- one line…')
  })
})

describe('the spend meter', () => {
  let db: Db
  // Binds every param as a string, exactly like the D1 REST API does.
  const sql: Sql = async (text, params) => db.prepare(text).all(...params)
  const NOW = Date.parse('2026-10-08T20:00:00Z')

  beforeEach(() => {
    db = new DatabaseSync(':memory:')
    for (const statement of schemaStatements()) db.exec(statement)
  })

  test('each question holds 3 cents, settled to its real cost', async () => {
    expect(await reserve(sql, 'a', NOW)).toBeNull()
    expect(await reserve(sql, 'b', NOW)).toBeNull()
    await settle(sql, 'ask', 'a', 0.012 - 0.03, NOW)
    expect(db.prepare('SELECT who, usd, calls FROM ai_spend ORDER BY who').all()).toEqual([
      { who: 'a', usd: expect.closeTo(0.012, 6), calls: 1 },
      { who: 'b', usd: 0.03, calls: 1 },
    ])
  })

  test('5 questions per person per day', async () => {
    for (let i = 0; i < 5; i++) expect(await reserve(sql, 'a', NOW)).toBeNull()
    expect(await reserve(sql, 'a', NOW)).toBe('person')
    expect(await reserve(sql, 'b', NOW)).toBeNull()
    expect(await reserve(sql, 'a', NOW + 86_400_000)).toBeNull()
  })

  test('the group day cap, then the month cap including the jobs', async () => {
    await settle(sql, 'ask', 'x', 0.23, NOW)
    expect(await reserve(sql, 'a', NOW)).toBe('day')
    expect(await reserve(sql, 'a', NOW + 86_400_000)).toBeNull()

    await settle(sql, 'patch', '', 1.6, NOW)
    expect(await reserve(sql, 'a', NOW + 86_400_000)).toBe('month')
    // A new month starts from zero.
    expect(await reserve(sql, 'a', Date.parse('2026-11-01T00:00:00Z'))).toBeNull()
  })
})
