import { beforeEach, describe, expect, test } from 'vitest'
import { schemaStatements } from '../../d1'
import * as sql from '../../alerts/sql'

// node:sqlite (Node 22) is loaded at runtime: vite-node rewrites `node:` imports,
// and the installed @types/node predates it.
interface Db {
  exec(sql: string): void
  prepare(sql: string): {
    all(...params: unknown[]): Record<string, unknown>[]
    run(...params: unknown[]): unknown
  }
}
const { DatabaseSync } = process.getBuiltinModule('node:sqlite') as unknown as {
  DatabaseSync: new (path: string) => Db
}

let db: Db
beforeEach(() => {
  db = new DatabaseSync(':memory:')
  for (const statement of schemaStatements()) db.exec(statement)
})

describe('worker/schema.sql', () => {
  test('is additive only, so the alerts job can safely run it on every start', () => {
    for (const statement of schemaStatements()) {
      expect(statement).toMatch(/^CREATE (TABLE|INDEX) IF NOT EXISTS /)
    }
  })
})

describe('alerts SQL', () => {
  test('price history: latest, lowest and first-seen per app', () => {
    const insert = (final: number, ts: string) =>
      db
        .prepare(sql.INSERT_PRICES)
        .run(JSON.stringify([{ appid: 1, final, initial: 2499, currency: 'EUR' }]), ts)
    insert(2499, '2026-08-01T00:00:00Z')
    insert(749, '2026-09-01T00:00:00Z')
    insert(2499, '2026-10-01T00:00:00Z')
    expect(db.prepare(sql.PRICE_HISTORY).all()).toEqual([
      { appid: 1, lowest: 749, since: '2026-08-01T00:00:00Z', last: 2499 },
    ])
  })

  test('app_meta upsert overwrites a re-fetched app', () => {
    const row = (early_access: number) => ({
      appid: 1,
      name: 'X',
      coop: 1,
      early_access,
      coming_soon: 0,
      header_image: null,
      has_data: 1,
      fetched_at: '2026-10-08T00:00:00Z',
    })
    db.prepare(sql.UPSERT_META).run(JSON.stringify([row(1)]))
    db.prepare(sql.UPSERT_META).run(JSON.stringify([row(0)]))
    expect(db.prepare(sql.APP_META).all()).toEqual([row(0)])
  })

  test('alerts: dedupe lookup, re-post refresh and the 24 h posted count', () => {
    const alert = [{ key: 'sale:1:749', kind: 'sale', appid: 1, line: 'X −70% (€7.49)' }]
    db.prepare(sql.UPSERT_ALERTS).run(JSON.stringify(alert), 'posted', '2026-09-01T00:00:00Z')
    db.prepare(sql.UPSERT_ALERTS).run(JSON.stringify(alert), 'posted', '2026-10-08T00:00:00Z')

    expect(db.prepare(sql.EXISTING_ALERTS).all(JSON.stringify(['sale:1:749', 'ea:1']))).toEqual([
      { key: 'sale:1:749', created_at: '2026-10-08T00:00:00Z' },
    ])
    expect(db.prepare(sql.POSTED_SINCE).all('2026-10-07T12:00:00Z')).toEqual([{ n: 1 }])
  })

  test('library queries join through linked members', () => {
    db.exec(`INSERT INTO members VALUES ('d1', 's1', 'A', '2026-10-01', NULL)`)
    db.exec(`INSERT INTO owned_games VALUES ('s1', 1, 600, 0), ('s9', 2, 5, 0)`)
    db.exec(`INSERT INTO wishlist VALUES ('s1', 3, NULL)`)
    expect(db.prepare(sql.OWNED).all()).toEqual([
      { discord_id: 'd1', appid: 1, playtime_forever: 600 },
    ])
    expect(db.prepare(sql.WISHLIST).all()).toEqual([{ discord_id: 'd1', appid: 3 }])
  })

  test('owned games come most recently played first, then by hours', () => {
    db.exec(`INSERT INTO members VALUES ('d1', 's1', 'A', '2026-10-01', NULL)`)
    db.exec(
      `INSERT INTO owned_games VALUES ('s1', 1, 9000, 0), ('s1', 2, 300, 60), ('s1', 3, 600, 0)`
    )
    const order = db
      .prepare(sql.OWNED)
      .all()
      .map((row) => row.appid)
    expect(order).toEqual([2, 1, 3])
  })
})
