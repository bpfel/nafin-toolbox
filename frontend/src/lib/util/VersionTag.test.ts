import { render, screen, cleanup } from '@testing-library/svelte'
import { describe, test, expect, afterEach } from 'vitest'

import VersionTag from './VersionTag.svelte'

afterEach(cleanup)

describe('the version tag', () => {
  // Both are stamped in by vite's `define`, so a build that forgot to would
  // render the literal identifier rather than a value.
  test('shows a real version and build id, not the placeholders', () => {
    render(VersionTag)

    const text = screen.getByText(/^nafin/).textContent ?? ''

    expect(text).not.toContain('__APP_VERSION__')
    expect(text).not.toContain('__BUILD_ID__')
    expect(text).toMatch(/nafin\s+v\d+\.\d+\.\d+/)
    expect(text).toMatch(/build\s+\S+/)
  })

  test('is selectable, so it can be pasted into a bug report', () => {
    const { container } = render(VersionTag)

    const style = container.querySelector('.version')?.getAttribute('class') ?? ''
    expect(style).toContain('version')
  })
})
