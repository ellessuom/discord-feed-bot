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

- Tests in `src/**/__tests__/` directories (UI tests in `ui/src/**/__tests__/`, run by the root Vitest via the `@` alias)
- Tests modify `config.yaml` at project root, backing up and restoring — so never `git add -A`; stage files by name
- Test framework: Vitest with `globals: true`

## Safety Rules (live Discord server, public repo)

- `main` deploys itself: the hourly workflow posts to the real server and commits state. Work on a feature branch; merge by PR only after asking.
- Dev runs use `CONFIG_PATH=config.dev.yaml DATA_DIR=data-dev` (both gitignored) with a dev Discord app/test server — never production IDs or `data/`.
- Secrets (`OPENAI_API_KEY`, `STEAM_API_KEY`, `CF_*`, `ITAD_KEY`, …) are read from `process.env`, never added to `config.yaml`: `loadConfig()` throws on any unset `${VAR}`, which would take the feed down.
- Never handle secret values in chat; the user sets them with `gh secret set` / `wrangler secret put` in their own terminal.
- `npm run proposals:undo` deletes every forum thread irreversibly; it is local-only (removed from the manual workflow) and denied in `.claude/settings.json`.
- `data/proposals.json` is a permanent backlog — never delete or regenerate it.

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

## Worker (`worker/`)

- Cloudflare Worker for slash commands (`/link`, `/unlink`, `/owns`) plus a cron that re-syncs one stale Steam library per run
- Separate package, **not** a root workspace (keeps wrangler out of the hourly `npm ci`): `npm ci --prefix worker`
- Wrangler needs Node 22 (`.nvmrc`)
- Commands: `npm run typecheck --prefix worker`, `npm run dev --prefix worker`; its tests live in `worker/src/__tests__/` and run with the root `npm test`
- Private data (Steam links, libraries) lives in D1 only — see `worker/schema.sql` (additive changes only) and `PRIVACY.md`
- Fixed IDs (application, public key, guild) are constants in `worker/src/discord.ts`; secrets (`STEAM_API_KEY`) are Worker secrets
- `BOT_ENABLED = "false"` in `wrangler.toml` / dashboard is the kill switch
- `scripts/register.ts` registers commands (admin-only unless `--public`) and can set the interactions endpoint; the user runs it with their own bot token
