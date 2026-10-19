import { fromBase64Url, toBase64Url } from '../crypto/bytes'

/**
 * The browser's half of a passkey ceremony.
 *
 * The server sends options as JSON, with every binary value in base64url; the
 * browser wants bytes. The answer goes back the other way. That translation is
 * all this file does, plus one thing the server must never see: the PRF
 * secret, which is taken out of the answer here and handed to the caller
 * instead. The server learns whether a passkey supports PRF, never what it
 * produced.
 *
 * Written out rather than left to `PublicKeyCredential.parseCreationOptionsFromJSON`
 * and `toJSON()`: those are recent, and `toJSON()` would put the secret into
 * the JSON we send.
 */

type Json = Record<string, any>

/** What a ceremony produced: the answer for the server, the secret for us. */
export interface PasskeyAnswer {
  credential: Json
  /** The PRF secret, if the passkey gave one. Never sent anywhere. */
  secret: Uint8Array | null
}

/** Whether this browser can make and use passkeys at all. */
export function passkeysSupported(): boolean {
  return typeof window !== 'undefined'
    && typeof window.PublicKeyCredential === 'function'
    && !!navigator.credentials
}

/** Whether the browser can offer passkeys in the email field's autofill. */
export async function autofillSupported(): Promise<boolean> {
  if (!passkeysSupported()) return false
  const check = (PublicKeyCredential as any).isConditionalMediationAvailable
  return typeof check === 'function' ? !!(await check.call(PublicKeyCredential)) : false
}

function bytes(value: string): ArrayBuffer {
  return fromBase64Url(value).buffer
}

function descriptors(list: Json[] | undefined): PublicKeyCredentialDescriptor[] | undefined {
  return list?.map(d => ({ ...d, id: bytes(d.id) }) as PublicKeyCredentialDescriptor)
}

function extensions(ext: Json | undefined): AuthenticationExtensionsClientInputs | undefined {
  if (!ext) return undefined
  const out: Json = { ...ext }
  if (ext.prf?.eval?.first) {
    out.prf = { eval: { first: bytes(ext.prf.eval.first) } }
  }
  return out
}

function creationOptions(options: Json): PublicKeyCredentialCreationOptions {
  const pk = options.publicKey
  return {
    ...pk,
    challenge: bytes(pk.challenge),
    user: { ...pk.user, id: bytes(pk.user.id) },
    excludeCredentials: descriptors(pk.excludeCredentials),
    extensions: extensions(pk.extensions),
  }
}

function requestOptions(options: Json): PublicKeyCredentialRequestOptions {
  const pk = options.publicKey
  return {
    ...pk,
    challenge: bytes(pk.challenge),
    allowCredentials: descriptors(pk.allowCredentials),
    extensions: extensions(pk.extensions),
  }
}

function answer(cred: PublicKeyCredential): PasskeyAnswer {
  const r = cred.response as any
  const response: Json = { clientDataJSON: toBase64Url(r.clientDataJSON) }
  if (r.attestationObject) {
    response.attestationObject = toBase64Url(r.attestationObject)
    response.transports = typeof r.getTransports === 'function' ? r.getTransports() : []
  } else {
    response.authenticatorData = toBase64Url(r.authenticatorData)
    response.signature = toBase64Url(r.signature)
    if (r.userHandle) response.userHandle = toBase64Url(r.userHandle)
  }

  const ext = cred.getClientExtensionResults() as Json
  const results: Json = {}
  if (ext.credProps) results.credProps = ext.credProps
  // Whether PRF is there, without what it produced.
  if (ext.prf) results.prf = ext.prf.enabled === undefined ? {} : { enabled: ext.prf.enabled }
  const first = ext.prf?.results?.first

  return {
    credential: {
      id: cred.id,
      rawId: toBase64Url(cred.rawId),
      type: cred.type,
      authenticatorAttachment: cred.authenticatorAttachment ?? undefined,
      response,
      clientExtensionResults: results,
    },
    secret: first ? new Uint8Array(first instanceof ArrayBuffer ? first : first.buffer) : null,
  }
}

/**
 * Cancelling the prompt, and having no passkey for this site, both arrive as
 * NotAllowedError — the browser will not say which, so nobody can probe for
 * accounts. Either way it is not an error to show; null.
 */
function declined(e: unknown): boolean {
  return e instanceof DOMException && (e.name === 'NotAllowedError' || e.name === 'AbortError')
}

/** Make a passkey. null if the person cancelled. */
export async function createPasskey(options: Json): Promise<PasskeyAnswer | null> {
  try {
    const cred = await navigator.credentials.create({ publicKey: creationOptions(options) })
    return cred ? answer(cred as PublicKeyCredential) : null
  } catch (e) {
    if (declined(e)) return null
    throw e
  }
}

/**
 * Use a passkey. null if the person cancelled or had none.
 *
 * With `signal` and `conditional`, it waits in the email field's autofill
 * instead of opening a prompt, until a passkey is picked there or the signal
 * aborts it.
 */
export async function usePasskey(
  options: Json,
  { signal, conditional = false }: { signal?: AbortSignal; conditional?: boolean } = {},
): Promise<PasskeyAnswer | null> {
  try {
    const cred = await navigator.credentials.get({
      publicKey: requestOptions(options),
      signal,
      ...(conditional ? { mediation: 'conditional' as CredentialMediationRequirement } : {}),
    })
    return cred ? answer(cred as PublicKeyCredential) : null
  } catch (e) {
    if (declined(e)) return null
    throw e
  }
}
