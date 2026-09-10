import { describe, test, expect, vi, afterEach } from 'vitest'
import { fetchAppDetails, fetchPrices } from '../../proposals/steam'

const REGION = { cc: 'IE', lang: 'english' }

function mockJson(payload: unknown) {
  return vi.fn(async () => ({
    ok: true,
    status: 200,
    statusText: 'OK',
    text: async () => JSON.stringify(payload),
  })) as unknown as typeof fetch
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('fetchAppDetails', () => {
  test('returns full details for a priced game', async () => {
    vi.stubGlobal(
      'fetch',
      mockJson({
        1091500: {
          success: true,
          data: {
            name: 'Cyberpunk 2077',
            type: 'game',
            is_free: false,
            release_date: { coming_soon: false },
            header_image: 'https://example.com/header.jpg',
            short_description: 'An open-world RPG.',
            categories: [{ id: 2, description: 'Single-player' }],
            genres: [{ id: '3', description: 'RPG' }],
            price_overview: {
              currency: 'EUR',
              initial: 5999,
              final: 2999,
              discount_percent: 50,
            },
          },
        },
      })
    )

    const result = await fetchAppDetails(1091500, REGION)

    expect(result.state).toBe('ok')
    if (result.state !== 'ok') return
    expect(result.details.name).toBe('Cyberpunk 2077')
    expect(result.details.categories).toEqual(['Single-player'])
    expect(result.details.price?.final).toBe(2999)
  })

  test('reports success:false as failed, not as a priced game', async () => {
    vi.stubGlobal('fetch', mockJson({ 12345: { success: false } }))
    const result = await fetchAppDetails(12345, REGION)
    expect(result.state).toBe('failed')
  })

  test('treats an empty data array as unavailable rather than delisted', async () => {
    // Steam returns `data: []` for free-to-play and unreleased titles. Collapsing
    // this into the success:false case would mislabel every free game as delisted.
    vi.stubGlobal('fetch', mockJson({ 730: { success: true, data: [] } }))
    const result = await fetchAppDetails(730, REGION)
    expect(result.state).toBe('unavailable')
  })

  test('survives a game with no categories or genres', async () => {
    vi.stubGlobal(
      'fetch',
      mockJson({
        1: { success: true, data: { name: 'Bare', type: 'game', is_free: true } },
      })
    )
    const result = await fetchAppDetails(1, REGION)
    expect(result.state).toBe('ok')
    if (result.state !== 'ok') return
    expect(result.details.categories).toEqual([])
    expect(result.details.isFree).toBe(true)
  })
})

describe('fetchPrices', () => {
  test('maps prices back to their appids', async () => {
    vi.stubGlobal(
      'fetch',
      mockJson({
        1091500: {
          success: true,
          data: {
            price_overview: { currency: 'EUR', initial: 5999, final: 5999, discount_percent: 0 },
          },
        },
        730: { success: true, data: [] },
      })
    )

    const prices = await fetchPrices([1091500, 730], REGION)

    expect(prices.get(1091500)?.final).toBe(5999)
    // Free-to-play: present in the response, but with no price.
    expect(prices.get(730)).toBeNull()
  })

  test('requests batches with the single price_overview filter', async () => {
    const spy = mockJson({})
    vi.stubGlobal('fetch', spy)

    await fetchPrices([1, 2, 3], REGION)

    const url = (spy as unknown as { mock: { calls: string[][] } }).mock.calls[0]?.[0] ?? ''
    // Multiple appids only work with exactly this one filter; anything else 400s.
    expect(url).toContain('appids=1,2,3')
    expect(url).toContain('filters=price_overview')
    expect(url).not.toContain('filters=name')
  })

  test('records a missing appid as null instead of throwing', async () => {
    vi.stubGlobal('fetch', mockJson({}))
    const prices = await fetchPrices([999], REGION)
    expect(prices.get(999)).toBeNull()
  })
})
