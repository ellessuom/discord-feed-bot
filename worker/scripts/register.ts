/**
 * One-off: registers the slash commands in the server and (optionally) points
 * the app's Interactions Endpoint URL at the Worker.
 *
 *   DISCORD_BOT_TOKEN=… npm run register                    # admin-only (while developing)
 *   DISCORD_BOT_TOKEN=… npm run register -- --public        # visible to everyone
 *   DISCORD_BOT_TOKEN=… npm run register -- --endpoint=https://palace-bot.<you>.workers.dev
 *
 * Discord checks the endpoint (a signed PING plus a deliberately bad signature)
 * before accepting it, so a successful --endpoint call proves the Worker is wired up.
 */
import { APPLICATION_ID, COMMANDS, GUILD_ID } from '../src/discord'

const token = process.env.DISCORD_BOT_TOKEN
if (!token) throw new Error('Set DISCORD_BOT_TOKEN (never paste it into chat).')
if (!GUILD_ID) throw new Error('Set GUILD_ID in src/discord.ts first.')

const ADMINISTRATOR = '8'
const isPublic = process.argv.includes('--public')
const endpoint = process.argv.find((a) => a.startsWith('--endpoint='))?.split('=')[1]

async function discord(method: string, path: string, body: unknown): Promise<unknown> {
  const response = await fetch(`https://discord.com/api/v10${path}`, {
    method,
    headers: { Authorization: `Bot ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const text = await response.text()
  if (!response.ok) throw new Error(`${method} ${path} → HTTP ${response.status}: ${text}`)
  return JSON.parse(text)
}

// PUT replaces the whole set, so re-running is safe and removes commands deleted from COMMANDS.
const registered = (await discord(
  'PUT',
  `/applications/${APPLICATION_ID}/guilds/${GUILD_ID}/commands`,
  COMMANDS.map((c) => ({ ...c, default_member_permissions: isPublic ? null : ADMINISTRATOR }))
)) as { name: string }[]
console.log(
  `Registered ${registered.map((c) => `/${c.name}`).join(', ')} (${isPublic ? 'everyone' : 'admins only'})`
)

if (endpoint) {
  await discord('PATCH', '/applications/@me', { interactions_endpoint_url: endpoint })
  console.log(`Interactions endpoint set to ${endpoint}`)
}
