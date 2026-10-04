import { describe, test, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/svelte'
import userEvent from '@testing-library/user-event'
import { Bitmap } from 'qr'
import decodeQR from 'qr/decode.js'
import nginxConf from '../../../nginx.conf?raw'

const URL = 'otpauth://totp/nafin:anna%40example.ch?secret=JBSWY3DPEHPK3PXP&issuer=nafin'

vi.mock('./authStore.svelte', () => ({
  setup2FA: vi.fn(async () => ({ secret: 'JBSWY3DPEHPK3PXP', url: URL })),
  confirm2FA: vi.fn(),
}))

import TwoFactorSetup from './TwoFactorSetup.svelte'

/** Reads the drawn code back, the way a phone's camera would. */
function decodeSvg(svg: SVGSVGElement): string {
  const size = Number(svg.getAttribute('viewBox')!.split(' ')[2])
  const bits = Array.from({ length: size }, () => Array<boolean>(size).fill(false))
  for (const rect of svg.querySelectorAll('rect[fill="#000"]')) {
    bits[Number(rect.getAttribute('y'))][Number(rect.getAttribute('x'))] = true
  }
  const image = new Bitmap({ width: size, height: size }, bits).border(4, false).scale(4).toImage()
  return decodeQR(image)
}

/**
 * The two-factor seed is the one secret that, with the password, is the
 * account. It used to be drawn by a third-party service from an image URL,
 * which handed that service every user's seed. These hold it to the page.
 */
describe('the two-factor code is drawn here', () => {
  // No global setup file registers auto-cleanup, so the DOM is cleared by hand.
  afterEach(cleanup)

  async function scanStep() {
    render(TwoFactorSetup)
    await userEvent.click(screen.getByRole('button'))
    return screen.findByRole('img')
  }

  test('nothing on the scan step is loaded from elsewhere', async () => {
    await scanStep()
    const external = [...document.querySelectorAll('[src]')].filter(el =>
      /^https?:/.test(el.getAttribute('src')!),
    )
    expect(external).toEqual([])
  })

  test('the drawn code scans as the setup URL', async () => {
    const code = await scanStep()
    expect(decodeSvg(code as unknown as SVGSVGElement)).toBe(URL)
  })

  test('a screen reader is not read the secret', async () => {
    const code = await scanStep()
    expect(code.getAttribute('aria-label')).not.toContain('JBSWY3DPEHPK3PXP')
  })
})

/**
 * The second wall: even if a component fetched an image from elsewhere again,
 * the browser would refuse it. Every CSP in the config must allow images from
 * this origin and inline data only.
 */
describe('the content security policy', () => {
  const policies = [...nginxConf.matchAll(/Content-Security-Policy "([^"]+)"/g)].map(m => m[1])

  test('is set at all', () => {
    expect(policies.length).toBeGreaterThan(0)
  })

  test.each(policies)('names no other host: %s', policy => {
    expect(policy).not.toMatch(/https?:/)
  })
})
