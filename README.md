# Discord Steam Feed Bot

GitHub Actions-powered bot that feeds Steam game news to Discord channels.

## Setup

1. Install dependencies: `npm install`

2. Copy `.env.example` to `.env` and set your Discord webhook URL:

   ```
   DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
   ```

3. Copy `config.example.yaml` to `config.yaml` and adjust settings as needed

4. Test locally: `npm run fetch`

5. Commit and push to trigger GitHub Actions workflow (runs hourly)

## Development

- `npm run dev` - Run in development mode
- `npm run build` - Compile TypeScript
- `npm run lint` - Run ESLint
- `npm run typecheck` - Run TypeScript type checking
- `npm run format` - Format code with Prettier
- `npm test` - Run tests

## Configuration

### Discord Webhook

1. Go to your Discord channel → Edit Channel → Integrations → Webhooks → New Webhook
2. Copy the webhook URL and add it to `.env`

### Game Subscriptions

Find AppIDs from Steam store URLs:

- https://store.steampowered.com/app/730/ → AppID: `730`
- https://store.steampowered.com/app/1245620/ → AppID: `1245620`

Edit `config.yaml` to add/remove games.

## GitHub Actions

The bot runs automatically every hour via cron. Manual trigger:

- Go to Actions tab → Fetch Steam News → Run workflow

## Features

- ✅ Fetch Steam game news from RSS feeds
- ✅ Avoid duplicate posts via state tracking
- ✅ Discord webhook integration with embeds
- ✅ Configurable settings (max posts, include images, etc.)
- ✅ Multi-game subscriptions

## License

MIT
