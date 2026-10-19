/**
 * Bytes as the server stores them: base64, and a nonce in front of what it
 * protects.
 *
 * One copy. Base64 was written out five ways in this directory, three of them
 * as `btoa(String.fromCharCode(...bytes))` — which passes every byte as a
 * separate argument and throws somewhere past a hundred kilobytes, a limit set
 * by the engine rather than any standard: fine on a desktop, a stack overflow
 * on a phone. Chunked here, for every caller.
 */

const CHUNK = 0x8000

export function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

export function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

/**
 * Base64url without padding, the encoding WebAuthn speaks: every challenge,
 * credential id and signature crosses to the server in it.
 */
export function toBase64Url(bytes: Uint8Array | ArrayBuffer): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  return toBase64(view).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const plain = value.replace(/-/g, '+').replace(/_/g, '/')
  return fromBase64(plain + '='.repeat((4 - (plain.length % 4)) % 4))
}

/**
 * WebCrypto asks for a `BufferSource` whose buffer is definitely not shared,
 * and a `Uint8Array` sliced out of another one carries `ArrayBufferLike` — which
 * could be a `SharedArrayBuffer` as far as the types know. Copying out is a few
 * hundred bytes at these sizes and removes the question entirely, which beats a
 * cast that asserts something the compiler is right to doubt.
 */
export function ownBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(copy).set(bytes)
  return copy
}

/** A nonce followed by what it was used on, as one base64 string. */
export function withNonce(nonce: Uint8Array, payload: ArrayBuffer | Uint8Array): string {
  const body = payload instanceof Uint8Array ? payload : new Uint8Array(payload)
  const combined = new Uint8Array(nonce.length + body.length)
  combined.set(nonce, 0)
  combined.set(body, nonce.length)
  return toBase64(combined)
}

/** The other way: the nonce, and the rest. */
export function splitNonce(value: string, nonceLength: number): { nonce: Uint8Array<ArrayBuffer>; payload: Uint8Array<ArrayBuffer> } {
  const combined = fromBase64(value)
  return { nonce: combined.slice(0, nonceLength), payload: combined.slice(nonceLength) }
}
