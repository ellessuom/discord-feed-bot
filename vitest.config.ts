import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    // Lets UI modules (which import via `@/...`) be tested from the root runner.
    alias: { '@': fileURLToPath(new URL('./ui/src', import.meta.url)) },
  },
  test: {
    globals: true,
    environment: 'node',
  },
})
