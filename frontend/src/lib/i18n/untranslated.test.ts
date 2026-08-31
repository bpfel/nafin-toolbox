import { describe, test, expect } from 'vitest'

/**
 * Finds English left behind in components.
 *
 * Written after four separate rounds of "this bit is still in English" — each
 * one a shape the previous scan had not thought of: text sitting on its own
 * line, strings inside object literals, both arms of a ternary in markup, and a
 * status message starting with a digit, which every pattern anchored to a
 * letter had quietly skipped.
 *
 * A scan only finds the shapes it knows about, so this one runs in CI rather
 * than in my head. When it catches something new, widen it here.
 */

/** Admin-only screens stay English by decision, not by oversight. */
const ADMIN_ONLY = ['AuditLogViewer.svelte', 'InvitePanel.svelte', 'DeleteUserModal.svelte']

/**
 * Every component's source, read through Vite rather than `node:fs` — the
 * frontend has no Node types, and the bundler already knows where these are.
 */
const COMPONENTS = import.meta.glob('/src/**/*.svelte', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

function scannable(): [string, string][] {
  return Object.entries(COMPONENTS).filter(
    ([path]) => !ADMIN_ONLY.some(name => path.endsWith(name)),
  )
}

/** The markup half of a component: everything outside `<script>` and `<style>`. */
function markupOf(src: string): string {
  return src
    .replace(/<script[\s\S]*?<\/script>/g, '')
    .replace(/<style[\s\S]*?<\/style>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
}

function scriptOf(src: string): string {
  const blocks = src.match(/<script[\s\S]*?<\/script>/g) ?? []
  return blocks
    .join('\n')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
}

/** Looks like prose but is not shown to anyone. */
const NOT_PROSE = [
  /^[A-Z0-9\s'-]+$/,          // CH00 0000 …, XXXX-XXXX-…
  /^[\w.-]+$/,                // slugs, identifiers, class names
  /^(current|new)-password$/, // autocomplete tokens
  /^(iban|qr-iban|numeric|text|page|polite|button|dialog|menu)$/,
  /^RF\.\.\.$/,
  /^\d+ digits$/,
  // A property line from an object literal spanning several lines inside a
  // markup expression — `count: items.length,`. Prose does not end in a comma.
  /^[a-z]\w*:\s*.+,$/,
]

function looksLikeProse(s: string): boolean {
  const text = s.trim()
  if (text.length < 4) return false
  if (NOT_PROSE.some(rx => rx.test(text))) return false
  // Prose either contains a space or ends in sentence punctuation.
  return /\s/.test(text) || /[.?!]$/.test(text)
}

/** Where a literal can hide in markup. */
const MARKUP_SHAPES: [RegExp, string][] = [
  [/>([A-Za-z0-9][^<>{}\n]{3,})</g, 'text between tags'],
  [/^[ \t]*([A-Za-z0-9][^<>{}\n=]{3,})$/gm, 'text on its own line'],
  [/(?:aria-label|title|placeholder|alt)="([A-Za-z0-9][^"]{3,})"/g, 'attribute'],
  // Any attribute holding a whole sentence — which is how a `message="..."`
  // prop passed to a child component stayed English past the allowlist above.
  // Terminal punctuation is the tell; class names and paths have none.
  [/\w+="([A-Z][^"]*[.?!])"/g, 'sentence in an attribute'],
  [/\{[^{}]*?'([A-Za-z0-9][^']{3,})'[^{}]*?\}/g, 'string in an expression'],
]

/**
 * A lone capitalised word as an element's entire content — a button label.
 *
 * Kept apart from the shapes above because it fails their prose test: a single
 * word with no space and no full stop is indistinguishable from an identifier
 * by shape alone, which is how a stray "Delete" survived every earlier scan.
 * Here the position does the work instead of the wording.
 */
const LONE_LABEL = />\s*([A-Z][a-z]{2,14})\s*</g

/** Where a literal can hide in the script: values that end up rendered. */
const SCRIPT_SHAPES: [RegExp, string][] = [
  [/(?:description|label|message|title|placeholder|error)\s*:\s*'([A-Za-z0-9][^']{3,})'/g, 'object literal'],
  [/=\s*'([A-Za-z0-9][^']{3,})'/g, 'assigned string'],
]

describe('no English left in the interface', () => {
  test('every component takes its text from the catalogue', () => {
    const offenders: string[] = []

    for (const [file, src] of scannable()) {
      const regions: [string, [RegExp, string][]][] = [
        [markupOf(src), MARKUP_SHAPES],
        [scriptOf(src), SCRIPT_SHAPES],
      ]
      for (const [region, shapes] of regions) {
        for (const [shape, kind] of shapes) {
          for (const match of region.matchAll(shape)) {
            if (looksLikeProse(match[1])) {
              offenders.push(`${file} [${kind}] ${match[1].trim().slice(0, 70)}`)
            }
          }
        }
      }
      for (const match of markupOf(src).matchAll(LONE_LABEL)) {
        offenders.push(`${file} [lone label] ${match[1]}`)
      }
    }

    // The list is the message: a diff of two arrays gets truncated, and the
    // whole point of this test is naming the strings that need a slug.
    expect(offenders.length, `\n${offenders.join('\n')}\n`).toBe(0)
  })
})
