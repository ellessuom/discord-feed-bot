const requiredEnvVars = ['VITE_REPO_OWNER', 'VITE_REPO_NAME'] as const

type RequiredEnvVar = (typeof requiredEnvVars)[number]

export function validateEnv(): void {
  const missing: RequiredEnvVar[] = []

  for (const key of requiredEnvVars) {
    if (!import.meta.env[key]) {
      missing.push(key)
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}. ` +
        `Configure these in .env or .env.local file.`
    )
  }
}

export const REPO_OWNER = import.meta.env.VITE_REPO_OWNER as string
export const REPO_NAME = import.meta.env.VITE_REPO_NAME as string
