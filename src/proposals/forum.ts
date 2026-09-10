import type { DiscordClient, DiscordEmbed, ForumTag } from '../discord/client'
import { CHANNEL_FLAG_REQUIRE_TAG } from '../discord/client'
import { htmlToText } from '../utils/html-to-text'
import type { Proposal } from './types'
import type { SteamAppDetails, SteamPrice } from './steam'

const STEAM_COLOR = 0x1b2838
const DESCRIPTION_MAX = 300

export const DESIRED_TAGS = [
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
] as const

const MAX_TAGS_PER_FORUM = 20
const MAX_TAGS_PER_POST = 5

/**
 * PATCH /channels/{id} replaces `available_tags` wholesale, and a tag object sent
 * without its `id` is treated as brand new — which would silently un-apply the old
 * one from every post using it. So: merge by name, preserve ids exactly, never drop
 * a tag we don't recognise.
 */
export async function ensureTags(
  client: DiscordClient,
  forumId: string
): Promise<Map<string, string>> {
  const channel = await client.getChannel(forumId)
  const existing = channel.available_tags ?? []
  const byName = new Map(existing.map((t) => [t.name.toLowerCase(), t]))

  const missing = DESIRED_TAGS.filter((name) => !byName.has(name))

  if (missing.length > 0) {
    if (existing.length + missing.length > MAX_TAGS_PER_FORUM) {
      console.warn(
        `Forum already has ${existing.length} tags; adding ${missing.length} would exceed the ` +
          `${MAX_TAGS_PER_FORUM}-tag limit. Skipping tag provisioning.`
      )
    } else {
      // Existing tags are re-sent with their ids intact so they survive the replace.
      const merged: Partial<ForumTag>[] = [
        ...existing.map((t) => ({
          id: t.id,
          name: t.name,
          moderated: t.moderated,
          emoji_id: t.emoji_id,
          emoji_name: t.emoji_name,
        })),
        ...missing.map((name) => ({ name, moderated: false })),
      ]
      console.log(`Provisioning ${missing.length} forum tag(s): ${missing.join(', ')}`)
      const updated = await client.setAvailableTags(forumId, merged)
      for (const tag of updated.available_tags ?? []) {
        byName.set(tag.name.toLowerCase(), tag)
      }
      return new Map([...byName].map(([name, tag]) => [name, tag.id]))
    }
  }

  return new Map([...byName].map(([name, tag]) => [name, tag.id]))
}

export function forumRequiresTag(flags: number | undefined): boolean {
  return ((flags ?? 0) & CHANNEL_FLAG_REQUIRE_TAG) !== 0
}

const CATEGORY_TAGS: { match: RegExp; tag: string }[] = [
  { match: /co-?op/i, tag: 'co-op' },
  { match: /shared\/split screen|remote play together/i, tag: 'local-multiplayer' },
  { match: /online pvp|multi-player|mmo/i, tag: 'online-multiplayer' },
  { match: /single-player/i, tag: 'singleplayer' },
]

/** Steam's own metadata carries most of the taxonomy, so nothing is hand-classified. */
export function deriveTags(proposal: Proposal, details?: SteamAppDetails): string[] {
  const tags = new Set<string>()

  if (proposal.status === 'delisted' || proposal.status === 'unresolved') tags.add('delisted')
  if (proposal.status === 'unreleased') tags.add('unreleased')
  if (proposal.status === 'free') tags.add('free')

  if (details) {
    if (details.isFree) tags.add('free')
    if (details.comingSoon) tags.add('unreleased')
    for (const category of details.categories) {
      for (const rule of CATEGORY_TAGS) {
        if (rule.match.test(category)) tags.add(rule.tag)
      }
    }
  }

  const price = proposal.price
  if (price) {
    if (price.discount > 0) tags.add('on-sale')
    if (price.current > 0 && price.current < 1000) tags.add('under-10')
    if (price.current === 0) tags.add('free')
  }

  // Discord allows 5 applied tags; keep the most informative ones.
  const priority = [
    'delisted',
    'unreleased',
    'on-sale',
    'free',
    'under-10',
    'co-op',
    'local-multiplayer',
    'online-multiplayer',
    'singleplayer',
  ]
  return [...tags]
    .sort((a, b) => priority.indexOf(a) - priority.indexOf(b))
    .slice(0, MAX_TAGS_PER_POST)
}

export function formatPrice(cents: number, currency: string): string {
  const symbols: Record<string, string> = { EUR: '€', USD: '$', GBP: '£' }
  const symbol = symbols[currency] ?? `${currency} `
  return `${symbol}${(cents / 100).toFixed(2)}`
}

export function priceLine(proposal: Proposal): string {
  const price = proposal.price
  if (proposal.status === 'free') return 'Free to play'
  if (proposal.status === 'unreleased') return 'Unreleased'
  if (proposal.status === 'delisted' || proposal.status === 'unresolved')
    return 'Unavailable on Steam'
  if (!price) return 'Unknown'

  const current = formatPrice(price.current, price.currency)
  if (price.discount > 0) {
    const was = formatPrice(price.original, price.currency)
    return `**${current}** — ${price.discount}% off (was ${was})`
  }
  return `**${current}**`
}

export function buildProposalEmbed(proposal: Proposal, details?: SteamAppDetails): DiscordEmbed {
  const embed: DiscordEmbed = {
    title: proposal.name.slice(0, 256),
    url: proposal.url,
    color: STEAM_COLOR,
    fields: [{ name: 'Price', value: priceLine(proposal), inline: true }],
  }

  const proposers = [...new Set(proposal.mentions.map((m) => `<@${m.userId}>`))]
  if (proposers.length > 0) {
    embed.fields?.push({
      name: proposers.length > 1 ? 'Proposed by' : 'Proposed by',
      value: proposers.slice(0, 10).join(', '),
      inline: true,
    })
  }

  const lowest = proposal.price?.lowestSeen
  if (lowest !== undefined && proposal.price && lowest < proposal.price.current) {
    embed.fields?.push({
      name: 'Lowest seen',
      value: formatPrice(lowest, proposal.price.currency),
      inline: true,
    })
  }

  const rawDescription = details?.shortDescription ?? proposal.description
  if (rawDescription) {
    const cleaned = htmlToText(rawDescription, DESCRIPTION_MAX + 100)
    embed.description =
      cleaned.length > DESCRIPTION_MAX ? `${cleaned.slice(0, DESCRIPTION_MAX - 1)}…` : cleaned
  }

  const image = details?.headerImage ?? proposal.headerImage
  if (image) embed.image = { url: image }

  const first = proposal.mentions[0]
  if (first) {
    embed.footer = { text: `First proposed ${new Date(first.at).toLocaleDateString('en-GB')}` }
  }

  return embed
}

export function nameFromUrlSlug(url: string): string | null {
  const match = url.match(/\/(?:app|sub|bundle)\/\d+\/([^/?#]+)/)
  const slug = match?.[1]
  if (!slug) return null
  return decodeURIComponent(slug).replace(/_/g, ' ').trim() || null
}

export function priceFrom(
  steamPrice: SteamPrice,
  previousLowest?: number
): {
  current: number
  original: number
  discount: number
  currency: string
  lowestSeen: number
  checkedAt: string
} {
  const current = steamPrice.final
  return {
    current,
    original: steamPrice.initial,
    discount: steamPrice.discount_percent,
    currency: steamPrice.currency,
    lowestSeen: previousLowest === undefined ? current : Math.min(previousLowest, current),
    checkedAt: new Date().toISOString(),
  }
}
