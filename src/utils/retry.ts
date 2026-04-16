export interface RetryOptions {
  retries: number
  baseDelayMs: number
  maxDelayMs: number
}

export interface RetryContext {
  operation: string
}

const DEFAULT_OPTIONS: RetryOptions = {
  retries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 10000,
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {},
  context?: RetryContext
): Promise<T> {
  const { retries, baseDelayMs, maxDelayMs } = { ...DEFAULT_OPTIONS, ...options }

  let lastError: Error | undefined

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error as Error

      if (attempt < retries) {
        const delay = Math.min(baseDelayMs * Math.pow(2, attempt), maxDelayMs)
        const opName = context?.operation ?? 'operation'
        console.warn(
          `[${opName}] Retry attempt ${attempt + 1}/${retries} after ${delay}ms: ${lastError.message}`
        )
        await new Promise((resolve) => setTimeout(resolve, delay))
      }
    }
  }

  const opName = context?.operation ?? 'operation'
  throw new Error(
    `[${opName}] Failed after ${retries + 1} attempts: ${lastError?.message ?? 'Unknown error'}`,
    { cause: lastError }
  )
}
