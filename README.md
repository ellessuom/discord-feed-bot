# Discord Steam Feed Bot

GitHub Actions-powered bot that feeds Steam game news to Discord channels.

## Setup

1. Install dependencies: `npm install`
2. Copy `config.example.yaml` to `config.yaml`
3. Add your Discord webhook URL to `config.yaml` or set `DISCORD_WEBHOOK_URL` env var
4. Run: `npm run fetch`

## Development

- `npm run dev` - Run in development mode
- `npm run build` - Compile TypeScript
- `npm run lint` - Run ESLint
- `npm run typecheck` - Run TypeScript type checking
- `npm run format` - Format code with Prettier
- `npm test` - Run tests

## Configuration

See `config.example.yaml` for configuration options.
