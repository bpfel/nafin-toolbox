import { en, type MessageKey, type Messages } from './locales/en'
import { de } from './locales/de'
import { rm } from './locales/rm'

/**
 * Locales the app can actually show, in the order a picker should list them.
 *
 * Swiss national languages first in their constitutional order, English last.
 * `rm` is Rumantsch — `ru` is Russian, and using it here would mislabel the
 * content for browsers, screen readers and `Intl` alike.
 *
 * This is the intended set, not the shippable one: a locale listed here without
 * a catalogue simply cannot be selected. AVAILABLE_LOCALES is what a picker
 * reads.
 */
export const LOCALES = ['de', 'fr', 'it', 'rm', 'en'] as const
export type Locale = (typeof LOCALES)[number]

/**
 * A catalogue may be partial. The completeness contract lives on each file — a
 * locale typed `Messages` cannot compile with a slug missing, one typed
 * `Partial<Messages>` is allowed gaps and gets English in their place.
 */
const CATALOGUES: Partial<Record<Locale, Partial<Messages>>> = { en, de, rm }

/** Locales with a catalogue today. The picker offers these; the rest are pending. */
export const AVAILABLE_LOCALES = LOCALES.filter(l => CATALOGUES[l] !== undefined)

/**
 * Locales still filling in, where English shows through the gaps.
 *
 * Named in the picker rather than hidden: someone who can read the language is
 * exactly the person who can tell us what is wrong with it.
 */
export const PROVISIONAL_LOCALES: readonly Locale[] = ['rm']

export function isProvisional(locale: Locale): boolean {
  return PROVISIONAL_LOCALES.includes(locale)
}

const STORAGE_KEY = 'nafin.locale'
const FALLBACK: Locale = 'en'

function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value)
}

/**
 * The stored choice, if there is one.
 *
 * localStorage is not merely empty in some browsers — Safari in private mode and
 * a blocked-cookies setting both throw on access. Losing the preference is the
 * right failure: the app falls back to detection and still renders.
 */
function stored(): Locale | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw && isLocale(raw) && CATALOGUES[raw] ? raw : null
  } catch {
    return null
  }
}

/**
 * What the browser asks for, narrowed to something we have.
 *
 * `navigator.languages` gives tags like `de-CH`, so the region is dropped before
 * matching — a Swiss German browser and a German one both want `de`.
 */
function detected(): Locale {
  const asked = typeof navigator === 'undefined' ? [] : (navigator.languages ?? [navigator.language])
  for (const tag of asked) {
    const base = tag.toLowerCase().split('-')[0]
    if (isLocale(base) && CATALOGUES[base]) return base
  }
  return FALLBACK
}

let current = $state<Locale>(stored() ?? detected())

/** Keeps `<html lang>` truthful, which assistive tech and `Intl` both read. */
function reflectToDocument(locale: Locale): void {
  if (typeof document !== 'undefined') {
    document.documentElement.lang = locale
  }
}

reflectToDocument(current)

export function getLocale(): Locale {
  return current
}

export function setLocale(locale: Locale): void {
  if (!CATALOGUES[locale]) return
  current = locale
  reflectToDocument(locale)
  try {
    localStorage.setItem(STORAGE_KEY, locale)
  } catch {
    // Same bargain as reading: the choice holds for this tab either way.
  }
}

function lookup(key: MessageKey): string {
  const catalogue = CATALOGUES[current]
  // English is the backstop. A key can only be missing here if something
  // reached `t` past the type system, so falling back beats rendering a slug.
  return catalogue?.[key] ?? en[key] ?? key
}

function fill(template: string, params?: Record<string, string | number>): string {
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in params ? String(params[name]) : whole,
  )
}

/** A translated string, with `{placeholders}` filled in. */
export function t(key: MessageKey, params?: Record<string, string | number>): string {
  return fill(lookup(key), params)
}

/**
 * A translated string that varies by count, reading `<key>.one` or `<key>.other`.
 *
 * Deliberately the two-form split the five target languages share, rather than
 * full CLDR plural categories: German, French, Italian, Rumantsch and English
 * all distinguish one from not-one and nothing finer. `{count}` is filled in for
 * free, since a counted string almost always shows the number.
 */
export function tn(
  key: string,
  count: number,
  params?: Record<string, string | number>,
): string {
  const form = `${key}.${count === 1 ? 'one' : 'other'}` as MessageKey
  return fill(lookup(form), { count, ...params })
}

/**
 * A translated sentence split around one placeholder, so the caller can render
 * that slot as an element — bold on the thing about to be deleted, say.
 *
 * The alternative is splitting the sentence in the source and concatenating
 * fragments, which puts English word order into the markup: a language that
 * needs the name first, or last, or inflected can then no longer be translated
 * into. Here the translator still writes one whole sentence with a slot in it,
 * and only the rendering is split.
 *
 * Returns the text before and after the slot. Everything else is filled in
 * first, so other placeholders behave normally.
 */
const SLOT = '\u0000'

export function tAround(
  key: MessageKey,
  slot: string,
  params?: Record<string, string | number>,
): [string, string] {
  const filled = fill(lookup(key), { ...params, [slot]: SLOT })
  const [before, after = ''] = filled.split(SLOT)
  return [before, after]
}

/** Test seam: forget the stored choice and re-detect. */
export function resetLocale(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Nothing stored means nothing to forget.
  }
  current = detected()
  reflectToDocument(current)
}
