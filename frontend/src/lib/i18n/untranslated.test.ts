import { describe, test, expect } from 'vitest'

/**
 * Finds English left behind in components.
 *
 * Rewritten after five rounds of "this bit is still in English", each one a
 * shape the previous scan had not thought of: text wrapped across lines,
 * strings in object literals, both arms of a ternary, a status message starting
 * with a digit, a sentence passed as a component prop, a lone word inside an
 * expression, and prose interleaved with `{expressions}` on one line.
 *
 * The lesson each time was the same — a scan only finds the shapes it knows
 * about — so it lives here rather than in my head. When it misses something,
 * widen it here and the next component gets checked for free.
 */

/**
 * What this cannot see: values the server supplies. `{user.role}` rendered a
 * raw "user" for months and no pattern here could ever have caught it, because
 * there is no literal to find — the English lives in the API's enum. Any closed
 * set of server values shown to a user needs a slug per value, and only a person
 * noticing will tell you it is missing.
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

/** The markup half: everything outside `<script>` and `<style>`. */
function markupOf(src: string): string {
  return src
    .replace(/<script[\s\S]*?<\/script>/g, '')
    .replace(/<style[\s\S]*?<\/style>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
}

function scriptOf(src: string): string {
  return (src.match(/<script[\s\S]*?<\/script>/g) ?? [])
    .join('\n')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
}

/**
 * Markup with every `{expression}` blanked out, innermost first so nested
 * braces clear too.
 *
 * Without this, a line reading `Income {money(a)} − expenses {money(b)}.` is
 * invisible: it is prose, but no pattern that forbids braces will match it and
 * no pattern that allows them can tell prose from code. Blanking the code first
 * leaves plain text behind, which is easy to recognise.
 */
function withoutExpressions(markup: string): string {
  let out = ''
  let cursor = 0
  for (const [start, end] of expressionSpans(markup)) {
    out += markup.slice(cursor, start)
    cursor = end
  }
  return out + markup.slice(cursor)
}

/**
 * The bounds of every top-level `{...}` in the markup, matched by counting
 * depth rather than by regex.
 *
 * A regex cannot do this: `{n === 1 ? 'month' : `${n} months`}` contains braces
 * inside a template literal, so any `[^{}]*` pattern stops early and the rest of
 * the expression — where the English usually is — never gets scanned.
 */
function expressionSpans(markup: string): [number, number][] {
  const spans: [number, number][] = []
  for (let i = 0; i < markup.length; i++) {
    if (markup[i] !== '{') continue
    let depth = 0
    for (let j = i; j < markup.length; j++) {
      if (markup[j] === '{') depth++
      else if (markup[j] === '}' && --depth === 0) {
        spans.push([i, j + 1])
        i = j
        break
      }
    }
  }
  return spans
}

/** Every `{expression}` in the markup, with key comparisons dropped. */
function expressionsOf(markup: string): string {
  return expressionSpans(markup)
    .map(([start, end]) => markup.slice(start, end))
    .join('\n')
    // `e.key === 'Enter'` is a keyboard event, not a button that says Enter.
    .replace(/\.key\s*[!=]==?\s*'[A-Za-z]+'/g, '')
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

/**
 * Blanks the `${...}` holes in a template literal, leaving only the words the
 * translator would see. Without this a date format like `${y}-${m}` reads as
 * prose, because the code inside the holes has spaces in it.
 */
function stripHoles(s: string): string {
  let previous: string
  let out = s
  do {
    previous = out
    out = out.replace(/\$\{[^{}]*\}/g, '')
  } while (out !== previous)
  return out
}

function looksLikeProse(s: string): boolean {
  const text = s.trim()
  if (text.length < 4) return false
  if (NOT_PROSE.some(rx => rx.test(text))) return false
  // Prose either contains a space or ends in sentence punctuation.
  return /\s/.test(text) || /[.?!]$/.test(text)
}

/** Prose, once the code around it has been cleared away. */
const TEXT_SHAPES: [RegExp, string][] = [
  [/>([A-Za-z0-9][^<>\n]{3,})</g, 'text between tags'],
  [/^[ \t]*([A-Za-z0-9][^<>\n=]{3,})$/gm, 'text on its own line'],
]

/** Prose that never reaches a text node. */
const ATTRIBUTE_SHAPES: [RegExp, string][] = [
  [/(?:aria-label|title|placeholder|alt)="([A-Za-z0-9][^"]{3,})"/g, 'attribute'],
  // Any attribute holding a whole sentence — which is how a `message="..."`
  // prop passed to a child component stayed English past the allowlist above.
  // Terminal punctuation is the tell; class names and paths have none.
  [/\w+="([A-Z][^"]*[.?!])"/g, 'sentence in an attribute'],
]

/** Prose that only exists as a string inside an expression. */
const EXPRESSION_SHAPES: [RegExp, string][] = [
  [/'([A-Za-z0-9][^']{3,})'/g, 'string in an expression'],
  // Template literals, where a sentence gets assembled around its values.
  // `${...}` holes leave no space of their own, so a one-word template still
  // reads as an identifier and is correctly ignored.
  [/`([A-Za-z0-9$][^`]{3,})`/g, 'template string'],
]

/** Where a literal can hide in the script: values that end up rendered. */
const SCRIPT_SHAPES: [RegExp, string][] = [
  [/(?:description|label|message|title|placeholder|error)\s*:\s*'([A-Za-z0-9][^']{3,})'/g, 'object literal'],
  [/=\s*'([A-Za-z0-9][^']{3,})'/g, 'assigned string'],
  [/=\s*`([A-Za-z0-9$][^`]{3,})`/g, 'assigned template string'],
]

/**
 * Single capitalised words, which fail the prose test by definition: one word
 * with no space and no full stop is indistinguishable from an identifier by
 * wording alone. Position does the work instead — a word standing as an
 * element's whole content, or quoted inside a markup expression, is a label.
 * This is how a stray `Delete` button and an `{editing ? 'Done' : 'Edit'}`
 * toggle both survived every earlier scan.
 */
const LONE_LABEL = /\b([A-Z][a-z]{1,14})\b/
const LONE_SHAPES: [(m: string) => string, RegExp, string][] = [
  [markupOf, />\s*([A-Z][a-z]{2,14})\s*</g, 'lone label'],
  [m => expressionsOf(markupOf(m)), /'([A-Z][a-z]{1,14})'/g, 'lone word in an expression'],
]

describe('no English left in the interface', () => {
  test('every component takes its text from the catalogue', () => {
    const offenders: string[] = []

    for (const [file, src] of scannable()) {
      const markup = markupOf(src)
      const passes: [string, [RegExp, string][]][] = [
        [withoutExpressions(markup), TEXT_SHAPES],
        [markup, ATTRIBUTE_SHAPES],
        [expressionsOf(markup), EXPRESSION_SHAPES],
        [scriptOf(src), SCRIPT_SHAPES],
      ]
      for (const [region, shapes] of passes) {
        for (const [shape, kind] of shapes) {
          for (const match of region.matchAll(shape)) {
            const text = stripHoles(match[1])
            if (looksLikeProse(text)) {
              offenders.push(`${file} [${kind}] ${text.trim().slice(0, 70)}`)
            }
          }
        }
      }
      for (const [region, shape, kind] of LONE_SHAPES) {
        for (const match of region(src).matchAll(shape)) {
          if (LONE_LABEL.test(match[1])) {
            offenders.push(`${file} [${kind}] ${match[1]}`)
          }
        }
      }
    }

    // The list is the message: a diff of two arrays gets truncated, and the
    // whole point of this test is naming the strings that need a slug.
    expect(offenders.length, `\n${offenders.join('\n')}\n`).toBe(0)
  })
})
