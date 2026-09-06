import { mount } from 'svelte'
import App from './App.svelte'
import './app.css'

/**
 * Shows an uncaught error on the page.
 *
 * Without this, a crash during render leaves whatever was last painted frozen on
 * screen — usually the loading state — with the reason visible only to someone
 * who thinks to open devtools. A stuck app should say why it is stuck.
 *
 * Deliberately plain DOM and inline styles: this has to work when the app itself
 * is what broke.
 */
function reportFatal(summary: string, detail: string): void {
  if (document.getElementById('fatal-error')) return

  const box = document.createElement('div')
  box.id = 'fatal-error'
  box.setAttribute('role', 'alert')
  box.style.cssText = [
    'position:fixed', 'inset:auto 0 0 0', 'z-index:9999',
    'background:#fdecea', 'border-top:2px solid #c0392b', 'color:#7d2820',
    'padding:1rem 1.25rem', 'font:14px/1.5 system-ui, sans-serif',
    'max-height:50vh', 'overflow:auto',
  ].join(';')

  const title = document.createElement('strong')
  title.textContent = 'Something broke and the page stopped updating.'

  const body = document.createElement('pre')
  body.style.cssText = 'white-space:pre-wrap;word-break:break-word;margin:.5rem 0 0;font-size:12px'
  body.textContent = `${summary}\n\n${detail}`.trim()

  box.append(title, body)
  document.body.appendChild(box)
}

window.addEventListener('error', e => {
  reportFatal(e.message, `${e.filename}:${e.lineno}:${e.colno}\n${e.error?.stack ?? ''}`)
})

window.addEventListener('unhandledrejection', e => {
  const reason: unknown = e.reason
  reportFatal(
    reason instanceof Error ? reason.message : String(reason),
    reason instanceof Error ? (reason.stack ?? '') : '',
  )
})

/**
 * Preferences the app used to keep and no longer reads.
 *
 * `nafin.collapsedModules` remembered which modules a user had folded away on
 * the single stacked page. There is no stacked page and there are no modules to
 * fold, so the key is dead weight in every browser that ever ran the old build.
 *
 * Removed rather than left: it costs one line now and would otherwise be a
 * puzzle for whoever next opens devtools on a production browser. Wrapped
 * because storage access throws outright in a private window rather than
 * merely being empty, and failing to tidy up is not worth a blank page.
 */
try {
  localStorage.removeItem('nafin.collapsedModules')
} catch {
  // Nothing to do: the preference we wanted to drop is already unreachable.
}

const app = mount(App, {
  target: document.getElementById('app')!,
})

export default app
