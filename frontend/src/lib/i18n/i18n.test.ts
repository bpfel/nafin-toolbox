import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest'
import { en } from './locales/en'
import { de } from './locales/de'
import { rm } from './locales/rm'

/**
 * The slug these tests reach for whenever they need "some entry in the
 * catalogue", named once instead of typed into five assertions.
 *
 * They also compare against the catalogues rather than against literal copy.
 * What is under test is the machinery — that `t` picks the catalogue for the
 * active locale, falls back where a partial one is missing an entry, survives a
 * storage that throws — and none of that has an opinion about the words. Spelt
 * out as literals, a copy edit failed five tests that were not about copy.
 *
 * This sat on `menu.security` until the profile screen stopped rendering it. At
 * that point nothing in the app used the slug and only this file kept it alive:
 * a suite holding a product string in place so its own fixtures would not move.
 * `menu.logout` is about as permanent as a slug gets — it labels the sign-out
 * control — but the test below checks the properties relied on here rather than
 * trusting that, so the day it stops qualifying, one named test fails instead of
 * five confusing ones.
 */
const ANY_SLUG = 'menu.logout'

type I18n = typeof import('./index.svelte')

// The module reads the stored choice and the browser's languages once, at
// import. Each test that cares about either has to load it fresh.
async function load(): Promise<I18n> {
  vi.resetModules()
  return await import('./index.svelte')
}

function pretendBrowserWants(...tags: string[]) {
  Object.defineProperty(navigator, 'languages', { value: tags, configurable: true })
}

beforeEach(() => {
  localStorage.clear()
  pretendBrowserWants('en')
})

afterEach(() => {
  localStorage.clear()
})

describe('the fixture the rest of these tests lean on', () => {
  // Four properties, each relied on by a test below. Asserted here so that a
  // slug which stops qualifying fails once, by name, rather than scattering
  // failures across the file with no hint at the cause.
  test('is in every catalogue these tests read, carries no placeholder, and differs by locale', () => {
    expect(en[ANY_SLUG], `${ANY_SLUG} is missing from en`).toBeTruthy()
    expect(de[ANY_SLUG], `${ANY_SLUG} is missing from de`).toBeTruthy()
    // Rumantsch is deliberately partial; this slug has to be one it has, or the
    // "shows what it has" test would be testing the fallback instead.
    expect(rm[ANY_SLUG], `${ANY_SLUG} is missing from rm`).toBeTruthy()

    expect(en[ANY_SLUG]).not.toContain('{')
    expect(de[ANY_SLUG]).not.toBe(en[ANY_SLUG])
  })
})

describe('the locale list', () => {
  test('Rumantsch is rm — ru is Russian', async () => {
    const { LOCALES } = await load()

    expect(LOCALES).toContain('rm')
    expect(LOCALES).not.toContain('ru')
  })

  test('offers only locales that actually have a catalogue', async () => {
    const { AVAILABLE_LOCALES, LOCALES } = await load()

    expect(AVAILABLE_LOCALES).toEqual(['de', 'fr', 'it', 'rm', 'en'])
    // All five ship today. The picker still reads AVAILABLE_LOCALES rather than
    // LOCALES, so a sixth added without a catalogue cannot be selected into a
    // blank interface.
    expect(AVAILABLE_LOCALES.length).toBe(LOCALES.length)
  })
})

describe('translating', () => {
  test('returns the string for the active locale', async () => {
    const { t, setLocale } = await load()

    expect(t(ANY_SLUG)).toBe(en[ANY_SLUG])
    setLocale('de')
    expect(t(ANY_SLUG)).toBe(de[ANY_SLUG])
  })

  test('fills placeholders', async () => {
    const { t } = await load()

    expect(t('entries.count.other', { count: 4 })).toBe('4 entries')
  })

  test('leaves a placeholder alone when nothing was passed for it', async () => {
    const { t } = await load()

    // Better a visible {count} than the word silently vanishing.
    expect(t('entries.count.other')).toBe('{count} entries')
  })

  test('picks the form by count, and fills the number in', async () => {
    const { tn, setLocale } = await load()

    expect(tn('entries.count', 1)).toBe('1 entry')
    expect(tn('entries.count', 0)).toBe('0 entries')
    expect(tn('entries.count', 7)).toBe('7 entries')

    setLocale('de')
    expect(tn('entries.count', 1)).toBe('1 Eintrag')
    expect(tn('entries.count', 3)).toBe('3 Einträge')
  })

  test('language names stay in their own language', async () => {
    const { t, setLocale } = await load()

    // Someone hunting for their language cannot read the interface yet.
    setLocale('de')
    expect(t('language.en')).toBe('English')
    expect(t('language.rm')).toBe('Rumantsch')
  })
})

describe('choosing a locale', () => {
  test('follows the browser when nothing is stored', async () => {
    pretendBrowserWants('de-CH', 'de', 'en')
    const { getLocale } = await load()

    // Region dropped: a Swiss German browser and a German one want the same file.
    expect(getLocale()).toBe('de')
  })

  test('falls back to English when the browser asks for something we lack', async () => {
    pretendBrowserWants('ja', 'ko')
    const { getLocale } = await load()

    expect(getLocale()).toBe('en')
  })

  test('takes the first language the browser asks for that we ship', async () => {
    pretendBrowserWants('fr-CH', 'de')
    const { getLocale } = await load()

    expect(getLocale()).toBe('fr')
  })

  test('a stored choice beats the browser', async () => {
    localStorage.setItem('nafin.locale', 'de')
    pretendBrowserWants('en')
    const { getLocale } = await load()

    expect(getLocale()).toBe('de')
  })

  test('remembers a choice across a reload', async () => {
    const first = await load()
    first.setLocale('de')

    const second = await load()
    expect(second.getLocale()).toBe('de')
  })

  test('ignores stored junk', async () => {
    localStorage.setItem('nafin.locale', 'klingon')
    const { getLocale } = await load()

    expect(getLocale()).toBe('en')
  })

  test('every declared locale is now shippable', async () => {
    const { LOCALES, AVAILABLE_LOCALES } = await load()

    // The guard stays meaningful: adding a locale to LOCALES without a
    // catalogue must still leave it unselectable.
    expect([...AVAILABLE_LOCALES].sort()).toEqual([...LOCALES].sort())
  })
})

describe('the document', () => {
  test('lang follows the locale', async () => {
    const { setLocale } = await load()

    setLocale('de')
    expect(document.documentElement.lang).toBe('de')
  })
})

describe('when localStorage throws', () => {
  // Safari in private browsing and a blocked-cookies setting both raise on
  // access rather than returning null.
  test('reading a hostile store still leaves a working app', async () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied')
    })

    const { getLocale, t } = await load()

    expect(getLocale()).toBe('en')
    expect(t(ANY_SLUG)).toBe(en[ANY_SLUG])
    spy.mockRestore()
  })

  test('writing to a hostile store still switches the language', async () => {
    const { setLocale, getLocale } = await load()
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied')
    })

    setLocale('de')

    // The choice holds for this tab; only its persistence is lost.
    expect(getLocale()).toBe('de')
    spy.mockRestore()
  })
})

describe('a partial locale', () => {
  test('is selectable, and shows what it has', async () => {
    const { setLocale, getLocale, t } = await load()

    setLocale('rm')

    expect(getLocale()).toBe('rm')
    expect(t(ANY_SLUG)).toBe(rm[ANY_SLUG])
    expect(t('action.save')).toBe(rm['action.save'])
  })

  // The alternative is a blank or a raw slug, either of which makes the app
  // unusable in the language we are trying to support.
  test('falls back to English in place for what it lacks', async () => {
    const { setLocale, t, tn } = await load()

    setLocale('rm')

    // Chosen from what the catalogue lacks rather than named. The two slugs
    // this used to name were translated in a later pass, and the test then
    // failed for asserting a fact about a list rather than about fallback.
    const { en } = await import('./locales/en')
    const missing = (Object.keys(en) as (keyof typeof en)[]).filter(k => rm[k] === undefined)
    expect(missing.length, 'Rumantsch is complete; this test needs another partial locale').toBeGreaterThan(0)
    for (const key of missing.slice(0, 5)) {
      if (en[key].includes('{')) continue
      expect(t(key)).toBe(en[key])
    }
    expect(tn('entries.count', 2)).toBe('2 entries')
  })

  test('is named as provisional, so a speaker knows to look', async () => {
    const { isProvisional } = await load()

    expect(isProvisional('rm')).toBe(true)
    expect(isProvisional('de')).toBe(false)
  })
})

describe('splitting a sentence around a slot', () => {
  // So the emphasised word can be an element without the sentence being
  // assembled from fragments in the markup.
  test('gives the text either side of the placeholder', async () => {
    const { tAround } = await load()

    const [before, after] = tAround('snapshot.deleteOne', 'name')

    expect(before).toBe('Delete snapshot ')
    expect(after).toBe('')
  })

  test('fills the other placeholders as usual', async () => {
    const { tAround } = await load()

    const [before, after] = tAround('snapshot.deleteExplain.one', 'name', { count: 3 })

    expect(before).toBe('Delete ')
    expect(after).toBe(' and its 3 line?')
  })

  test('a sentence without that placeholder comes back whole', async () => {
    const { tAround } = await load()

    const [before, after] = tAround(ANY_SLUG, 'name')

    expect(before).toBe(en[ANY_SLUG])
    expect(after).toBe('')
  })
})
