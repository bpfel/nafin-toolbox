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
    alias: {
      // Force Svelte client-side bundle in tests (jsdom is not SSR)
      'svelte': 'svelte',
    },
    server: {
      deps: {
        inline: ['svelte'],
      },
    },
  },
  resolve: {
    conditions: process.env.VITEST ? ['browser'] : [],
  },
})
