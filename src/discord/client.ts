import { withRetry } from '../utils/retry'
import { toHttpError } from '../utils/http-error'

const API_BASE = 'https://discord.com/api/v10'
const USER_AGENT = 'DiscordFeedBot (https://github.com/ellessuom/discord-feed-bot, 1.0.0)'

/** Discord buckets thread creation and reactions separately and tightly. */
const WRITE_SPACING_MS = 1200

export interface DiscordMessage {
  id: string
  channel_id: string
  content: string
  timestamp: string
  author: { id: string; username: string; bot?: boolean }
}

export interface ForumTag {
  id: string
  name: string
  moderated: boolean
  emoji_id: string | null
  emoji_name: string | null
}

export interface ForumChannel {
  id: string
  name: string
  available_tags?: ForumTag[]
  flags?: number
}

export interface DiscordEmbed {
  title?: string
  url?: string
  description?: string
  color?: number
  timestamp?: string
  fields?: { name: string; value: string; inline?: boolean }[]
  author?: { name: string; url?: string; icon_url?: string }
  image?: { url: string }
  thumbnail?: { url: string }
  footer?: { text: string; icon_url?: string }
}

export interface CreatedThread {
  id: string
  message?: { id: string }
}

/** REQUIRE_TAG (1 << 4) on a forum channel forces every post to carry a tag. */
export const CHANNEL_FLAG_REQUIRE_TAG = 1 << 4

export class DiscordClient {
  private readonly token: string
  private lastWriteAt = 0

  constructor(token: string) {
    this.token = token
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    operation?: string
  ): Promise<T> {
    return withRetry(
      async () => {
        const init: Parameters<typeof fetch>[1] = {
          method,
          headers: {
            Authorization: `Bot ${this.token}`,
            'User-Agent': USER_AGENT,
            ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          },
          ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        }

        const response = await fetch(`${API_BASE}${path}`, init)
        if (!response.ok) {
          throw await toHttpError(response)
        }
        if (response.status === 204) {
          return undefined as T
        }
        return (await response.json()) as T
      },
      { retries: 4, baseDelayMs: 1000, maxDelayMs: 60000 },
      { operation: operation ?? `${method} ${path}` }
    )
  }

  /** Serialises writes so bulk backfills don't trip per-route buckets. */
  private async throttledWrite<T>(fn: () => Promise<T>): Promise<T> {
    const elapsed = Date.now() - this.lastWriteAt
    if (elapsed < WRITE_SPACING_MS) {
      await new Promise((resolve) => setTimeout(resolve, WRITE_SPACING_MS - elapsed))
    }
    try {
      return await fn()
    } finally {
      this.lastWriteAt = Date.now()
    }
  }

  async getChannel(channelId: string): Promise<ForumChannel> {
    return this.request<ForumChannel>('GET', `/channels/${channelId}`, undefined, 'getChannel')
  }

  /**
   * One page of messages, newest-first. Pass `before` to walk backwards through
   * history, `after` to pick up new messages since a cursor.
   */
  async getMessages(
    channelId: string,
    params: { before?: string; after?: string; limit?: number } = {}
  ): Promise<DiscordMessage[]> {
    const query = new URLSearchParams({ limit: String(params.limit ?? 100) })
    if (params.before) query.set('before', params.before)
    if (params.after) query.set('after', params.after)
    return this.request<DiscordMessage[]>(
      'GET',
      `/channels/${channelId}/messages?${query.toString()}`,
      undefined,
      'getMessages'
    )
  }

  async setAvailableTags(forumId: string, tags: Partial<ForumTag>[]): Promise<ForumChannel> {
    return this.throttledWrite(() =>
      this.request<ForumChannel>(
        'PATCH',
        `/channels/${forumId}`,
        { available_tags: tags },
        'setAvailableTags'
      )
    )
  }

  async createForumPost(
    forumId: string,
    options: {
      name: string
      embeds: DiscordEmbed[]
      appliedTags: string[]
      autoArchiveDuration?: number
    }
  ): Promise<CreatedThread> {
    return this.throttledWrite(() =>
      this.request<CreatedThread>(
        'POST',
        `/channels/${forumId}/threads`,
        {
          name: options.name.slice(0, 100),
          auto_archive_duration: options.autoArchiveDuration ?? 10080,
          applied_tags: options.appliedTags,
          message: { embeds: options.embeds },
        },
        'createForumPost'
      )
    )
  }

  async editMessage(
    channelId: string,
    messageId: string,
    payload: { embeds?: DiscordEmbed[]; content?: string }
  ): Promise<void> {
    await this.throttledWrite(() =>
      this.request<unknown>(
        'PATCH',
        `/channels/${channelId}/messages/${messageId}`,
        payload,
        'editMessage'
      )
    )
  }

  async createMessage(channelId: string, payload: { content?: string; embeds?: DiscordEmbed[] }) {
    return this.throttledWrite(() =>
      this.request<DiscordMessage>(
        'POST',
        `/channels/${channelId}/messages`,
        payload,
        'createMessage'
      )
    )
  }

  async addReaction(channelId: string, messageId: string, emoji: string): Promise<void> {
    await this.throttledWrite(() =>
      this.request<void>(
        'PUT',
        `/channels/${channelId}/messages/${messageId}/reactions/${encodeURIComponent(emoji)}/@me`,
        undefined,
        'addReaction'
      )
    )
  }

  /** Unarchiving is permitted for the thread creator without MANAGE_THREADS. */
  async setThreadArchived(threadId: string, archived: boolean): Promise<void> {
    await this.throttledWrite(() =>
      this.request<unknown>('PATCH', `/channels/${threadId}`, { archived }, 'setThreadArchived')
    )
  }

  async deleteThread(threadId: string): Promise<void> {
    await this.throttledWrite(() =>
      this.request<void>('DELETE', `/channels/${threadId}`, undefined, 'deleteThread')
    )
  }
}
