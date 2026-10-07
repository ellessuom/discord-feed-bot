# Privacy

This bot runs on a small private Discord server. Linking your Steam account is optional.
A server admin can link a member's public profile on their behalf; any member can
`/unlink` themselves at any time.

## What is stored when you `/link`

- Your Discord user ID and your SteamID64
- Your Steam display name
- The games on your Steam account, with playtime (total and last two weeks)
- The games on your Steam wishlist, and when you added them

All of it comes from Steam's public API, so the bot can only see it while your
profile and _Game details_ are set to Public.

## Where it lives

In a private Cloudflare D1 database that only the server owner can access. It is
never committed to this (public) repository.

## What it's used for

Showing who owns or wishlisted a game (`/owns` and the #game-proposals cards),
pinging you when a game you wishlisted or proposed drops in price (unless you
already own it), and, as the bot grows, deal alerts for games your friends play,
game-night suggestions and playtime recaps.
It is not shared with anyone outside the server.

## Updates and removal

Your library is refreshed about once a day. `/unlink` deletes your Steam ID and
every stored game and wishlist entry immediately, and stops future syncs.

Data provided by the [Steam Web API](https://steamcommunity.com/dev). This bot is
not affiliated with Valve.
