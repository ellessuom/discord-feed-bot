import {
  InteractionResponseFlags,
  InteractionResponseType,
  InteractionType,
  verifyKey,
} from 'discord-interactions'
import { GUILD_ID, PUBLIC_KEY, editReply, isAdmin, option, type Interaction } from './discord'
import { findApp, getPlayer, parseProfileInput, resolveSteamId } from './steam'
import { syncMember, syncStalestMember } from './sync'

interface Env {
  DB: D1Database
  STEAM_API_KEY: string
  BOT_ENABLED?: string
}

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const reply = (content: string, ephemeral = true): Response =>
  json({
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      content,
      allowed_mentions: { parse: [] },
      ...(ephemeral ? { flags: InteractionResponseFlags.EPHEMERAL } : {}),
    },
  })

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (request.method !== 'POST') return new Response('Not found', { status: 404 })

    const body = await request.text()
    const signature = request.headers.get('X-Signature-Ed25519')
    const timestamp = request.headers.get('X-Signature-Timestamp')
    // Discord deliberately sends bad signatures; anything but a 401 gets the endpoint removed.
    if (!signature || !timestamp || !(await verifyKey(body, signature, timestamp, PUBLIC_KEY))) {
      return new Response('Bad request signature', { status: 401 })
    }

    const interaction = JSON.parse(body) as Interaction
    if (interaction.type === InteractionType.PING) {
      return json({ type: InteractionResponseType.PONG })
    }
    if (interaction.type !== InteractionType.APPLICATION_COMMAND) {
      return reply('Unsupported interaction.')
    }

    if (env.BOT_ENABLED === 'false') return reply('The bot is paused right now.')
    if (!GUILD_ID || interaction.guild_id !== GUILD_ID) {
      return reply("This bot only works in Caesar's Palace.")
    }

    const command = interaction.data?.name
    // Admins can /link or /unlink someone else; everyone else only themselves.
    const callerId = interaction.member?.user.id
    const memberId = option(interaction, 'member')
    if (memberId && memberId !== callerId && !isAdmin(interaction)) {
      return reply('Only admins can link or unlink someone else.')
    }
    const userId = memberId || callerId
    const run =
      command === 'link' && userId
        ? () => link(env, userId, option(interaction, 'profile'))
        : command === 'unlink' && userId
          ? () => unlink(env, userId)
          : command === 'owns'
            ? () => owns(env, option(interaction, 'game'))
            : null
    if (!run) return reply('Unknown command.')

    // Steam can take longer than Discord's 3-second limit: acknowledge now, answer within 15 min.
    ctx.waitUntil(
      run()
        .catch((error: unknown) => {
          console.error(`/${command} failed:`, error instanceof Error ? error.message : error)
          return 'Something went wrong talking to Steam. Try again in a minute.'
        })
        .then((content) => editReply(interaction.token, content))
    )
    return json({
      type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
      data: command === 'owns' ? {} : { flags: InteractionResponseFlags.EPHEMERAL },
    })
  },

  async scheduled(_event: ScheduledEvent, env: Env): Promise<void> {
    if (env.BOT_ENABLED === 'false') return
    await syncStalestMember(env.DB, env.STEAM_API_KEY)
  },
}

const PRIVACY_HELP =
  'On Steam: **Profile → Edit Profile → Privacy Settings** → set *My profile* and *Game details* to **Public**'

async function link(env: Env, discordId: string, input: string): Promise<string> {
  const ref = parseProfileInput(input)
  if (!ref)
    return "That doesn't look like a Steam profile. Paste your profile link (steamcommunity.com/id/… or /profiles/…)."

  const steamId = await resolveSteamId(ref, env.STEAM_API_KEY)
  if (!steamId)
    return `Couldn't find a Steam profile called \`${input.trim()}\`. Try pasting the full profile link.`

  const player = await getPlayer(steamId, env.STEAM_API_KEY)
  if (!player) return "Steam doesn't know that profile."
  if (player.communityvisibilitystate !== 3) {
    return `**${player.personaname}**'s profile isn't public, so I can't see its games. ${PRIVACY_HELP}, then run /link again.`
  }

  const taken = await env.DB.prepare(
    'SELECT discord_id FROM members WHERE steam_id = ?1 AND discord_id != ?2'
  )
    .bind(steamId, discordId)
    .first<{ discord_id: string }>()
  if (taken) return `That Steam profile is already linked to <@${taken.discord_id}>.`

  await env.DB.batch([
    // Relinking to a different account drops the old account's library.
    ...['owned_games', 'wishlist'].map((table) =>
      env.DB.prepare(
        `DELETE FROM ${table} WHERE steam_id IN
         (SELECT steam_id FROM members WHERE discord_id = ?1 AND steam_id != ?2)`
      ).bind(discordId, steamId)
    ),
    env.DB.prepare(
      `INSERT INTO members (discord_id, steam_id, persona, linked_at) VALUES (?1, ?2, ?3, ?4)
       ON CONFLICT (discord_id) DO UPDATE SET
         steam_id = excluded.steam_id, persona = excluded.persona, linked_at = excluded.linked_at, synced_at = NULL`
    ).bind(discordId, steamId, player.personaname, new Date().toISOString()),
  ])

  const synced = await syncMember(env.DB, steamId, env.STEAM_API_KEY)
  if (!synced) {
    return `Linked <@${discordId}> to **${player.personaname}**, but its *Game details* are private so I can't see any games yet. ${PRIVACY_HELP}; I'll pick them up on the next daily sync.`
  }

  const lines = [
    `Linked <@${discordId}> to **${player.personaname}**: ${synced.games} games, ${synced.wishlist} on the wishlist.`,
  ]
  if (synced.playtimeHidden) {
    lines.push(
      "Every game shows 0 hours, which usually means *Always keep my total playtime private* is ticked in Steam's privacy settings. Unticking it lets the bot see what's actually played."
    )
  }
  return lines.join('\n')
}

async function unlink(env: Env, discordId: string): Promise<string> {
  const results = await env.DB.batch([
    ...['owned_games', 'wishlist'].map((table) =>
      env.DB.prepare(
        `DELETE FROM ${table} WHERE steam_id IN (SELECT steam_id FROM members WHERE discord_id = ?1)`
      ).bind(discordId)
    ),
    env.DB.prepare('DELETE FROM members WHERE discord_id = ?1').bind(discordId),
  ])
  const removed = results.at(-1)?.meta.changes ?? 0
  return removed > 0
    ? `Unlinked <@${discordId}>: their Steam ID and library data have been deleted.`
    : `<@${discordId}> wasn't linked, so there was nothing to delete.`
}

const hours = (minutes: number): string =>
  minutes < 60 ? 'under 1 h' : `${Math.round(minutes / 60)} h`

async function owns(env: Env, input: string): Promise<string> {
  const app = await findApp(input)
  if (!app) return `Couldn't find a Steam game matching \`${input.trim()}\`.`

  const [owners, wishers, members] = await Promise.all([
    env.DB.prepare(
      `SELECT m.discord_id, o.playtime_forever FROM owned_games o
       JOIN members m ON m.steam_id = o.steam_id
       WHERE o.appid = ?1 ORDER BY o.playtime_forever DESC`
    )
      .bind(app.appid)
      .all<{ discord_id: string; playtime_forever: number }>(),
    env.DB.prepare(
      `SELECT m.discord_id FROM wishlist w JOIN members m ON m.steam_id = w.steam_id WHERE w.appid = ?1`
    )
      .bind(app.appid)
      .all<{ discord_id: string }>(),
    env.DB.prepare('SELECT discord_id FROM members').all<{ discord_id: string }>(),
  ])

  if (members.results.length === 0)
    return 'Nobody has linked a Steam profile yet. Use /link to start.'

  const owned = new Set(owners.results.map((o) => o.discord_id))
  const wished = new Set(wishers.results.map((w) => w.discord_id))
  const missing = members.results.filter(
    (m) => !owned.has(m.discord_id) && !wished.has(m.discord_id)
  )

  // <…> around the URL stops Discord from attaching a big store preview card.
  const lines = [`**[${app.name}](<https://store.steampowered.com/app/${app.appid}/>)**`]
  lines.push(
    owners.results.length
      ? `Owns it: ${owners.results.map((o) => `<@${o.discord_id}> (${hours(o.playtime_forever)})`).join(', ')}`
      : 'Nobody owns it yet.'
  )
  if (wished.size) lines.push(`Wishlisted: ${[...wished].map((id) => `<@${id}>`).join(', ')}`)
  if (missing.length)
    lines.push(`Doesn't have it: ${missing.map((m) => `<@${m.discord_id}>`).join(', ')}`)
  return lines.join('\n')
}
