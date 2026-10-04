/**
 * Whether to explain how to add the app to the home screen.
 *
 * Only on iOS, and only in a browser tab. Android's browsers offer to install
 * from the manifest themselves; iOS never prompts, and "Share → Add to Home
 * Screen" is a path nobody finds unprompted. Once installed there is nothing
 * left to say.
 *
 * An iPad has reported itself as a Mac since iPadOS 13. A Mac with a touch
 * screen is the tell: no Mac has one.
 */
export function shouldOfferIosInstall(
  nav: Pick<Navigator, 'userAgent' | 'platform' | 'maxTouchPoints'> & { standalone?: boolean },
  standalone: boolean,
): boolean {
  if (standalone || nav.standalone === true) return false
  return /iPhone|iPad|iPod/.test(nav.userAgent) || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1)
}

/** The live answer, for the component. */
export function offerIosInstall(): boolean {
  return shouldOfferIosInstall(navigator, window.matchMedia?.('(display-mode: standalone)').matches ?? false)
}
