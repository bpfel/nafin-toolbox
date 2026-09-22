import { render, screen, waitFor, cleanup } from '@testing-library/svelte'
import { describe, test, expect, afterEach, vi } from 'vitest'
import { setLocale, resetLocale } from '../i18n/index.svelte'
import { createEmptyVault } from '../crypto/vault'

vi.mock('../api/client', () => ({
  fetchVaultKeys: vi.fn(), setupVaultKeys: vi.fn(), updateVaultKeys: vi.fn(),
  fetchVault: vi.fn(), putVault: vi.fn(async () => ({ updated_at: 'x' })),
  recoverVaultKeys: vi.fn(), VaultConflictError: class extends Error {},
}))

import { getVaultState } from '../crypto/vaultStore.svelte'
import KnowledgeScreen from '../../screens/KnowledgeScreen.svelte'

afterEach(() => { cleanup(); resetLocale() })

/**
 * That the screen actually reaches the translated content, rather than only
 * that `loadContent` can.
 *
 * Written to reproduce a report that the library stayed English on a German
 * interface. It did not reproduce — which is itself the useful answer, since
 * it puts the fault in the deployed bundle rather than in this wiring, and
 * leaves a test here that would catch the wiring breaking later.
 */
describe('the library follows the chosen language', () => {
  test('German shows German article titles', async () => {
    getVaultState().vault = createEmptyVault()
    setLocale('de')

    render(KnowledgeScreen)

    await waitFor(() => expect(screen.getByText('Säule 3a')).toBeTruthy())
  })
})
