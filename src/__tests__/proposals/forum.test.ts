import { describe, test, expect, vi } from 'vitest'
import {
  deriveTags,
  ensureTags,
  formatPrice,
  nameFromUrlSlug,
  priceLine,
  priceFrom,
  buildProposalEmbed,
} from '../../proposals/forum'
import type { DiscordClient, ForumTag } from '../../discord/client'
import type { Proposal } from '../../proposals/types'

function tag(id: string, name: string): ForumTag {
  return { id, name, moderated: false, emoji_id: null, emoji_name: null }
}

function fakeClient(existing: ForumTag[]) {
  const setAvailableTags = vi.fn(async (_forumId: string, tags: Partial<ForumTag>[]) => ({
    id: 'forum',
    name: 'game-proposals',
    // Mimic Discord: tags sent without an id are created fresh.
    available_tags: tags.map((t, i) => tag(t.id ?? `new-${i}`, t.name ?? '')),
  }))
  const client = {
    getChannel: vi.fn(async () => ({
      id: 'forum',
      name: 'game-proposals',
      available_tags: existing,
    })),
    setAvailableTags,
  } as unknown as DiscordClient
  return { client, setAvailableTags }
}

describe('ensureTags', () => {
  test('creates the full tag set on an empty forum', async () => {
    const { client, setAvailableTags } = fakeClient([])
    const map = await ensureTags(client, 'forum')

    expect(setAvailableTags).toHaveBeenCalledOnce()
    expect(map.get('co-op')).toBeDefined()
    expect(map.get('delisted')).toBeDefined()
  })

  test('preserves existing tag IDs so posts keep their tags', async () => {
    // Re-sending a tag without its id makes Discord create a NEW tag and silently
    // un-apply the old one from every post using it.
    const existing = [tag('111', 'co-op'), tag('222', 'played')]
    const { client, setAvailableTags } = fakeClient(existing)

    await ensureTags(client, 'forum')

    const sent = setAvailableTags.mock.calls[0]?.[1] ?? []
    const coop = sent.find((t) => t.name === 'co-op')
    const played = sent.find((t) => t.name === 'played')
    expect(coop?.id).toBe('111')
    expect(played?.id).toBe('222')
  })

  test('keeps tags it does not recognise', async () => {
    const { client, setAvailableTags } = fakeClient([tag('999', 'hand-made-tag')])

    await ensureTags(client, 'forum')

    const sent = setAvailableTags.mock.calls[0]?.[1] ?? []
    expect(sent.find((t) => t.name === 'hand-made-tag')?.id).toBe('999')
  })

  test('does not write when every desired tag already exists', async () => {
    const all = [
      'co-op',
      'online-multiplayer',
      'local-multiplayer',
      'singleplayer',
      'free',
      'under-10',
      'on-sale',
      'delisted',
      'unreleased',
      'shortlist',
      'played',
      'passed',
    ].map((name, i) => tag(String(i), name))
    const { client, setAvailableTags } = fakeClient(all)

    const map = await ensureTags(client, 'forum')

    expect(setAvailableTags).not.toHaveBeenCalled()
    expect(map.size).toBe(12)
  })

  test('refuses to write past the 20-tag forum limit', async () => {
    const existing = Array.from({ length: 19 }, (_, i) => tag(String(i), `custom-${i}`))
    const { client, setAvailableTags } = fakeClient(existing)

    await ensureTags(client, 'forum')

    expect(setAvailableTags).not.toHaveBeenCalled()
  })
})

function proposal(overrides: Partial<Proposal> = {}): Proposal {
  return {
    kind: 'app',
    id: 1,
    name: 'Test Game',
    url: 'https://store.steampowered.com/app/1/',
    status: 'priced',
    mentions: [{ userId: 'u1', username: 'leo', messageId: 'm1', at: '2026-08-31T08:00:00Z' }],
    ...overrides,
  }
}

describe('deriveTags', () => {
  test('maps Steam categories onto forum tags', () => {
    const tags = deriveTags(proposal(), {
      name: 'Test',
      type: 'game',
      isFree: false,
      comingSoon: false,
      categories: ['Online Co-op', 'Multi-player', 'Remote Play Together'],
      genres: ['Action'],
    })
    expect(tags).toContain('co-op')
    expect(tags).toContain('online-multiplayer')
    expect(tags).toContain('local-multiplayer')
  })

  test('tags a discounted cheap game as on-sale and under-10', () => {
    const p = proposal({
      price: {
        current: 249,
        original: 499,
        discount: 50,
        currency: 'EUR',
        lowestSeen: 249,
        checkedAt: '',
      },
    })
    const tags = deriveTags(p)
    expect(tags).toContain('on-sale')
    expect(tags).toContain('under-10')
  })

  test('never exceeds the 5-tag per-post limit', () => {
    const p = proposal({
      status: 'free',
      price: {
        current: 0,
        original: 999,
        discount: 100,
        currency: 'EUR',
        lowestSeen: 0,
        checkedAt: '',
      },
    })
    const tags = deriveTags(p, {
      name: 'Test',
      type: 'game',
      isFree: true,
      comingSoon: true,
      categories: ['Co-op', 'Multi-player', 'Shared/Split Screen', 'Single-player'],
      genres: [],
    })
    expect(tags.length).toBeLessThanOrEqual(5)
  })

  test('does not tag a free game as delisted', () => {
    const tags = deriveTags(proposal({ status: 'free' }))
    expect(tags).toContain('free')
    expect(tags).not.toContain('delisted')
  })
})

describe('price formatting', () => {
  test('renders integer cents as currency', () => {
    expect(formatPrice(249, 'EUR')).toBe('€2.49')
    expect(formatPrice(5999, 'USD')).toBe('$59.99')
  })

  test('shows the discount and original price when on sale', () => {
    const line = priceLine(
      proposal({
        price: {
          current: 249,
          original: 499,
          discount: 50,
          currency: 'EUR',
          lowestSeen: 249,
          checkedAt: '',
        },
      })
    )
    expect(line).toContain('€2.49')
    expect(line).toContain('50% off')
    expect(line).toContain('€4.99')
  })

  test('distinguishes free, unreleased and delisted from a missing price', () => {
    expect(priceLine(proposal({ status: 'free' }))).toBe('Free to play')
    expect(priceLine(proposal({ status: 'unreleased' }))).toBe('Unreleased')
    expect(priceLine(proposal({ status: 'delisted' }))).toBe('Unavailable on Steam')
  })

  test('tracks the lowest price ever seen across refreshes', () => {
    const first = priceFrom({ currency: 'EUR', initial: 999, final: 999, discount_percent: 0 })
    expect(first.lowestSeen).toBe(999)

    const onSale = priceFrom(
      { currency: 'EUR', initial: 999, final: 499, discount_percent: 50 },
      first.lowestSeen
    )
    expect(onSale.lowestSeen).toBe(499)

    const backToFull = priceFrom(
      { currency: 'EUR', initial: 999, final: 999, discount_percent: 0 },
      onSale.lowestSeen
    )
    expect(backToFull.lowestSeen).toBe(499)
  })
})

describe('nameFromUrlSlug', () => {
  test('recovers a readable name from a store URL slug', () => {
    expect(nameFromUrlSlug('https://store.steampowered.com/app/774291/Last_Man_Sitting/')).toBe(
      'Last Man Sitting'
    )
  })

  test('returns null when the URL has no slug', () => {
    expect(nameFromUrlSlug('https://store.steampowered.com/app/774291/')).toBeNull()
  })
})

describe('buildProposalEmbed', () => {
  test('credits every distinct proposer once', () => {
    const embed = buildProposalEmbed(
      proposal({
        mentions: [
          { userId: 'u1', username: 'a', messageId: 'm1', at: '2026-01-01T00:00:00Z' },
          { userId: 'u1', username: 'a', messageId: 'm2', at: '2026-02-01T00:00:00Z' },
          { userId: 'u2', username: 'b', messageId: 'm3', at: '2026-03-01T00:00:00Z' },
        ],
      })
    )
    const field = embed.fields?.find((f) => f.name === 'Proposed by')
    expect(field?.value).toBe('<@u1>, <@u2>')
  })

  test('links the embed to the store page', () => {
    const embed = buildProposalEmbed(proposal())
    expect(embed.url).toBe('https://store.steampowered.com/app/1/')
  })
})
