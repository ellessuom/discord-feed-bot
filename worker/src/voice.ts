import { GUILD_ID, VOICE_OPT_IN, discordApi } from './discord'
import { getPlayers } from './steam'

interface VoiceState {
  channel_id: string | null
}

export interface VoiceSample {
  discord_id: string
  channel_id: string
  appid: number | null
}

/**
 * null = not in voice (404) or in a channel the bot can't see (403). Anything else
 * (429, 5xx) throws, so the tick is skipped rather than recorded with someone missing.
 */
async function voiceState(token: string, userId: string): Promise<VoiceState | null> {
  const response = await discordApi(token, `/guilds/${GUILD_ID}/voice-states/${userId}`)
  if (response.status === 404 || response.status === 403) return null
  if (!response.ok) throw new Error(`voice-state failed: HTTP ${response.status}`)
  return (await response.json()) as VoiceState
}

/** Who sits in which channel (AFK excluded), with the Steam game they're in when known. */
export function toSamples(
  ids: string[],
  states: (VoiceState | null)[],
  afkChannelId: string | null,
  gameIds: Map<string, string>
): VoiceSample[] {
  return ids.flatMap((discord_id, i) => {
    const channel_id = states[i]?.channel_id
    if (!channel_id || channel_id === afkChannelId) return []
    const gameId = gameIds.get(discord_id)
    // Non-Steam shortcuts report 64-bit ids that aren't appids (and overflow a JS number).
    const appid = gameId && /^\d{1,10}$/.test(gameId) ? Number(gameId) : null
    return [{ discord_id, channel_id, appid }]
  })
}

/** Steam's "currently playing" for linked members. Best-effort: a Steam outage only blanks the game. */
async function currentGames(
  db: D1Database,
  steamKey: string,
  discordIds: string[]
): Promise<Map<string, string>> {
  try {
    const { results } = await db
      .prepare(
        'SELECT discord_id, steam_id FROM members WHERE discord_id IN (SELECT value FROM json_each(?1))'
      )
      .bind(JSON.stringify(discordIds))
      .all<{ discord_id: string; steam_id: string }>()
    if (results.length === 0) return new Map()
    const players = await getPlayers(
      results.map((r) => r.steam_id),
      steamKey
    )
    return new Map(
      results.flatMap((r) => {
        const gameid = players.find((p) => p.steamid === r.steam_id)?.gameid
        return gameid ? [[r.discord_id, gameid] as const] : []
      })
    )
  } catch (error) {
    console.warn(`Current games unavailable: ${error instanceof Error ? error.message : error}`)
    return new Map()
  }
}

/** Cron: one row per opted-in member who is in voice right now. */
export async function pollVoice(
  db: D1Database,
  botToken: string,
  steamKey: string,
  scheduledTime: number
): Promise<void> {
  if (VOICE_OPT_IN.length === 0) return
  const states = await Promise.all(VOICE_OPT_IN.map((id) => voiceState(botToken, id)))
  const inVoice = VOICE_OPT_IN.filter((_, i) => states[i]?.channel_id)
  if (inVoice.length === 0) return

  const [guild, gameIds] = await Promise.all([
    discordApi(botToken, `/guilds/${GUILD_ID}`).then((r) =>
      r.ok ? (r.json() as Promise<{ afk_channel_id: string | null }>) : { afk_channel_id: null }
    ),
    currentGames(db, steamKey, inVoice),
  ])
  const samples = toSamples(VOICE_OPT_IN, states, guild.afk_channel_id, gameIds)
  if (samples.length === 0) return

  // Every row of a tick shares one ts, so "same channel at the same time" is an equality join.
  const ts = Math.round(scheduledTime / 60_000) * 60
  await db
    .prepare(
      `INSERT OR IGNORE INTO voice_samples (ts, discord_id, channel_id, appid)
       SELECT ?1, json_extract(value, '$.discord_id'), json_extract(value, '$.channel_id'),
              json_extract(value, '$.appid')
       FROM json_each(?2)`
    )
    .bind(ts, JSON.stringify(samples))
    .run()
}
