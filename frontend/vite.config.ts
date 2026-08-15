import { defineConfig, type Plugin } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

// One id per build. It carries no meaning beyond "this is a different build than
// the last one", so a timestamp is enough.
const buildId = Date.now().toString(36)

/**
 * Writes `dist/version.json` alongside the hashed bundles.
 *
 * A tab that has been open across a deploy is running chunks that no longer exist
 * on the server. Comparing the id compiled into the bundle against this file tells
 * the app whether it is still the live build.
 *
 * `generateBundle` only runs for `vite build`, so `vite dev` emits nothing and the
 * runtime check simply finds no file and does nothing.
 */
function emitVersionFile(): Plugin {
  return {
    name: 'emit-version-json',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: JSON.stringify({ buildId }) + '\n',
      })
    },
  }
}

export default defineConfig({
  plugins: [svelte({ hot: !process.env.VITEST }), emitVersionFile()],
  define: {
    __BUILD_ID__: JSON.stringify(buildId),
  },
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
