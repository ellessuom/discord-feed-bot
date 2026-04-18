import { describe, test, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import yaml from 'js-yaml'
import { fileURLToPath } from 'node:url'
import type { RSSSource, RedditSource, GitHubSource } from '../sources/types'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '../..')
const configPath = path.resolve(projectRoot, 'config.yaml')
const backupPath = path.resolve(projectRoot, 'config.yaml.backup')

function backupOriginalConfig() {
  if (fs.existsSync(configPath)) {
    fs.copyFileSync(configPath, backupPath)
  }
}

function restoreOriginalConfig() {
  if (fs.existsSync(backupPath)) {
    fs.copyFileSync(backupPath, configPath)
    fs.unlinkSync(backupPath)
  } else if (fs.existsSync(configPath)) {
    fs.unlinkSync(configPath)
  }
}

function writeConfig(config: object) {
  fs.writeFileSync(configPath, yaml.dump(config))
}

function deleteConfig() {
  if (fs.existsSync(configPath)) {
    fs.unlinkSync(configPath)
  }
}

const validConfig = {
  discord: {
    webhook_url: 'https://discord.com/api/webhooks/123456789/abcdefghijklmnop',
  },
  sources: [
    {
      id: 'test-steam',
      type: 'steam_game',
      name: 'Test Game',
      appid: 730,
    },
  ],
}

const { loadConfig } = await import('../config')

describe('config', () => {
  beforeEach(() => {
    backupOriginalConfig()
    deleteConfig()
  })

  afterEach(() => {
    restoreOriginalConfig()
  })

  describe('loading valid config', () => {
    test('loads valid config.yaml with required fields', () => {
      writeConfig(validConfig)

      const config = loadConfig()

      expect(config.discord.webhook_url).toBe(
        'https://discord.com/api/webhooks/123456789/abcdefghijklmnop'
      )
      expect(config.sources).toHaveLength(1)
      expect(config.sources[0]?.id).toBe('test-steam')
    })

    test('applies default settings when not provided', () => {
      writeConfig(validConfig)

      const config = loadConfig()

      expect(config.settings.max_posts_per_run).toBe(10)
      expect(config.settings.max_items_per_source).toBe(5)
      expect(config.settings.include_images).toBe(true)
      expect(config.settings.post_order).toBe('newest_first')
    })

    test('loads custom settings when provided', () => {
      writeConfig({
        ...validConfig,
        settings: {
          max_posts_per_run: 50,
          max_items_per_source: 10,
          include_images: false,
          post_order: 'oldest_first',
        },
      })

      const config = loadConfig()

      expect(config.settings.max_posts_per_run).toBe(50)
      expect(config.settings.max_items_per_source).toBe(10)
      expect(config.settings.include_images).toBe(false)
      expect(config.settings.post_order).toBe('oldest_first')
    })
  })

  describe('environment variable substitution', () => {
    test('substitutes ${VAR} patterns with environment variables', () => {
      process.env.TEST_WEBHOOK = 'https://discord.com/api/webhooks/999/testtoken'
      writeConfig({
        discord: {
          webhook_url: '${TEST_WEBHOOK}',
        },
        sources: [
          {
            id: 'test',
            type: 'steam_game',
            name: 'Test',
            appid: 730,
          },
        ],
      })

      const config = loadConfig()

      expect(config.discord.webhook_url).toBe('https://discord.com/api/webhooks/999/testtoken')
      delete process.env.TEST_WEBHOOK
    })

    test('throws error when environment variable is not set', () => {
      writeConfig({
        discord: {
          webhook_url: '${UNDEFINED_VAR_12345}',
        },
        sources: [
          {
            id: 'test',
            type: 'steam_game',
            name: 'Test',
            appid: 730,
          },
        ],
      })

      expect(() => loadConfig()).toThrow('Environment variable UNDEFINED_VAR_12345 is not set')
    })

    test('substitutes multiple environment variables', () => {
      process.env.WEBHOOK_HOST = 'discord.com'
      process.env.WEBHOOK_PATH = 'api/webhooks/123/abc'
      writeConfig({
        discord: {
          webhook_url: 'https://${WEBHOOK_HOST}/${WEBHOOK_PATH}',
        },
        sources: [
          {
            id: 'test',
            type: 'steam_game',
            name: 'Test',
            appid: 730,
          },
        ],
      })

      const config = loadConfig()

      expect(config.discord.webhook_url).toBe('https://discord.com/api/webhooks/123/abc')
      delete process.env.WEBHOOK_HOST
      delete process.env.WEBHOOK_PATH
    })

    test('substitutes env vars in nested objects', () => {
      process.env.RSS_FEED_URL = 'https://example.com/feed.xml'
      writeConfig({
        discord: validConfig.discord,
        sources: [
          {
            id: 'test-rss',
            type: 'rss',
            name: 'Test RSS',
            url: '${RSS_FEED_URL}',
          },
        ],
      })

      const config = loadConfig()
      const source = config.sources[0] as RSSSource

      expect(source.url).toBe('https://example.com/feed.xml')
      delete process.env.RSS_FEED_URL
    })
  })

  describe('missing config file', () => {
    test('throws error when config.yaml does not exist', () => {
      deleteConfig()

      expect(() => loadConfig()).toThrow('Config file not found')
    })
  })

  describe('validation errors', () => {
    test('throws error for missing discord config', () => {
      writeConfig({
        sources: validConfig.sources,
      })

      expect(() => loadConfig()).toThrow('Config validation failed')
    })

    test('throws error for missing webhook_url', () => {
      writeConfig({
        discord: {},
        sources: validConfig.sources,
      })

      expect(() => loadConfig()).toThrow('Config validation failed')
    })

    test('throws error for empty webhook_url', () => {
      writeConfig({
        discord: {
          webhook_url: '',
        },
        sources: validConfig.sources,
      })

      expect(() => loadConfig()).toThrow('Config validation failed')
    })

    test('throws error for invalid webhook URL format', () => {
      writeConfig({
        discord: {
          webhook_url: 'https://example.com/webhook',
        },
        sources: validConfig.sources,
      })

      expect(() => loadConfig()).toThrow('Config validation failed')
    })

    test('throws error for webhook URL not starting with discord domain', () => {
      writeConfig({
        discord: {
          webhook_url: 'https://example.com/api/webhooks/123/abc',
        },
        sources: validConfig.sources,
      })

      expect(() => loadConfig()).toThrow('Config validation failed')
    })

    test('throws error for missing sources array', () => {
      writeConfig({
        discord: validConfig.discord,
      })

      expect(() => loadConfig()).toThrow('Config validation failed')
    })

    test('accepts empty sources array', () => {
      writeConfig({
        discord: validConfig.discord,
        sources: [],
      })

      const config = loadConfig()
      expect(config.sources).toHaveLength(0)
    })

    test('throws error for invalid max_posts_per_run', () => {
      writeConfig({
        ...validConfig,
        settings: {
          max_posts_per_run: 0,
        },
      })

      expect(() => loadConfig()).toThrow('Config validation failed')
    })

    test('throws error for max_posts_per_run exceeding limit', () => {
      writeConfig({
        ...validConfig,
        settings: {
          max_posts_per_run: 101,
        },
      })

      expect(() => loadConfig()).toThrow('Config validation failed')
    })

    test('throws error for max_items_per_source below minimum', () => {
      writeConfig({
        ...validConfig,
        settings: {
          max_items_per_source: 0,
        },
      })

      expect(() => loadConfig()).toThrow('Config validation failed')
    })

    test('throws error for max_items_per_source exceeding limit', () => {
      writeConfig({
        ...validConfig,
        settings: {
          max_items_per_source: 51,
        },
      })

      expect(() => loadConfig()).toThrow('Config validation failed')
    })

    test('throws error for invalid post_order', () => {
      writeConfig({
        ...validConfig,
        settings: {
          post_order: 'invalid_order',
        },
      })

      expect(() => loadConfig()).toThrow('Config validation failed')
    })
  })

  describe('invalid source configs', () => {
    test('throws error for steam_game missing appid', () => {
      writeConfig({
        discord: validConfig.discord,
        sources: [
          {
            id: 'test',
            type: 'steam_game',
            name: 'Test',
          },
        ],
      })

      expect(() => loadConfig()).toThrow('Config validation failed')
    })

    test('throws error for steam_game with non-positive appid', () => {
      writeConfig({
        discord: validConfig.discord,
        sources: [
          {
            id: 'test',
            type: 'steam_game',
            name: 'Test',
            appid: -1,
          },
        ],
      })

      expect(() => loadConfig()).toThrow('Config validation failed')
    })

    test('throws error for steam_game with zero appid', () => {
      writeConfig({
        discord: validConfig.discord,
        sources: [
          {
            id: 'test',
            type: 'steam_game',
            name: 'Test',
            appid: 0,
          },
        ],
      })

      expect(() => loadConfig()).toThrow('Config validation failed')
    })

    test('throws error for reddit missing subreddit', () => {
      writeConfig({
        discord: validConfig.discord,
        sources: [
          {
            id: 'test',
            type: 'reddit',
            name: 'Test',
          },
        ],
      })

      expect(() => loadConfig()).toThrow('Config validation failed')
    })

    test('throws error for reddit with invalid subreddit name (special chars)', () => {
      writeConfig({
        discord: validConfig.discord,
        sources: [
          {
            id: 'test',
            type: 'reddit',
            name: 'Test',
            subreddit: 'test-subreddit',
          },
        ],
      })

      expect(() => loadConfig()).toThrow('Config validation failed')
    })

    test('throws error for reddit with invalid subreddit name (spaces)', () => {
      writeConfig({
        discord: validConfig.discord,
        sources: [
          {
            id: 'test',
            type: 'reddit',
            name: 'Test',
            subreddit: 'test subreddit',
          },
        ],
      })

      expect(() => loadConfig()).toThrow('Config validation failed')
    })

    test('accepts valid reddit source with underscores in subreddit', () => {
      writeConfig({
        discord: validConfig.discord,
        sources: [
          {
            id: 'test',
            type: 'reddit',
            name: 'Test',
            subreddit: 'test_subreddit',
          },
        ],
      })

      const config = loadConfig()
      const source = config.sources[0] as RedditSource
      expect(source.subreddit).toBe('test_subreddit')
    })

    test('throws error for rss missing url', () => {
      writeConfig({
        discord: validConfig.discord,
        sources: [
          {
            id: 'test',
            type: 'rss',
            name: 'Test',
          },
        ],
      })

      expect(() => loadConfig()).toThrow('Config validation failed')
    })

    test('throws error for rss with invalid url', () => {
      writeConfig({
        discord: validConfig.discord,
        sources: [
          {
            id: 'test',
            type: 'rss',
            name: 'Test',
            url: 'not-a-url',
          },
        ],
      })

      expect(() => loadConfig()).toThrow('Config validation failed')
    })

    test('throws error for github missing owner', () => {
      writeConfig({
        discord: validConfig.discord,
        sources: [
          {
            id: 'test',
            type: 'github',
            name: 'Test',
            repo: 'repo',
          },
        ],
      })

      expect(() => loadConfig()).toThrow('Config validation failed')
    })

    test('throws error for github missing repo', () => {
      writeConfig({
        discord: validConfig.discord,
        sources: [
          {
            id: 'test',
            type: 'github',
            name: 'Test',
            owner: 'owner',
          },
        ],
      })

      expect(() => loadConfig()).toThrow('Config validation failed')
    })

    test('throws error for unknown source type', () => {
      writeConfig({
        discord: validConfig.discord,
        sources: [
          {
            id: 'test',
            type: 'unknown_type',
            name: 'Test',
          },
        ],
      })

      expect(() => loadConfig()).toThrow('Config validation failed')
    })

    test('throws error for source missing id', () => {
      writeConfig({
        discord: validConfig.discord,
        sources: [
          {
            type: 'steam_game',
            name: 'Test',
            appid: 730,
          },
        ],
      })

      expect(() => loadConfig()).toThrow('Config validation failed')
    })

    test('throws error for source missing name', () => {
      writeConfig({
        discord: validConfig.discord,
        sources: [
          {
            id: 'test',
            type: 'steam_game',
            appid: 730,
          },
        ],
      })

      expect(() => loadConfig()).toThrow('Config validation failed')
    })

    test('throws error for source with empty id', () => {
      writeConfig({
        discord: validConfig.discord,
        sources: [
          {
            id: '',
            type: 'steam_game',
            name: 'Test',
            appid: 730,
          },
        ],
      })

      expect(() => loadConfig()).toThrow('Config validation failed')
    })

    test('throws error for source with empty name', () => {
      writeConfig({
        discord: validConfig.discord,
        sources: [
          {
            id: 'test',
            type: 'steam_game',
            name: '',
            appid: 730,
          },
        ],
      })

      expect(() => loadConfig()).toThrow('Config validation failed')
    })
  })

  describe('valid source configs', () => {
    test('accepts steam_game source with all fields', () => {
      writeConfig({
        discord: validConfig.discord,
        sources: [
          {
            id: 'test-steam',
            type: 'steam_game',
            name: 'Test Game',
            appid: 730,
            enabled: true,
          },
        ],
      })

      const config = loadConfig()
      expect(config.sources[0]?.id).toBe('test-steam')
      expect(config.sources[0]?.enabled).toBe(true)
    })

    test('accepts steam_news source', () => {
      writeConfig({
        discord: validConfig.discord,
        sources: [
          {
            id: 'test-news',
            type: 'steam_news',
            name: 'Steam News',
          },
        ],
      })

      const config = loadConfig()
      expect(config.sources[0]?.type).toBe('steam_news')
    })

    test('accepts steam_sales source', () => {
      writeConfig({
        discord: validConfig.discord,
        sources: [
          {
            id: 'test-sales',
            type: 'steam_sales',
            name: 'Steam Sales',
          },
        ],
      })

      const config = loadConfig()
      expect(config.sources[0]?.type).toBe('steam_sales')
    })

    test('accepts reddit source', () => {
      writeConfig({
        discord: validConfig.discord,
        sources: [
          {
            id: 'test-reddit',
            type: 'reddit',
            name: 'Reddit',
            subreddit: 'gaming',
          },
        ],
      })

      const config = loadConfig()
      const source = config.sources[0] as RedditSource
      expect(source.subreddit).toBe('gaming')
    })

    test('accepts rss source', () => {
      writeConfig({
        discord: validConfig.discord,
        sources: [
          {
            id: 'test-rss',
            type: 'rss',
            name: 'Test RSS',
            url: 'https://example.com/feed.xml',
          },
        ],
      })

      const config = loadConfig()
      const source = config.sources[0] as RSSSource
      expect(source.url).toBe('https://example.com/feed.xml')
    })

    test('accepts github source', () => {
      writeConfig({
        discord: validConfig.discord,
        sources: [
          {
            id: 'test-github',
            type: 'github',
            name: 'GitHub',
            owner: 'vercel',
            repo: 'next.js',
          },
        ],
      })

      const config = loadConfig()
      const source = config.sources[0] as GitHubSource
      expect(source.owner).toBe('vercel')
      expect(source.repo).toBe('next.js')
    })

    test('accepts multiple sources of different types', () => {
      writeConfig({
        discord: validConfig.discord,
        sources: [
          {
            id: 'steam-1',
            type: 'steam_game',
            name: 'Game',
            appid: 730,
          },
          {
            id: 'reddit-1',
            type: 'reddit',
            name: 'Reddit',
            subreddit: 'gaming',
          },
          {
            id: 'github-1',
            type: 'github',
            name: 'GitHub',
            owner: 'owner',
            repo: 'repo',
          },
        ],
      })

      const config = loadConfig()
      expect(config.sources).toHaveLength(3)
    })
  })

  describe('webhook URL variations', () => {
    test('accepts discord.com webhook URL', () => {
      writeConfig({
        discord: {
          webhook_url: 'https://discord.com/api/webhooks/123/abc',
        },
        sources: validConfig.sources,
      })

      const config = loadConfig()
      expect(config.discord.webhook_url).toBe('https://discord.com/api/webhooks/123/abc')
    })

    test('accepts discordapp.com webhook URL', () => {
      writeConfig({
        discord: {
          webhook_url: 'https://discordapp.com/api/webhooks/123/abc',
        },
        sources: validConfig.sources,
      })

      const config = loadConfig()
      expect(config.discord.webhook_url).toBe('https://discordapp.com/api/webhooks/123/abc')
    })
  })
})
