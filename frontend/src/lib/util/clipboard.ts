/**
 * Copy text to the clipboard, reporting whether it worked.
 *
 * `navigator.clipboard` only exists in a secure context. A self-hosted app
 * reached over plain http on a LAN is not one, so the modern API is genuinely
 * absent for a good share of this app's users rather than being a theoretical
 * edge case. It can also reject when the document is not focused, or when the
 * permission is denied.
 *
 * Every one of those falls back to `document.execCommand('copy')`, which is
 * deprecated but works without a secure context. Callers get a boolean so they
 * can say "copied" or "copy it yourself" rather than claiming success blindly.
 */
export async function copyText(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // Fall through — the legacy path may still succeed.
    }
  }
  return legacyCopy(text)
}

function legacyCopy(text: string): boolean {
  const field = document.createElement('textarea')
  field.value = text
  field.setAttribute('readonly', '')
  // Off-screen but not display:none — the selection has to be real for the copy
  // to work. `fixed` keeps it from moving the scroll position.
  field.style.position = 'fixed'
  field.style.top = '0'
  field.style.left = '-9999px'
  document.body.appendChild(field)

  // Whatever the user had selected is restored afterwards; copying should not
  // silently steal their selection.
  const selection = document.getSelection()
  const previous = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null

  field.select()
  // iOS Safari ignores select() on a readonly field; this is the form it honours.
  field.setSelectionRange(0, text.length)

  let copied = false
  try {
    copied = document.execCommand('copy')
  } catch {
    copied = false
  }

  document.body.removeChild(field)
  if (selection && previous) {
    selection.removeAllRanges()
    selection.addRange(previous)
  }

  return copied
}
