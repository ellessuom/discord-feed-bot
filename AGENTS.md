# Agent Instructions

## Monorepo Structure

- Workspace: root package + `ui/` subpackage
- Use `-w ui` for ui-specific commands: `npm run dev -w ui`, `npm run build -w ui`
- Running `npm run build` builds both backend and UI

## Verification Order

CI runs: `lint -> typecheck -> test`
Always run all three before committing.

## Key Commands

```bash
npm run dev          # Run backend locally
npm run dev:ui       # Start UI dev server (Vite)
npm run build        # Build backend (tsc) + UI
npm test             # Vitest (tests in src/**/__tests__/)
npm run lint         # ESLint (root + ui)
npm run typecheck    # TypeScript check (root + ui)
npm run format       # Prettier (checks src/ only)
```

## TypeScript Strictness

tsconfig.json enables:

- `noUncheckedIndexedAccess` - array access may be undefined
- `exactOptionalPropertyTypes` - optional props must match exactly
- `noImplicitReturns`, `noFallthroughCasesInSwitch`

## Code Style (Prettier)

- No semicolons (`"semi": false`)
- Single quotes
- Trailing commas es5

## Test Setup

- Tests in `src/**/__tests__/` directories
- Tests modify `config.yaml` at project root, backing up and restoring
- Test framework: Vitest with `globals: true`

## Config Validation Rules

Non-obvious validation constraints in `src/config.ts`:

- Steam `appid` must be positive integer > 0
- Reddit `subreddit` cannot contain hyphens or spaces (underscores OK)
- Webhook URL must be from `discord.com` or `discordapp.com`
- `max_posts_per_run` must be 1-100
- `post_order` must be `newest_first` or `oldest_first`
- Config uses `${ENV_VAR}` pattern for environment variable substitution

## GitHub Actions

- `[skip ci]` in commit messages prevents CI trigger (used for state commits)
- feed.yml workflow commits state back to repo after fetching

## Source Types Entry Point

`src/sources/index.ts` dispatches source fetching by type. All source implementations export a `fetch*` function.

## UI Package

- Path alias: `@/*` maps to `ui/src/*`
- ESLint has special rules for `src/components/ui/*.tsx` files
- Build: `tsc -b && vite build` (typecheck then build)
