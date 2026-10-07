import { beforeAll, describe, expect, test } from 'vitest'
import { schemaStatements } from '../../../src/d1'
import { OWNED_SQL, PICKS_SQL, WISHED_SQL, renderTogether, type OwnedRow } from '../together'

// node:sqlite (Node 22) is loaded at runtime: vite-node rewrites `node:` imports.
interface Db {
  exec(sql: string): void
  prepare(sql: string): { all(...params: unknown[]): Record<string, unknown>[] }
}
const { DatabaseSync } = process.getBuiltinModule('node:sqlite') as unknown as {
  DatabaseSync: new (path: string) => Db
}

let db: Db
beforeAll(() => {
  db = new DatabaseSync(':memory:')
  for (const statement of schemaStatements()) db.exec(statement)
  db.exec(`INSERT INTO members VALUES ('a', 'sa', 'A', '1', NULL), ('b', 'sb', 'B', '2', NULL),
    ('c', 'sc', 'C', '3', NULL)`)
  db.exec(`INSERT INTO app_meta VALUES (1, 'Deep Rock Galactic', 1, 0, 0, NULL, 1, 'x'),
    (2, 'It Takes Two', 1, 0, 0, NULL, 1, 'x'), (3, 'Big Walk', 1, 0, 0, NULL, 1, 'x'),
    (5, 'Solo Game', 0, 0, 0, NULL, 1, 'x'), (6, 'Not Out Yet', 1, 0, 1, NULL, 1, 'x')`)
  db.exec(`INSERT INTO owned_games VALUES ('sa', 1, 6000, 60), ('sb', 1, 3000, 0), ('sc', 1, 0, 0),
    ('sa', 2, 900, 0), ('sb', 2, 300, 0), ('sa', 5, 50, 0), ('sb', 5, 50, 0), ('sc', 5, 50, 0)`)
  db.exec(`INSERT INTO wishlist VALUES ('sc', 3, NULL), ('sa', 6, NULL)`)
  db.exec(`INSERT INTO price_changes VALUES (2, '2026-09-01', 3999, 3999, 'EUR'),
    (2, '2026-10-01', 1999, 3999, 'EUR')`)
  db.exec(`INSERT INTO discover VALUES (3, 'Big Walk', 0, 'Very Positive', 'x'),
    (4, 'Subnautica 2', 1, 'Very Positive', 'x'), (1, 'Deep Rock Galactic', 2, 'Very Positive', 'x')`)
})

const group = JSON.stringify(['a', 'b', 'c'])

describe('/together SQL', () => {
  test('co-op games everyone owns, and ones most own with the latest price', () => {
    const all = db.prepare(OWNED_SQL).all(group, 3, 3)
    expect(all).toMatchObject([{ appid: 1, minutes: 9000, recent: 60 }])

    const some = db.prepare(OWNED_SQL).all(group, 2, 2)
    expect(some).toMatchObject([{ appid: 2, final: 1999, initial: 3999, currency: 'EUR' }])
    expect((JSON.parse(some[0]?.owners as string) as string[]).sort()).toEqual(['a', 'b'])
  })

  test('new to the group: released wishlisted co-op games, then Steam picks nobody owns', () => {
    expect(db.prepare(WISHED_SQL).all(group)).toEqual([
      { appid: 3, name: 'Big Walk', wishers: '["c"]' },
    ])
    expect(
      db
        .prepare(PICKS_SQL)
        .all(group)
        .map((row) => row.appid)
    ).toEqual([3, 4])
  })
})

test('renders three sections with names, never duplicating a pick', () => {
  const row = (overrides: Partial<OwnedRow>): OwnedRow => ({
    appid: 1,
    name: 'Deep Rock Galactic',
    owners: '["a","b","c"]',
    minutes: 9000,
    recent: 60,
    final: null,
    initial: null,
    currency: null,
    ...overrides,
  })
  const message = renderTogether(
    ['a', 'b', 'c'],
    true,
    [row({})],
    [
      row({
        appid: 2,
        name: 'It Takes Two',
        owners: '["a","b"]',
        final: 1999,
        initial: 3999,
        currency: 'EUR',
      }),
    ],
    [{ appid: 3, name: 'Big Walk', wishers: '["c"]' }],
    [
      { appid: 3, name: 'Big Walk', reviews: 'Very Positive' },
      { appid: 4, name: 'Subnautica 2', reviews: 'Very Positive' },
    ]
  )
  expect(message).toMatchInlineSnapshot(`
    "Co-op games for the 3 of you in voice (<@a> <@b> <@c>):

    **You all own**
    • [Deep Rock Galactic](<https://store.steampowered.com/app/1/>) · 150 h between you, played lately

    **One purchase away**
    • [It Takes Two](<https://store.steampowered.com/app/2/>) · missing <@c> · €19.99 (−50%)

    **New to all of you**
    • [Big Walk](<https://store.steampowered.com/app/3/>) · wishlisted by <@c>
    • [Subnautica 2](<https://store.steampowered.com/app/4/>) · new on Steam, Very Positive"
  `)
})
