import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

export default defineConfig({
  plugins: [svelte({ hot: !process.env.VITEST })],
  server: {
    proxy: {
      '/api': 'http://api:8080',
    },
  },
  test: {
    environment: 'jsdom',
  },
  resolve: process.env.VITEST
    ? { conditions: ['browser'] }
    : undefined,
})
