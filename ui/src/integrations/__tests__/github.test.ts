import { describe, expect, test } from 'vitest'
import { parseConfig, serializeConfig } from '../github'

describe('config round-trip', () => {
  test('keeps top-level blocks the UI does not edit', () => {
    const yamlIn = `discord:
  webhook_url: \${DISCORD_WEBHOOK_URL}
sources:
  - id: steam_news
    type: steam_news
    name: Steam News
    enabled: true
proposals:
  enabled: true
  bot_token: '\${DISCORD_BOT_TOKEN}'
  forum_channel_id: '123'
`
    const config = parseConfig(yamlIn)
    const saved = parseConfig(
      serializeConfig({ ...config, sources: config.sources.map((s) => ({ ...s, enabled: false })) })
    )

    expect(saved.extra).toEqual({
      proposals: { enabled: true, bot_token: '${DISCORD_BOT_TOKEN}', forum_channel_id: '123' },
    })
    expect(saved.sources[0]?.enabled).toBe(false)
  })
})
