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

## Voice time (opt-in only)

If you agreed to be part of the weekly stats, an admin added your Discord ID to the
bot's opt-in list. Only then, every 2 minutes while you are in a voice channel, the
bot records:

- that you were in voice, and in which channel (the AFK channel is ignored)
- the Steam game you were playing at that moment, if your Steam profile shows it

This is used for the weekly recap in #general (time in voice together, who played with
whom, the longest session and busiest evening, what you played together) and a yearly recap. Samples are deleted after 400 days.
To opt out, ask an admin: your ID is removed from the list and your samples deleted.

`/together` is separate: when someone runs it, the bot checks who is in their voice
channel right then, to suggest games for those people. Nothing about that is stored.

## `/ask`

`/ask` answers questions about video games using OpenAI (GPT-6 Luna) and web search.
When you use it:

- your question (with any @mentions removed) is sent to OpenAI, together with facts from
  the server's Steam data: which linked members own or wishlisted the games involved, and
  their hours, and which co-op games each linked member owns (for suggestions). People are
  sent only as "Friend A", "Friend B"…, never by name or Discord ID; the bot puts the names
  back into its reply.
- the bot asks OpenAI not to store the request, but OpenAI may keep it for up to 30 days to
  check for abuse.
- the question and the answer are posted in the channel for everyone there to see. The
  bot itself doesn't store either, only how many questions each person asked per day (for
  the daily limit) and what they cost, for about 2 months.

## Where it lives

In a private Cloudflare D1 database that only the server owner can access, stored
in Cloudflare's Western Europe region. It is never committed to this (public)
repository.

## What it's used for

Showing who owns or wishlisted a game (`/owns`, `/together` and the #game-proposals cards),
pinging you when a game you wishlisted or proposed drops in price (unless you
already own it), game alerts in #game-news that show who owns or wishlisted the
game (by name, never a ping), and, as the bot grows, deal alerts for games your friends play,
game-night suggestions and playtime recaps.
Apart from what `/ask` sends to OpenAI (above), it is not shared with anyone outside the server.

## Updates and removal

Your library is refreshed about once a day. `/unlink` deletes your Steam ID and
every stored game and wishlist entry immediately, and stops future syncs.

Data provided by the [Steam Web API](https://steamcommunity.com/dev). This bot is
not affiliated with Valve.
