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

## Game Proposals Module (`src/proposals/`)

Separate entry point (`npm run proposals`), not a `Source` type — sources are
read-only fetch->NewsItem->post, proposals are read-write records with mutable
state. Do not bend `NewsItem` to fit.

Non-obvious constraints, all of them load-bearing:

- **`data/proposals.json` must never be pruned.** `src/state.ts` prunes at 30 days
  and 100 ids per source; the proposal backlog is permanent, which is why it does
  not live in `state.json`.
- **Steam `appdetails` cannot be batched with multiple filters.** `appids=a,b` with
  no filters returns HTTP 400; only `filters=price_overview` permits batching.
  Full metadata is one appid per request.
- **Steam has three outcomes, not two**: `success:false` (delisted),
  `success:true, data:[]` (free-to-play/unreleased), and a populated `data` object.
  Collapsing the middle case mislabels every free game as delisted.
- **`PATCH /channels/{id}` replaces `available_tags` wholesale**, and a tag sent
  without its `id` is created fresh, silently un-applying the old one everywhere.
  Always merge by name and preserve ids.
- **Adding a `${VAR}` to config.yaml requires adding it to every workflow `env:`
  block.** `substituteEnvVarsInObject` walks the whole config and throws on any
  unset var, before validation - it would take the news feed down with it.
- **`loadConfig` hand-builds its return value.** Adding a schema block is not
  enough; extend the `Config` interface and the return literal too.
- Thread deletion needs `MANAGE_THREADS`, not thread ownership.

## Source Types Entry Point

`src/sources/index.ts` dispatches source fetching by type. All source implementations export a `fetch*` function.

## UI Package

- Path alias: `@/*` maps to `ui/src/*`
- ESLint has special rules for `src/components/ui/*.tsx` files
- Build: `tsc -b && vite build` (typecheck then build)
