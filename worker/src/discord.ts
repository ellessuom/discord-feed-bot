// Fixed identifiers of the app and server; none of these are secrets.
export const APPLICATION_ID = '1547676115693346946'
export const PUBLIC_KEY = '707103b118a335695decdbaefc1d5356d9d1786f053aa873cf5ac477b33fb2c0'
export const GUILD_ID = '1305936883271860294' // Caesar's Palace

const STRING = 3
const USER = 6
const GUILD_ONLY = [0]
const ADMINISTRATOR = 8n

const MEMBER_OPTION = {
  type: USER,
  name: 'member',
  description: 'Admins only: do it for this member instead of yourself',
}

export const COMMANDS = [
  {
    name: 'link',
    description: 'Link your Steam profile so the bot knows which games you own',
    contexts: GUILD_ONLY,
    options: [
      {
        type: STRING,
        name: 'profile',
        description: 'Steam profile link, custom URL name, or SteamID64',
        required: true,
      },
      MEMBER_OPTION,
    ],
  },
  {
    name: 'unlink',
    description: 'Remove your Steam link and every bit of library data stored for you',
    contexts: GUILD_ONLY,
    options: [MEMBER_OPTION],
  },
  {
    name: 'owns',
    description: 'Who owns or wishlisted a game',
    contexts: GUILD_ONLY,
    options: [
      { type: STRING, name: 'game', description: 'Game name or Steam store link', required: true },
    ],
  },
]

export interface Interaction {
  type: number
  token: string
  guild_id?: string
  /** permissions: the invoker's resolved permission bitfield in this channel, as a decimal string. */
  member?: { user: { id: string }; permissions?: string }
  data?: { name: string; options?: { name: string; value: string }[] }
}

export function option(interaction: Interaction, name: string): string {
  return interaction.data?.options?.find((o) => o.name === name)?.value ?? ''
}

export function isAdmin(interaction: Interaction): boolean {
  return (BigInt(interaction.member?.permissions ?? '0') & ADMINISTRATOR) === ADMINISTRATOR
}

/** Replaces the "thinking…" placeholder. Mentions render as names but never ping. */
export async function editReply(token: string, content: string): Promise<void> {
  const response = await fetch(
    `https://discord.com/api/v10/webhooks/${APPLICATION_ID}/${token}/messages/@original`,
    {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content, allowed_mentions: { parse: [] } }),
    }
  )
  if (!response.ok) console.error(`editReply failed: HTTP ${response.status}`)
}
