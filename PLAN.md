# Discord Steam Feed Bot - Development Plan

A GitHub Actions-powered bot that feeds Steam game news to Discord channels.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        GitHub Repository                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────┐  │
│  │ config.yaml  │    │ data/state   │    │ GitHub Actions   │  │
│  │              │───▶│ .json        │◀───│ (hourly cron)    │  │
│  │ - Webhook URL│    │              │    │                  │  │
│  │ - Game list  │    │ - Last IDs   │    │ 1. Fetch RSS     │  │
│  │ - Settings   │    │ - Timestamps │    │ 2. Filter new    │  │
│  └──────────────┘    └──────────────┘    │ 3. Post Discord  │  │
│         ▲                                 │ 4. Commit state  │  │
│         │                                 └──────────────────┘  │
│         │                                    │                 │
│  ┌──────┴───────────────────────────────────┘                 │
│  │                                                             │
│  │  ┌──────────────────────────────────────────────────────┐  │
│  │  │              GitHub Pages (Optional UI)               │  │
│  │  │                                                       │  │
│  │  │  - Manage game subscriptions                          │  │
│  │  │  - Search Steam for AppIDs                            │  │
│  │  │  - View recent posts                                  │  │
│  │  │  - Configure via GitHub API → config.yaml             │  │
│  │  └──────────────────────────────────────────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
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
                    │  │  🎮 Elden  │  │
                    │  │     Ring   │  │
                    │  └────────────┘  │
                    └──────────────────┘
```

---

## Phase 1: Project Setup

Goal: Create a solid foundation with proper tooling, linting, and build configuration.

### 1.1 Initialize Project

- [ ] Create `package.json` with:
  - Project name: `discord-steam-feed-bot`
  - Type: `module` (ESM)
  - Scripts: `dev`, `build`, `start`, `fetch`, `lint`, `typecheck`
  - Node.js version: `>=20.0.0`

- [ ] Create `tsconfig.json`:
  - Target: `ES2022`
  - Module: `NodeNext`
  - Strict mode enabled
  - Out dir: `dist`
  - Source maps enabled

### 1.2 Core Dependencies

- [ ] Runtime dependencies:
  - `rss-parser` - Parse RSS/Atom feeds
  - `discord.js` - Discord API (for advanced features)
  - `js-yaml` - Parse YAML config
  - `date-fns` - Date manipulation

- [ ] Dev dependencies:
  - `typescript`
  - `@types/node`
  - `tsx` - TypeScript execution
  - `eslint` + `@typescript-eslint/*`
  - `prettier`

### 1.3 Configuration Files

- [ ] `.gitignore` - Ignore `node_modules/`, `dist/`, `.env`, `data/state.json`
- [ ] `.nvmrc` - Pin Node.js version
- [ ] `.prettierrc` - Formatting rules
- [ ] `.eslintrc.json` - Linting rules
- [ ] `eslint.config.mjs` - Modern ESLint flat config (optional)

### 1.4 GitHub Actions Workflow

- [ ] `.github/workflows/feed.yml`:
  - Trigger: schedule (hourly) + workflow_dispatch
  - Steps: checkout, setup node, install, run fetch, commit state
  - Secrets: `DISCORD_WEBHOOK_URL`

### 1.5 Initial File Structure

```
discord-feed-bot/
├── .github/
│   └── workflows/
│       └── feed.yml
├── .gitignore
├── .nvmrc
├── .prettierrc
├── eslint.config.mjs
├── package.json
├── tsconfig.json
└── README.md
```

### 1.6 Verify Setup Works

- [ ] `npm install` completes successfully
- [ ] `npm run lint` passes (empty project)
- [ ] `npm run typecheck` passes (empty project)
- [ ] `npm run build` creates `dist/` folder

---

## Phase 2: Core Bot Logic

Goal: Implement the feed fetching and Discord posting logic.

### 2.1 Configuration Schema

- [ ] Create `config.yaml` structure:
  ```yaml
  discord:
    webhook_url: "${DISCORD_WEBHOOK_URL}"

  sources:
    steam_news:
      enabled: true
    games:
      - appid: 730
        name: "Counter-Strike 2"

  settings:
    max_posts_per_run: 10
    include_images: true
  ```

- [ ] Create `src/config.ts`:
  - `loadConfig()` - Read and parse `config.yaml`
  - Schema validation (ensure required fields exist)
  - Replace environment variable placeholders

### 2.2 Steam RSS Source

- [ ] Research Steam RSS endpoints:
  - Individual game RSS: `https://store.steampowered.com/feeds/news/app/{appid}/`
  - Steam news API: `https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/`
  - Check if there's a general Steam news feed

- [ ] Create `src/sources/steam.ts`:
  - `fetchGameNews(appid: number)` - Returns news items
  - `fetchSteamNews()` - General Steam news (if available)
  - Normalize response format:
    ```typescript
    interface NewsItem {
      id: string;
      title: string;
      url: string;
      content?: string;
      publishedAt: Date;
      source: string;
      image?: string;
    }
    ```

### 2.3 State Management

- [ ] Create `src/state.ts`:
  - `loadState()` - Read `data/state.json`
  - `saveState(state)` - Write `data/state.json`
  - `isNewItem(item, state)` - Check if item was already posted
  - `markPosted(item, state)` - Record item as posted

- [ ] State schema:
  ```json
  {
    "lastRun": "2025-01-15T10:00:00Z",
    "postedIds": {
      "730": ["news_id_1", "news_id_2"],
      "steam_news": ["news_id_3"]
    },
    "lastSeen": {
      "730": "news_id_2",
      "steam_news": "news_id_3"
    }
  }
  ```

### 2.4 Discord Integration

- [ ] Create `src/discord/webhook.ts`:
  - `postNews(item: NewsItem, webhookUrl: string)` - POST to webhook
  - Format as Discord embed:
    ```json
    {
      "embeds": [{
        "title": "News Title",
        "url": "https://...",
        "description": "Summary...",
        "color": 5814783,
        "timestamp": "2025-01-15T10:00:00Z",
        "thumbnail": { "url": "..." },
        "footer": { "text": "Steam News • CS2" }
      }]
    }
    ```

### 2.5 Main Fetch Script

- [ ] Create `src/index.ts`:
  ```typescript
  async function main() {
    const config = loadConfig();
    const state = loadState();
    
    const allNews = [];
    
    // Fetch game news
    for (const game of config.sources.games) {
      const news = await fetchGameNews(game.appid);
      const newNews = news.filter(n => isNewItem(n, state));
      allNews.push(...newNews);
    }
    
    // Fetch Steam news (if enabled)
    if (config.sources.steam_news.enabled) {
      const news = await fetchSteamNews();
      const newNews = news.filter(n => isNewItem(n, state));
      allNews.push(...newNews);
    }
    
    // Sort by date, post to Discord
    for (const item of allNews.sort(byDate)) {
      await postNews(item, config.discord.webhook_url);
      markPosted(item, state);
    }
    
    saveState(state);
  }
  ```

### 2.6 Local Development

- [ ] Add `data/state.example.json` for testing
- [ ] Add `config.example.yaml` (template without secrets)
- [ ] Create `.env.example`:
  ```
  DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
  ```

### 2.7 Verify Phase 2

- [ ] `npm run fetch` runs without errors
- [ ] Creates/updates `data/state.json`
- [ ] Posts to Discord webhook (test with real webhook)

---

## Phase 3: GitHub Pages Configuration UI

Goal: Create a web interface to manage subscriptions without editing YAML directly.

### 3.1 Steam App Search

- [ ] Research Steam App Search API:
  - Steam Store search API (unofficial but widely used)
  - SteamSpy API (for popularity data)
  - Store page scraping (fallback)

- [ ] Create `src/api/steam-search.ts`:
  ```typescript
  interface SteamApp {
    appid: number;
    name: string;
    type: 'game' | 'dlc' | 'software';
    header_image?: string;
  }
  
  async function searchSteamApps(query: string): Promise<SteamApp[]>
  ```

### 3.2 GitHub Pages Setup

- [ ] Create `docs/` folder for GitHub Pages:
  ```
  docs/
  ├── index.html
  ├── styles.css
  └── app.js
  ```

- [ ] Configure GitHub Pages:
  - Source: `docs/` folder
  - Or use GitHub Actions to build and deploy

### 3.3 UI Components

- [ ] Create `docs/index.html`:
  - Header with project title
  - Current subscriptions list (read from config)
  - Add new game form (search → select → add)
  - Remove game button per subscription
  - Settings panel (max posts, include images)

- [ ] Create `docs/styles.css`:
  - Clean, Discord-like dark theme
  - Mobile-responsive
  - Card-based layout

### 3.4 Frontend Logic

- [ ] Create `docs/app.js`:
  - `loadConfig()` - Fetch `config.yaml` (from repo raw URL)
  - `searchGames(query)` - Call Steam search
  - `addGame(appid, name)` - Create commit via GitHub API
  - `removeGame(appid)` - Create commit via GitHub API

### 3.5 GitHub API Integration

- [ ] Create `docs/github.js`:
  ```typescript
  // Uses GitHub API to commit changes
  // Requires personal access token (stored in browser localStorage)
  
  async function commitFile(path: string, content: string, message: string) {
    // 1. Get file SHA
    // 2. Create commit
    // 3. Handle errors
  }
  ```

- [ ] Authentication flow:
  - User provides GitHub Personal Access Token (PAT)
  - PAT stored in `localStorage` (never sent to your servers)
  - PAT needs `repo` scope to commit
  - Show instructions for creating PAT

### 3.6 Alternative: GitHub App

If PAT is too complex for users:

- [ ] Create GitHub App with repo permissions
- [ ] Use OAuth flow to authenticate
- [ ] App makes commits on user's behalf

### 3.7 Verify Phase 3

- [ ] `docs/index.html` loads on GitHub Pages
- [ ] Search for games returns results
- [ ] Adding/removing games updates `config.yaml`
- [ ] UI shows current subscriptions

---

## Phase 4: Wire UI with Bot

Goal: Ensure the UI changes reflect immediately in the bot's behavior.

### 4.1 Config Validation

- [ ] Add config schema validation:
  - `src/validate.ts` - Validate `config.yaml` structure
  - Log warnings for missing/invalid fields
  - Provide helpful error messages

### 4.2 Auto-Reloading (Optional)

- [ ] GitHub Actions already uses fresh config on each run
- [ ] Document that changes take effect on next cron run
- [ ] Add manual trigger button in UI (calls GitHub API)

### 4.3 Status Dashboard

- [ ] Create `data/status.json`:
  ```json
  {
    "lastRun": "2025-01-15T10:00:00Z",
    "success": true,
    "postsCount": 3,
    "errors": [],
    "nextRun": "2025-01-15T11:00:00Z"
  }
  ```

- [ ] Update `src/index.ts` to write status after each run

- [ ] Add status display in UI:
  - Last run time
  - Success/failure
  - Recent posts count
  - Next scheduled run

### 4.4 Error Handling

- [ ] Add comprehensive error handling:
  - Network failures (Steam API, Discord)
  - Invalid config
  - Malformed RSS feeds
  - GitHub API rate limits

- [ ] Error notifications:
  - Log to `data/errors.log`
  - Optional: Send DM to owner via Discord

### 4.5 Verify Phase 4

- [ ] Add game via UI, wait for next cron run, see post in Discord
- [ ] Remove game via UI, confirm no more posts
- [ ] Status page displays correctly
- [ ] Errors are logged properly

---

## Phase 5: Testing & Deployment

Goal: Ensure everything works reliably in production.

### 5.1 Unit Tests

- [ ] Setup test framework:
  - `vitest` or `jest`
  - Add `npm test` script

- [ ] Write tests for:
  - `src/config.ts` - Config loading/validation
  - `src/state.ts` - State management
  - `src/sources/steam.ts` - RSS parsing
  - `src/discord/webhook.ts` - Message formatting

### 5.2 Integration Tests

- [ ] Create `.github/workflows/test.yml`:
  - Runs on push/PR
  - Executes tests
  - Runs lint and typecheck

- [ ] Test fixtures:
  - Sample RSS responses
  - Mock Discord webhook calls

### 5.3 Manual Testing Checklist

- [ ] Fresh clone `npm install && npm run fetch` works
- [ ] Adding new game posts news (if available)
- [ ] Duplicate posts are filtered correctly
- [ ] Webhook failures are handled gracefully
- [ ] GitHub Pages UI works on mobile
- [ ] GitHub Actions cron runs successfully

### 5.4 Documentation

- [ ] Create `README.md`:
  - Project description
  - Setup instructions
  - Configuration reference
  - Creating Discord webhook
  - Creating GitHub PAT
  - Troubleshooting

- [ ] Create `CONTRIBUTING.md`:
  - Development setup
  - Code style
  - Pull request process

### 5.5 Production Deployment

- [ ] Set GitHub Secrets:
  - `DISCORD_WEBHOOK_URL`
  - (Optional) `GITHUB_TOKEN` for advanced features

- [ ] Enable GitHub Pages:
  - Settings → Pages → Source: `docs/` folder

- [ ] Test cron job:
  - Push to main
  - Manually trigger via Actions tab
  - Verify Discord posts

- [ ] Monitor first few cron runs:
  - Check Actions logs for errors
  - Verify State file updates
  - Confirm Discord posts appear

---

## Future Enhancements

Ideas for post-v1:

- [ ] Multi-server support (multiple webhooks)
- [ ] Keyword filtering (only post news containing certain words)
- [ ] Channel routing (different games to different channels)
- [ ] RSS sources beyond Steam (Twitter, YouTube, etc.)
- [ ] Rate limiting (max posts per hour)
- [ ] Rich embed customization (colors, thumbnails)
- [ ] Backup/restore config
- [ ] Activity feed in UI (show recent posts)
- [ ] Discord bot integration for commands (`/feed add 730`)
- [ ] Self-hosting option (for non-GitHub users)

---

## Technical Details

### Steam RSS Endpoints

```
Game-specific news:
https://store.steampowered.com/feeds/news/app/{appid}/

Steam News API (alternative):
https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid={appid}&count=10

Steam Store Search:
https://store.steampowered.com/api/storesearch/?term={query}&l=english&cc=US
```

### Discord Webhook Format

```json
POST https://discord.com/api/webhooks/{id}/{token}

{
  "embeds": [{
    "title": "News Title",
    "description": "Summary text...",
    "url": "https://...",
    "color": 5814783,
    "timestamp": "2025-01-15T10:00:00Z",
    "author": {
      "name": "Steam News",
      "url": "https://store.steampowered.com/"
    },
    "thumbnail": {
      "url": "https://..."
    },
    "footer": {
      "text": "Counter-Strike 2"
    }
  }]
}
```

### GitHub API for Commits

```typescript
// Create or update file
PUT https://api.github.com/repos/{owner}/{repo}/contents/{path}

{
  "message": "Add game: CS2 (appid 730)",
  "content": base64(yaml),
  "sha": "{current_sha}"  // Required for updates
}
```

---

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| State storage | Git (`data/state.json`) | No external services, free, version controlled |
| Config storage | Git (`config.yaml`) | Human-readable, easy to edit |
| Runtime | GitHub Actions | Free cron jobs, integrated with repo |
| Discord method | Webhook (v1), Bot (future) | Simpler setup for MVP |
| UI | GitHub Pages | Free, integrated with repo |
| Config updates | GitHub API commits | Automated, no manual file editing |

---

## Estimated Time

| Phase | Estimated Time |
|-------|----------------|
| Phase 1: Setup | 1-2 hours |
| Phase 2: Core Logic | 3-4 hours |
| Phase 3: UI | 4-6 hours |
| Phase 4: Integration | 2-3 hours |
| Phase 5: Testing | 2-3 hours |
| **Total** | **12-18 hours** |

---

Ready to start? Let's begin with **Phase 1: Project Setup**.

Command: `Let's start with Phase 1`