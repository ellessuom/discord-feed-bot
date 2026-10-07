import { TEST_CHANNEL_ID, postMessage } from './discord'

const REPO = 'ellessuom/discord-feed-bot'

/** Starts a workflow on main; GitHub answers 204 on success. */
async function dispatch(workflow: string, token: string): Promise<number> {
  const response = await fetch(
    `https://api.github.com/repos/${REPO}/actions/workflows/${workflow}/dispatches`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'palace-bot', // GitHub rejects requests without one
      },
      body: JSON.stringify({ ref: 'main' }),
    }
  )
  return response.status
}

/**
 * GitHub's own `schedule` fires only every 3-7 h on free accounts, so this punctual
 * cron starts the hourly feed itself. scheduledTime is the intended tick even when
 * the run is late, so exactly one tick per hour matches.
 */
export async function runClock(
  scheduledTime: number,
  githubToken: string,
  botToken: string
): Promise<void> {
  const tick = new Date(scheduledTime)
  if (tick.getUTCMinutes() !== 0) return

  const status = await dispatch('feed.yml', githubToken)
  if (status >= 200 && status < 300) return
  console.error(`Dispatching feed.yml failed: HTTP ${status}`)
  // Once a day, so an expired or revoked token gets noticed without spamming #test.
  if (tick.getUTCHours() === 9) {
    await postMessage(
      botToken,
      TEST_CHANNEL_ID,
      `⚠️ Couldn't start the hourly feed on GitHub (HTTP ${status}). The bot's GitHub token has probably expired: create a new one and run \`npx wrangler secret put GITHUB_DISPATCH_TOKEN\` in \`worker/\`.`
    )
  }
}
