import { defineConfig, mergeConfig } from 'vitest/config'
import base from './vite.config'

// The networked link check, kept out of `npm test`. See src/lib/sources/sources.links.ts.
export default mergeConfig(
  base,
  defineConfig({
    test: {
      include: ['src/**/*.links.ts'],
      environment: 'node',
      testTimeout: 60_000,
    },
  }),
)
