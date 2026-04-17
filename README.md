# Discord Feed Bot

[![MIT License](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-20%2B-green.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-blue.svg)](https://www.typescriptlang.org/)

GitHub Actions-powered bot that delivers news from multiple sources to Discord channels via webhooks.

## Features

- **Multi-source support**: Steam games, Reddit, RSS feeds, GitHub releases
- **Discord webhook integration**: Rich embeds with thumbnails and metadata
- **State tracking**: Never post duplicates - tracks seen items per source
- **GitHub Actions automation**: Runs hourly via cron, state committed back to repo
- **Web UI (GitHub Pages)**: Manage sources through a dashboard with Steam game search
- **Rate limit handling**: Respects API limits for Reddit and GitHub
- **Configurable**: Max posts per run, image inclusion, sort order

## Quick Start

1. **Clone the repository**

   ```bash
   git clone https://github.com/YOUR_USERNAME/discord-feed-bot.git
   cd discord-feed-bot
   npm install
   ```

2. **Configure webhook**

   ```bash
   cp .env.example .env
   ```

   Edit `.env` and set your Discord webhook URL:

   ```
   DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/YOUR_WEBHOOK
   ```

3. **Copy config template**

   ```bash
   cp config.example.yaml config.yaml
   ```

4. **Enable sources** - Edit `config.yaml` to add/remove sources (see Configuration section)

5. **Push to GitHub**
   ```bash
   git add .
   git commit -m "Configure bot"
   git push
   ```
   The workflow runs automatically every hour.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   GitHub Repository                      │
│                                                         │
│  ┌──────────────┐    ┌──────────────┐    ┌───────────┐ │
│  │ config.yaml  │    │data/state    │    │GitHub     │ │
│  │              │───▶│.json         │◀───│Actions    │ │
│  │ - Sources[]  │    │              │    │(hourly)   │ │
│  │ - Webhook    │    │ - Posted IDs │    │           │ │
│  └──────────────┘    └──────────────┘    └───────────┘ │
│         ▲                                  │           │
│         │                                  ▼           │
│  ┌──────┴─────────────────────────────────────────┐   │
│  │           GitHub Pages (Optional)              │   │
│  │                                                 │   │
│  │  - Manage sources via Web UI                   │   │
│  │  - Search Steam games by name                  │   │
│  │  - Add/remove/enable/disable sources          │   │
│  │  - View bot status & recent posts             │   │
│  └────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
                ┌──────────────────┐
                │    Discord       │
                │                  │
                │  📰 Latest news  │
                │  from configured │
                │  sources         │
                └──────────────────┘
```

## Configuration

Configuration is stored in `config.yaml` at the repository root.

### Structure

```yaml
discord:
  webhook_url: '${DISCORD_WEBHOOK_URL}'

sources:
  - id: 'unique_id'
    type: 'source_type'
    name: 'Display Name'
    enabled: true
    # ... type-specific config

settings:
  max_posts_per_run: 10
  include_images: true
  post_order: 'newest_first'
```

### Settings

| Setting             | Type    | Default        | Description                                  |
| ------------------- | ------- | -------------- | -------------------------------------------- |
| `max_posts_per_run` | number  | 10             | Maximum posts per workflow run               |
| `include_images`    | boolean | true           | Include thumbnails in Discord embeds         |
| `post_order`        | string  | 'newest_first' | Post order: `newest_first` or `oldest_first` |

### Source Examples

#### Steam Game News

```yaml
- id: 'steam_730'
  type: 'steam_game'
  name: 'Counter-Strike 2'
  appid: 730
  enabled: true
```

Find AppIDs from Steam store URLs: `https://store.steampowered.com/app/730/` → AppID: `730`

#### Steam Platform News

```yaml
- id: 'steam_news'
  type: 'steam_news'
  name: 'Steam News'
  enabled: true
```

Platform-wide announcements from Steam.

#### Reddit Subreddit

```yaml
- id: 'reddit_steam'
  type: 'reddit'
  name: 'r/Steam'
  subreddit: 'Steam'
  enabled: true
```

#### Generic RSS Feed

```yaml
- id: 'rss_blog'
  type: 'rss'
  name: 'Developer Blog'
  url: 'https://example.com/feed.xml'
  enabled: true
```

Supports RSS 2.0 and Atom formats.

#### GitHub Releases

```yaml
- id: 'github_vercel_nextjs'
  type: 'github'
  name: 'Next.js'
  owner: 'vercel'
  repo: 'next.js'
  enabled: true
```

Posts new releases from GitHub repositories.

## Source Types

| Type          | ID Format               | Description                       | Status         |
| ------------- | ----------------------- | --------------------------------- | -------------- |
| `steam_game`  | `steam_{appid}`         | Individual Steam game news        | ✅ Implemented |
| `steam_news`  | `steam_news`            | Platform-wide Steam announcements | ✅ Implemented |
| `steam_sales` | `steam_sales`           | Steam sales/promotions            | 🔜 Planned     |
| `reddit`      | `reddit_{subreddit}`    | Subreddit RSS feed                | ✅ Implemented |
| `rss`         | `rss_{hash}`            | Generic RSS/Atom feed             | ✅ Implemented |
| `github`      | `github_{owner}_{repo}` | GitHub repository releases        | ✅ Implemented |

## Web UI (GitHub Pages)

The bot includes an optional web dashboard for managing sources via GitHub Pages.

### Setup

1. **Create GitHub Personal Access Token (PAT)**:
   - Go to GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)
   - Generate new token with `repo` scope (to read/write config.yaml)
   - Optionally add `workflow` scope to trigger manual runs from UI

2. **Enable GitHub Pages**:
   - Repository → Settings → Pages
   - Source: Deploy from a branch
   - Branch: `gh-pages` / `root` (or configure to build from `ui/dist`)

3. **Build and deploy UI**:

   ```bash
   npm run build:ui
   ```

   The static site is built to `ui/dist/`.

4. **Access the dashboard**:
   - URL: `https://YOUR_USERNAME.github.io/discord-feed-bot/`
   - Enter your PAT when prompted (stored locally in browser)

### Features

- **Source management**: Add, remove, enable/disable sources
- **Steam game search**: Search games by name to find AppIDs
- **Status dashboard**: View last run, post count, errors
- **Manual trigger**: Run the workflow immediately from UI (requires PAT with `workflow` scope)
- **Responsive design**: Works on mobile and desktop

### PAT Permissions

| Permission | Required | Purpose                                        |
| ---------- | -------- | ---------------------------------------------- |
| `repo`     | Yes      | Read/write `config.yaml` and `data/state.json` |
| `workflow` | No       | Trigger workflow runs from UI                  |

## GitHub Actions

The bot runs automatically via GitHub Actions.

### Workflow Schedule

- **Cron**: Every hour (`0 * * * *`)
- **Manual trigger**: Actions → Fetch News → Run workflow

### Required Secrets

Set in Repository → Settings → Secrets and variables → Actions:

| Secret                | Required | Description                                             |
| --------------------- | -------- | ------------------------------------------------------- |
| `DISCORD_WEBHOOK_URL` | Yes      | Discord webhook URL                                     |
| `GITHUB_TOKEN`        | No       | For GitHub releases (authenticated = higher rate limit) |

### Manual Trigger

From GitHub web:

1. Actions tab → "Fetch News" workflow
2. Click "Run workflow"
3. Select branch and run

From UI (if configured):

1. Open dashboard
2. Click "Run Now" button

## Development

### Prerequisites

- Node.js 20+
- npm

### Scripts

```bash
# Development
npm run dev              # Run bot locally (development mode)
npm run dev:ui           # Start UI development server

# Build
npm run build            # Build backend + UI
npm run build:backend    # Compile TypeScript to dist/
npm run build:ui         # Build static UI

# Testing
npm test                 # Run Vitest tests
npm run lint             # Run ESLint
npm run typecheck        # Run TypeScript check
npm run format           # Format code with Prettier

# Run manually
npm run fetch            # Execute feed fetch once
```

### Project Structure

```
discord-feed-bot/
├── src/
│   ├── index.ts              # Main entry point
│   ├── config.ts             # Configuration loader
│   ├── state.ts              # State management
│   ├── types.ts              # Shared types
│   ├── sources/
│   │   ├── index.ts          # Source dispatcher
│   │   ├── types.ts          # Source type definitions
│   │   ├── steam.ts          # Steam news handler
│   │   ├── reddit.ts         # Reddit RSS handler
│   │   ├── rss.ts            # Generic RSS handler
│   │   └── github.ts          # GitHub releases handler
│   └── discord/
│       └── webhook.ts        # Discord webhook poster
├── ui/                        # React web dashboard
│   ├── src/
│   │   ├── components/       # UI components
│   │   ├── pages/           # Page components
│   │   ├── stores/          # Zustand state stores
│   │   └── integrations/    # GitHub/Steam API
│   └── dist/                # Built static files
├── data/
│   ├── state.json           # Posted items tracking
│   └── status.json          # Bot status info
├── config.yaml              # User configuration
├── config.example.yaml      # Config template
└── .github/workflows/
    └── feed.yml             # GitHub Actions workflow
```

## Troubleshooting

### Bot runs but posts nothing

- Check `config.yaml` has at least one source with `enabled: true`
- Verify `DISCORD_WEBHOOK_URL` secret is set in repository settings
- Check `data/state.json` - items may have already been posted
- View GitHub Actions logs for errors

### Rate limit errors

- **Reddit**: Limited to ~60 requests/minute. Reduce sources or frequency.
- **GitHub releases**: Authenticated requests (5000/hr) vs unauthenticated (60/hr). Set `GITHUB_TOKEN` secret if using many GitHub sources.

### Webhook errors

- Verify webhook URL is correct and not expired
- Regenerate webhook in Discord if needed
- Ensure webhook has "Send Messages" permission

### State not updating

- GitHub Actions must have write permissions to commit state
- Check workflow file has `permissions: contents: write`
- Verify no merge conflicts in `data/state.json`

### UI shows errors

- Ensure PAT has `repo` scope
- Check browser console for API errors
- Verify repository name in UI settings matches actual repo

## License

MIT License - see [LICENSE](LICENSE) for details.
