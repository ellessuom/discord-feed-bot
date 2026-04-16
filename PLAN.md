# Discord Feed Bot - Development Plan

A GitHub Actions-powered bot that feeds news from multiple sources (Steam, Reddit, RSS, GitHub) to Discord channels.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        GitHub Repository                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────┐       │
│  │ config.yaml  │    │ data/state   │    │ GitHub Actions   │       │
│  │              │───▶│ .json        │◀───│ (hourly cron)    │       │
│  │ - Sources[]  │    │              │    │                  │       │
│  │ - Webhook    │    │ - Last IDs   │    │ 1. Fetch feeds   │       │
│  │ - Settings   │    │ - Timestamps │    │ 2. Filter new   │       │
│  └──────────────┘    └──────────────┘    │ 3. Post Discord  │       │
│         ▲                                 │ 4. Commit state  │       │
│         │                                 └──────────────────┘       │
│         │                                        │                  │
│  ┌──────┴───────────────────────────────────────┘                  │
│  │                                                                  │
│  │  ┌────────────────────────────────────────────────────────────┐  │
│  │  │                  GitHub Pages (Phase 3)                     │  │
│  │  │                                                            │  │
│  │  │  - Manage sources (Steam, Reddit, RSS, GitHub)              │  │
│  │  │  - Search Steam games by name                              │  │
│  │  │  - Add/remove sources                                      │  │
│  │  │  - View status & recent posts                              │  │
│  │  │  - Configure via GitHub API → config.yaml                   │  │
│  │  └────────────────────────────────────────────────────────────┘  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌──────────────────┐
                    │    Discord       │
                    │                  │
                    │  ┌────────────┐  │
                    │  │  Channel   │  │
                    │  │  ──────────│  │
                    │  │  🎮 CS2    │  │
                    │  │     News   │  │
                    │  │  ──────────│  │
                    │  │  📰 Reddit │  │
                    │  │  ──────────│  │
                    │  │  🔖 Blog   │  │
                    │  └────────────┘  │
                    └──────────────────┘
```

---

## Source Types Architecture

### Supported Sources

| Source Type   | ID Format           | Feed URL                                         | Status             |
| ------------- | ------------------- | ------------------------------------------------ | ------------------ |
| `steam_game`  | `steam_730`         | `store.steampowered.com/feeds/news/app/{appid}/` | ✅ Implemented     |
| `steam_sales` | `steam_sales`       | TBD (research needed)                            | 🔜 Research needed |
| `steam_news`  | `steam_news`        | `store.steampowered.com/feeds/news/`             | ✅ Implemented     |
| `reddit`      | `reddit_Steam`      | `reddit.com/r/{subreddit}/.rss`                  | 🔜 Planned         |
| `rss`         | `rss_{hash}`        | Any RSS/Atom feed                                | 🔜 Planned         |
| `github`      | `github_owner_repo` | `api.github.com/repos/{owner}/{repo}/releases`   | 🔜 Planned         |

**Notes:**

- `steam_sales`: Requires research to determine if Steam provides a feed/API for featured deals. May need to scrape or find unofficial API.
- No default sources configured - user must explicitly add each source they want to follow.
- Single Discord channel (one webhook) - all sources post to the same channel.

### Source Handler Pattern

```
src/
├── sources/
│   ├── index.ts        # Registry & dispatcher
│   ├── types.ts         # Source interfaces
│   ├── steam.ts         # Steam game + news + sales
│   ├── reddit.ts        # Reddit subreddit handler
│   ├── rss.ts           # Generic RSS handler
│   └── github.ts        # GitHub releases handler
```

---

## Phase 1: Project Setup ✅ COMPLETE

Goal: Create a solid foundation with proper tooling, linting, and build configuration.

### 1.1 Initialize Project ✅

- [x] Create `package.json` with:
  - Project name: `discord-steam-feed-bot`
  - Type: `module` (ESM)
  - Scripts: `dev`, `build`, `start`, `fetch`, `lint`, `typecheck`
  - Node.js version: `>=20.0.0`

- [x] Create `tsconfig.json`:
  - Target: `ES2022`
  - Module: `ESNext` with `Bundler` resolution
  - Strict mode enabled
  - Out dir: `dist`
  - Source maps enabled

### 1.2 Core Dependencies ✅

- [x] Runtime dependencies:
  - `rss-parser` - Parse RSS/Atom feeds
  - `discord.js` - Discord API (for future advanced features)
  - `js-yaml` - Parse YAML config
  - `date-fns` - Date manipulation

- [x] Dev dependencies:
  - `typescript`
  - `@types/node`
  - `tsx` - TypeScript execution
  - `eslint` + `@typescript-eslint/*`
  - `prettier`
  - `vitest` - Testing framework

### 1.3 Configuration Files ✅

- [x] `.gitignore` - Ignore `node_modules/`, `dist/`, `.env`, `data/state.json`
- [x] `.nvmrc` - Pin Node.js version (20)
- [x] `.prettierrc` - Formatting rules
- [x] `eslint.config.mjs` - Modern ESLint flat config
- [x] `vitest.config.ts` - Test configuration

### 1.4 GitHub Actions Workflow ✅

- [x] `.github/workflows/feed.yml`:
  - Trigger: schedule (hourly) + workflow_dispatch
  - Steps: checkout, setup node, install, run fetch, commit state
  - Secrets: `DISCORD_WEBHOOK_URL`
  - Security: `permissions: {}` (minimal permissions)

### 1.5 Initial File Structure ✅

```
discord-feed-bot/
├── .github/workflows/feed.yml
├── .gitignore
├── .nvmrc
├── .prettierrc
├── eslint.config.mjs
├── vitest.config.ts
├── package.json
├── tsconfig.json
└── README.md
```

### 1.6 Verify Setup Works ✅

- [x] `npm install` completes successfully
- [x] `npm run lint` passes
- [x] `npm run typecheck` passes
- [x] `npm run build` creates `dist/` folder

---

## Phase 2: Core Bot Logic ✅ COMPLETE

Goal: Implement the feed fetching and Discord posting logic for Steam sources.

### 2.1 Configuration Schema ✅

- [x] Create `config.yaml` structure
- [x] Create `config.example.yaml` (template)
- [x] Create `src/config.ts`:
  - `loadConfig()` - Read and parse `config.yaml`
  - Replace environment variable placeholders
  - Type-safe config interface

### 2.2 Steam RSS Source ✅

- [x] Research Steam RSS endpoints:
  - ✅ Individual game RSS: `https://store.steampowered.com/feeds/news/app/{appid}/`
  - ✅ General Steam news: `https://store.steampowered.com/feeds/news/`
  - ✅ Steam Store Search API: `https://store.steampowered.com/api/storesearch/`

- [x] Create `src/sources/steam.ts`:
  - `fetchGameNews(appid: number, name: string)` - Returns news for specific game
  - `fetchSteamNews()` - Returns general Steam news
  - Normalize response to `NewsItem` interface

### 2.3 State Management ✅

- [x] Create `src/state.ts`:
  - `loadState()` - Read `data/state.json`
  - `saveState(state)` - Write `data/state.json`
  - `isNewItem(item, state)` - Check if item was already posted
  - `markPosted(item, state)` - Record item as posted
  - Auto-limit to 100 IDs per source (prevent unbounded growth)

- [x] State schema with source key tracking:
  ```json
  {
    "lastRun": "2025-01-15T10:00:00Z",
    "postedIds": {
      "game_730": ["id1", "id2"],
      "steam_news": ["id3"]
    },
    "lastSeen": {
      "game_730": "id2",
      "steam_news": "id3"
    }
  }
  ```

### 2.4 Discord Integration ✅

- [x] Create `src/discord/webhook.ts`:
  - `postNews(item, webhookUrl, options)` - POST to webhook
  - Format as Discord embed with:
    - Title, URL, description
    - Steam blue color (#5814783)
    - Timestamp
    - Thumbnail (if image available)
    - Footer with source name

### 2.5 Main Fetch Script ✅

- [x] Create `src/index.ts`:
  - Load config and state
  - Fetch news from all configured sources
  - Filter new items
  - Limit posts per run (configurable)
  - Sort by date (newest/oldest first)
  - Post to Discord
  - Save state

### 2.6 Local Development ✅

- [x] `data/state.example.json` - Template file
- [x] `config.example.yaml` - Template file
- [x] `.env.example` - Environment variable template

### 2.7 Verify Phase 2 ✅

- [x] `npm run fetch` runs without errors (fails gracefully when no webhook configured)
- [x] `npm run typecheck` passes
- [x] `npm run lint` passes
- [x] `npm run build` succeeds

### 2.8 Files Created in Phase 2

```
src/
├── types.ts           # NewsItem interface
├── config.ts          # Config loader
├── state.ts           # State management
├── index.ts           # Main entry point
├── sources/
│   └── steam.ts       # Steam RSS fetcher
└── discord/
    └── webhook.ts     # Discord webhook poster

config.yaml            # User config
config.example.yaml    # Template
.env.example           # Env template
data/
├── state.json         # Runtime state
└── state.example.json # Template
```

---

## Phase 3: Multi-Source Architecture 🚧 IN PROGRESS

Goal: Refactor to support multiple source types (Steam, Reddit, RSS, GitHub) and create a GitHub Pages UI.

### 3.1 Source Type System

- [ ] Create `src/sources/types.ts`:

  ```typescript
  export type SourceType =
    | 'steam_game' // Individual Steam game
    | 'steam_news' // General Steam news
    | 'steam_sales' // Steam sales/promotions
    | 'reddit' // Reddit subreddit
    | 'rss' // Generic RSS feed
    | 'github' // GitHub releases

  export interface Source {
    id: string // Unique identifier
    type: SourceType
    name: string // Display name
    config: SourceConfig
  }

  export type SourceConfig =
    | SteamGameConfig
    | SteamNewsConfig
    | SteamSalesConfig
    | RedditConfig
    | RSSConfig
    | GitHubConfig
  ```

- [ ] Define config interfaces for each source type:
  ```typescript
  interface SteamGameConfig {
    appid: number
  }
  interface SteamNewsConfig {
    enabled: boolean
  }
  interface SteamSalesConfig {
    enabled: boolean
  }
  interface RedditConfig {
    subreddit: string
  }
  interface RSSConfig {
    url: string
  }
  interface GitHubConfig {
    owner: string
    repo: string
  }
  ```

### 3.2 Source Handler Registry

- [ ] Create `src/sources/index.ts`:

  ```typescript
  export async function dispatchSource(source: Source): Promise<NewsItem[]>
  export function validateSourceConfig(source: Source): boolean
  export function getSourceName(source: Source): string
  ```

- [ ] Refactor `src/sources/steam.ts`:
  - Move game-specific logic to `fetchGameNews()`
  - Move general news to `fetchSteamNews()`
  - Add `fetchSteamSales()` (research feed endpoint)

- [ ] Create `src/sources/reddit.ts`:
  - `fetchRedditSubreddit(subreddit: string)` - Fetch from Reddit RSS
  - Parse Reddit RSS format
  - Handle rate limits

- [ ] Create `src/sources/rss.ts`:
  - `fetchGenericRSS(url: string)` - Generic RSS parser
  - Handle RSS 2.0, Atom, etc.

- [ ] Create `src/sources/github.ts`:
  - `fetchGitHubReleases(owner: string, repo: string)` - GitHub API
  - Handle pagination
  - Handle rate limits (unauth: 60/hr, auth: 5000/hr)

### 3.3 Config Schema Refactor

- [ ] Update `config.yaml` structure:

  ```yaml
  discord:
    webhook_url: '${DISCORD_WEBHOOK_URL}'

  sources:
    # Example: Steam game (search by name in UI, or enter appid manually)
    - id: 'steam_cs2'
      type: 'steam_game'
      name: 'Counter-Strike 2'
      config:
        appid: 730

    # Example: Another Steam game
    - id: 'steam_elden_ring'
      type: 'steam_game'
      name: 'Elden Ring'
      config:
        appid: 1245620

    # Steam-wide news (all games announcements)
    - id: 'steam_news'
      type: 'steam_news'
      name: 'Steam News'
      config:
        enabled: true

    # Steam sales (research needed - may not be available as feed)
    # - id: 'steam_sales'
    #   type: 'steam_sales'
    #   name: 'Steam Sales'
    #   config:
    #     enabled: true

    # Example: Reddit subreddit
    - id: 'reddit_steam'
      type: 'reddit'
      name: 'r/Steam'
      config:
        subreddit: 'Steam'

    # Example: Generic RSS feed
    # - id: 'rss_blog'
    #   type: 'rss'
    #   name: 'Developer Blog'
    #   config:
    #     url: 'https://example.com/feed.xml'

    # Example: GitHub releases
    # - id: 'github_raft'
    #   type: 'github'
    #   name: 'Raft'
    #   config:
    #     owner: 'Redbeard-Interactive'
    #     repo: 'Raft'

  settings:
    max_posts_per_run: 10
    include_images: true
    post_order: 'newest_first'
  ```

  **Note:** No sources are added by default. Users must explicitly configure which sources they want to follow.

- [ ] Update `src/config.ts` with new schema validation
- [ ] Update `src/types.ts` with extended interfaces

### 3.4 Main Script Refactor

- [ ] Refactor `src/index.ts`:

  ```typescript
  async function main() {
    const config = loadConfig()
    const state = loadState()
    const newPosts: NewsItem[] = []

    for (const source of config.sources) {
      if (!isSourceEnabled(source)) continue

      console.log(`Fetching: ${source.name}...`)
      const items = await dispatchSource(source)
      const newItems = items.filter((item) => isNewItem(item, state))
      newPosts.push(...newItems)
    }

    // Sort, limit, post...
  }
  ```

### 3.5 Steam Store Search (for UI)

- [ ] Create `src/search/steam.ts`:

  ```typescript
  interface SteamSearchResult {
    appid: number
    name: string
    type: 'game' | 'dlc' | 'software' | 'video'
    tiny_image: string
    metascore?: string
    platforms: { windows: boolean; mac: boolean; linux: boolean }
    price?: { currency: string; initial: number; final: number }
  }

  export async function searchSteamGames(query: string): Promise<SteamSearchResult[]>
  ```

- [ ] Use Steam Store Search API:
  ```
  GET https://store.steampowered.com/api/storesearch/
      ?term={query}&l=english&cc=US
  ```

### 3.6 GitHub Pages UI Setup

- [ ] Create `docs/` folder structure:

  ```
  docs/
  ├── index.html      # Main page
  ├── styles.css      # Dark Discord-like theme
  ├── app.js          # Main app logic
  ├── sources/
  │   ├── steam.js    # Steam search UI
  │   ├── reddit.js   # Reddit subreddit UI
  │   ├── rss.js      # RSS feed UI
  │   └── github.js   # GitHub releases UI
  └── github.js       # GitHub API integration
  ```

- [ ] Configure GitHub Pages:
  - Settings → Pages → Source: `docs/` folder
  - Custom domain (optional)

### 3.7 UI Components

- [ ] `docs/index.html`:
  - Header: Project title, status indicator
  - Sidebar: Source types navigation
  - Main area: Current sources list
  - Add source modal:
    - Source type selector (dropdown)
    - Dynamic form based on source type
    - Search input (for Steam games)
    - Preview/test button
    - Add button

- [ ] `docs/styles.css`:
  - Discord-inspired dark theme (#36393f background)
  - Card-based layout for sources
  - Responsive design (mobile support)
  - Smooth transitions
  - Loading states

- [ ] `docs/app.js`:
  - State management (localStorage for PAT)
  - Config loading from raw.githubusercontent.com
  - Source CRUD operations
  - Real-time validation

### 3.8 GitHub API Integration

- [ ] `docs/github.js`:

  ```typescript
  // Authentication
  function setGitHubToken(token: string)
  function getGitHubToken(): string | null

  // Config operations
  async function getConfig(): Promise<Config>
  async function saveConfig(config: Config): Promise<void>
  async function getSourceSHA(): Promise<string>

  // Source management
  async function addSource(source: Source): Promise<void>
  async function removeSource(sourceId: string): Promise<void>
  async function updateSource(source: Source): Promise<void>
  ```

- [ ] PAT authentication flow:
  - Show instructions for creating PAT
  - Input field for PAT
  - Store in localStorage (client-side only)
  - Validate PAT permissions before use

### 3.9 Verify Phase 3

- [ ] All source types fetch correctly
- [ ] Config schema validates
- [ ] GitHub Pages UI loads
- [ ] Steam game search works
- [ ] Add/remove sources updates config
- [ ] Manual trigger from UI works

---

## Phase 4: Wire UI with Bot 🔜 PENDING

Goal: Ensure UI changes reflect immediately in bot behavior.

### 4.1 Config Validation

- [ ] Create `src/validate.ts`:
  - Validate source configs
  - Log warnings for invalid sources
  - Skip invalid sources gracefully

### 4.2 Status Dashboard

- [ ] Create `data/status.json`:

  ```json
  {
    "lastRun": "2025-04-16T10:00:00Z",
    "success": true,
    "postsCount": 3,
    "sourcesCount": 5,
    "errors": [],
    "nextRun": "2025-04-16T11:00:00Z"
  }
  ```

- [ ] Update `src/index.ts` to write status

- [ ] Add status display in UI:
  - Last run time
  - Success/failure indicator
  - Posts count
  - Active sources count
  - Error messages (if any)

### 4.3 Error Handling

- [ ] Comprehensive error handling:
  - Network failures (retries with backoff)
  - Invalid RSS feeds
  - Rate limits (Reddit, GitHub)
  - Discord webhook failures

- [ ] Error logging:
  - Log to `data/errors.log`
  - Include timestamp, source, error message
  - Limit to last 100 errors

### 4.4 Manual Trigger Integration

- [ ] Add "Run Now" button in UI
- [ ] Use GitHub API to trigger workflow:
  ```typescript
  async function triggerWorkflow(): Promise<void> {
    await fetch(
      `https://api.github.com/repos/${owner}/${repo}/actions/workflows/feed.yml/dispatches`,
      {
        method: 'POST',
        headers: { Authorization: `token ${pat}` },
        body: JSON.stringify({ ref: 'main' }),
      }
    )
  }
  ```

### 4.5 Verify Phase 4

- [ ] Config validation catches errors
- [ ] Status dashboard accurate
- [ ] Error handling robust
- [ ] Manual trigger works from UI

---

## Phase 5: Testing & Deployment 🔜 PENDING

Goal: Ensure reliability and production readiness.

### 5.1 Unit Tests

- [ ] Create `src/__tests__/`:
  - `config.test.ts` - Config loading/validation
  - `state.test.ts` - State management
  - `sources/steam.test.ts` - Steam parsing
  - `sources/reddit.test.ts` - Reddit parsing
  - `sources/rss.test.ts` - RSS parsing
  - `sources/github.test.ts` - GitHub API
  - `discord/webhook.test.ts` - Message formatting

- [ ] Test fixtures in `src/__tests__/fixtures/`:
  - Sample RSS responses
  - Mock API responses

### 5.2 Integration Tests

- [ ] Create `.github/workflows/test.yml`:
  - Runs on push/PR
  - Executes `npm test`
  - Runs lint and typecheck

### 5.3 Manual Testing Checklist

- [ ] Fresh clone works: `npm install && npm run fetch`
- [ ] Each source type posts to Discord
- [ ] Duplicate posts filtered
- [ ] Rate limit handling
- [ ] Invalid sources skipped gracefully
- [ ] GitHub Pages UI functional
- [ ] GitHub Actions cron runs

### 5.4 Documentation

- [ ] Update `README.md`:
  - Multi-source setup
  - Source type reference
  - Configuration examples
  - UI usage guide

- [ ] Create `SOURCES.md`:
  - Detailed docs for each source type
  - API endpoints used
  - Rate limits
  - Troubleshooting

### 5.5 Production Deployment

- [ ] Set GitHub Secrets:
  - `DISCORD_WEBHOOK_URL`
  - `GITHUB_TOKEN` (for GitHub releases source)

- [ ] Enable GitHub Pages

- [ ] Monitor first 24 hours

---

## Future Enhancements

Post-v1 ideas:

- [ ] **Multi-channel routing** - Different sources to different Discord channels
- [ ] **Keyword filtering** - Only post news containing certain words
- [ ] **Rate limiting** - Max posts per source per hour
- [ ] **Discord bot commands** - `/feed add steam:730`, `/feed remove reddit:Steam`
- [ ] **Steam sales research** - Find feed/API for Steam deals
- [ ] **YouTube support** - YouTube channel RSS feeds
- [ ] **Twitter/X support** - Via Nitter RSS (unofficial)
- [ ] **Self-hosting option** - Docker image for non-GitHub users
- [ ] **Backup/restore** - Export/import config
- [ ] **Activity feed** - Show recent posts in UI

---

## Technical Details

### Steam Endpoints

```
# Game-specific news
https://store.steampowered.com/feeds/news/app/{appid}/

# General Steam news (all games)
https://store.steampowered.com/feeds/news/

# Store search (for finding AppIDs)
https://store.steampowered.com/api/storesearch/?term={query}&l=english&cc=US

# News API (alternative to RSS)
https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid={appid}&count=10
```

### Reddit RSS

```
# Subreddit RSS
https://www.reddit.com/r/{subreddit}/.rss

# Example: r/Steam
https://www.reddit.com/r/Steam/.rss

# JSON alternative (adds more metadata)
https://www.reddit.com/r/{subreddit}/new.json?limit=25
```

### GitHub Releases API

```
# List releases
GET https://api.github.com/repos/{owner}/{repo}/releases

# Response includes:
{
  "id": 12345,
  "tag_name": "v1.0.0",
  "name": "Release 1.0.0",
  "body": "Release notes...",
  "published_at": "2025-01-15T10:00:00Z",
  "html_url": "https://github.com/...",
  "assets": [...]
}

# Rate limits:
# Unauthenticated: 60 requests/hour
# Authenticated: 5000 requests/hour
```

### Generic RSS

```
# RSS 2.0
<item>
  <title>...</title>
  <link>...</link>
  <description>...</description>
  <pubDate>...</pubDate>
  <enclosure url="..." />
</item>

# Atom
<entry>
  <title>...</title>
  <link href="..." />
  <content>...</content>
  <published>...</published>
</entry>
```

### Discord Webhook Format

```json
POST https://discord.com/api/webhooks/{id}/{token}

{
  "embeds": [{
    "title": "News Title",
    "description": "Summary...",
    "url": "https://...",
    "color": 5814783,
    "timestamp": "2025-04-16T10:00:00Z",
    "author": {
      "name": "Steam",
      "url": "https://store.steampowered.com/"
    },
    "thumbnail": { "url": "..." },
    "footer": { "text": "Counter-Strike 2" }
  }]
}
```

### GitHub API for Commits

```typescript
// Create or update file
PUT https://api.github.com/repos/{owner}/{repo}/contents/{path}

{
  "message": "Add source: steam_730 (CS2)",
  "content": base64(yaml),
  "sha": "{current_sha}"  // Required for updates
}

// Trigger workflow
POST https://api.github.com/repos/{owner}/{repo}/actions/workflows/feed.yml/dispatches

{
  "ref": "main"
}
```

---

## Progress Summary

| Phase                      | Status         | Completion |
| -------------------------- | -------------- | ---------- |
| Phase 1: Setup             | ✅ Complete    | 100%       |
| Phase 2: Core Logic        | ✅ Complete    | 100%       |
| Phase 3: Multi-Source + UI | 🚧 In Progress | 0%         |
| Phase 4: Integration       | 🔜 Pending     | 0%         |
| Phase 5: Testing           | 🔜 Pending     | 0%         |

### Completed Files

```
Phase 1:
✅ package.json, tsconfig.json, .gitignore, .nvmrc, .prettierrc
✅ eslint.config.mjs, vitest.config.ts, README.md
✅ .github/workflows/feed.yml
✅ config.yaml, config.example.yaml, .env.example
✅ data/state.json, data/state.example.json

Phase 2:
✅ src/types.ts
✅ src/config.ts
✅ src/state.ts
✅ src/index.ts
✅ src/sources/steam.ts
✅ src/discord/webhook.ts
```

### Remaining Work

```
Phase 3:
⬜ src/sources/types.ts
⬜ src/sources/index.ts
⬜ src/sources/reddit.ts
⬜ src/sources/rss.ts
⬜ src/sources/github.ts
⬜ src/search/steam.ts
⬜ docs/* (UI files)

Phase 4:
⬜ src/validate.ts
⬜ data/status.json
⬜ Error handling

Phase 5:
⬜ Tests
⬜ Documentation
⬜ Deployment
```

---

**Ready to continue with Phase 3 (Multi-Source Architecture + UI).**
