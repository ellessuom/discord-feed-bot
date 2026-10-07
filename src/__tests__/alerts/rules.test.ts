import { describe, expect, test } from 'vitest'
import {
  buildAlertEmbed,
  buildLibrary,
  evaluateSale,
  isNew,
  metaFrom,
  metaQueue,
  priceCandidates,
  rank,
  transitions,
  type Alert,
  type AppMeta,
} from '../../alerts/rules'
import type { SteamAppDetails } from '../../proposals/steam'

const NOW = Date.parse('2026-10-08T12:00:00Z')
const days = (n: number) => new Date(NOW - n * 86_400_000).toISOString()

function app(overrides: Partial<AppMeta> = {}): AppMeta {
  return {
    appid: 1,
    name: 'Deep Rock Galactic',
    coop: 1,
    early_access: 0,
    coming_soon: 0,
    header_image: 'https://example.test/header.jpg',
    has_data: 1,
    fetched_at: days(0),
    ...overrides,
  }
}

const price = (final: number, discount: number, initial = 2499) => ({
  currency: 'EUR',
  initial,
  final,
  discount_percent: discount,
})

// a has played app 1 for 10 h; b owns it unplayed; c wishlisted it.
const library = buildLibrary(
  [{ discord_id: 'a' }, { discord_id: 'b' }, { discord_id: 'c' }],
  [
    { discord_id: 'a', appid: 1, playtime_forever: 600 },
    { discord_id: 'b', appid: 1, playtime_forever: 0 },
  ],
  [{ discord_id: 'c', appid: 1 }]
)

describe('evaluateSale', () => {
  test('≥40% off alerts on the first observation', () => {
    expect(evaluateSale(app(), price(749, 70), undefined, NOW)?.key).toBe('sale:1:749')
  })

  test('under 40% with no history stays quiet', () => {
    expect(evaluateSale(app(), price(1999, 20), undefined, NOW)).toBeNull()
  })

  test('a sale still running never re-posts', () => {
    const history = { lowest: 749, since: days(60), last: 749 }
    expect(evaluateSale(app(), price(749, 70), history, NOW)).toBeNull()
  })

  test('a new low counts only after 30 days of history, and says since when', () => {
    const young = { lowest: 1999, since: days(10), last: 2499 }
    const old = { lowest: 1999, since: '2026-08-01T00:00:00Z', last: 2499 }
    expect(evaluateSale(app(), price(1799, 28), young, NOW)).toBeNull()
    const sale = evaluateSale(app(), price(1799, 28), old, NOW)
    expect(sale?.lowestSince).toBe(old.since)
    expect(sale?.line).toBe('Deep Rock Galactic −28% (€17.99, lowest since Aug 2026)')
  })
})

describe('transitions', () => {
  test('leaving Early Access and releasing are detected', () => {
    expect(transitions(app({ early_access: 1, coming_soon: 1 }), app()).map((a) => a.key)).toEqual([
      'ea:1',
      'release:1',
    ])
  })

  test('an empty or first lookup never counts as a transition', () => {
    expect(transitions(undefined, app())).toEqual([])
    expect(transitions(app({ early_access: 1, has_data: 0 }), app())).toEqual([])
  })

  test('a failed lookup keeps what we knew instead of zeroing it', () => {
    const before = app({ early_access: 1 })
    const after = metaFrom(1, { state: 'failed' }, before, days(0))
    expect(after.early_access).toBe(1)
    expect(transitions(before, after)).toEqual([])
  })

  test('metadata reads co-op and Early Access from the store', () => {
    const details: SteamAppDetails = {
      name: 'X',
      type: 'game',
      isFree: false,
      comingSoon: false,
      categories: ['Online Co-op'],
      genres: ['Action', 'Early Access'],
    }
    expect(metaFrom(2, { state: 'ok', details }, undefined, days(0))).toMatchObject({
      coop: 1,
      early_access: 1,
      has_data: 1,
    })
  })
})

describe('priceCandidates', () => {
  test('a co-op game someone played that not everyone owns', () => {
    expect(priceCandidates(library, new Map([[1, app()]]))).toEqual([1])
  })

  test('a solo game on one wishlist is left to Steam’s own emails', () => {
    const solo = buildLibrary([{ discord_id: 'a' }], [], [{ discord_id: 'a', appid: 5 }])
    expect(priceCandidates(solo, new Map([[5, app({ appid: 5, coop: 0 })]]))).toEqual([])
  })

  test('a solo game wishlisted by two people counts', () => {
    const shared = buildLibrary(
      [{ discord_id: 'a' }, { discord_id: 'b' }],
      [],
      [
        { discord_id: 'a', appid: 5 },
        { discord_id: 'b', appid: 5 },
      ]
    )
    expect(priceCandidates(shared, new Map([[5, app({ appid: 5, coop: 0 })]]))).toEqual([5])
  })

  test('apps without store data are never candidates', () => {
    expect(priceCandidates(library, new Map([[1, app({ has_data: 0 })]]))).toEqual([])
  })
})

describe('metaQueue', () => {
  test('new wishlisted apps come first, then new played ones in library order, then stale Early Access rows', () => {
    const lib = buildLibrary(
      [{ discord_id: 'a' }],
      [
        { discord_id: 'a', appid: 1, playtime_forever: 600 },
        { discord_id: 'a', appid: 3, playtime_forever: 120 },
        { discord_id: 'a', appid: 2, playtime_forever: 900 },
      ],
      [{ discord_id: 'a', appid: 9 }]
    )
    const meta = new Map([[1, app({ early_access: 1, fetched_at: days(2) })]])
    expect(metaQueue(lib, meta, NOW)).toEqual([9, 3, 2, 1])
  })

  test('an owned game nobody has played 2 h is never looked up, since it can never alert', () => {
    const lib = buildLibrary(
      [{ discord_id: 'a' }],
      [{ discord_id: 'a', appid: 1, playtime_forever: 119 }],
      []
    )
    expect(metaQueue(lib, new Map(), NOW)).toEqual([])
  })

  test('a game two people own is looked up even unplayed, for /together', () => {
    const lib = buildLibrary(
      [{ discord_id: 'a' }, { discord_id: 'b' }],
      [
        { discord_id: 'a', appid: 1, playtime_forever: 0 },
        { discord_id: 'b', appid: 1, playtime_forever: 0 },
      ],
      []
    )
    expect(metaQueue(lib, new Map(), NOW)).toEqual([1])
  })
})

describe('isNew and rank', () => {
  const sale = (key: string, discount: number, lowestSince?: string): Alert => ({
    key,
    kind: 'sale',
    appid: 1,
    line: '',
    price: price(100, discount),
    ...(lowestSince ? { lowestSince } : {}),
  })

  test('a sale may re-post after 30 days; Early Access never', () => {
    const seen = new Map([
      ['sale:1:749', days(31)],
      ['ea:1', days(400)],
    ])
    expect(isNew(sale('sale:1:749', 70), seen, NOW)).toBe(true)
    expect(isNew({ key: 'ea:1', kind: 'ea', appid: 1, line: '' }, seen, NOW)).toBe(false)
    expect(isNew(sale('sale:1:749', 70), new Map([['sale:1:749', days(5)]]), NOW)).toBe(false)
  })

  test('Early Access first, then lowest-seen, then the biggest discount', () => {
    const ranked = rank([
      sale('sale:a', 50),
      sale('sale:b', 90),
      sale('sale:c', 30, days(60)),
      { key: 'ea:1', kind: 'ea', appid: 1, line: '' },
    ])
    expect(ranked.map((a) => a.key)).toEqual(['ea:1', 'sale:c', 'sale:b', 'sale:a'])
  })
})

describe('buildAlertEmbed', () => {
  test('renders price, owners by hours and who is missing it, without pinging anyone', () => {
    const alert = evaluateSale(app(), price(749, 70), undefined, NOW) as Alert
    expect(buildAlertEmbed(alert, app(), library)).toMatchInlineSnapshot(`
      {
        "color": 1779768,
        "description": "~~€24.99~~ → **€7.49** (−70%)",
        "fields": [
          {
            "inline": true,
            "name": "Owns it",
            "value": "<@a> (10 h), <@b>",
          },
          {
            "inline": true,
            "name": "Doesn't own",
            "value": "<@c> (wishlisted)",
          },
        ],
        "image": {
          "url": "https://example.test/header.jpg",
        },
        "title": "Deep Rock Galactic",
        "url": "https://store.steampowered.com/app/1/",
      }
    `)
  })
})
