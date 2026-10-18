import { sealUnder, openUnder, type OpenIdentity } from './identity'
import { fromBase64, ownBuffer, toBase64 } from './bytes'
import { openGrant, claimedSender, fingerprintOf, GrantError } from './grant'
import type { VaultTrust } from './vault'

/**
 * The key to a household, and the two small things sealed under it.
 *
 * A household vault is an ordinary vault — same `VaultData`, same
 * `encryptVault`/`decryptVault`, which take any AES-GCM key and so need nothing
 * added for this. What is particular to a household is only:
 *
 * - **its key exists in copies**, one per member, each wrapped so that only that
 *   member can unwrap it; and
 * - **its name is a ciphertext**, because the switch must list every household
 *   somebody belongs to without opening any of them.
 *
 * Both live here. Everything else a household does is what a vault already did.
 *
 * @see plans/shared-vault-plan.md
 */

const AES_ALGO = 'AES-GCM'
const KEY_LENGTH = 256

/** A household's key. The same kind of key a MEK is, for the same reasons. */
export async function generateHouseholdKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(
    { name: AES_ALGO, length: KEY_LENGTH },
    true, // extractable: the whole point is to wrap it for people
    ['encrypt', 'decrypt'],
  )
}

/**
 * Seal a household key for the person who made it — under their own MEK.
 *
 * Symmetric on purpose, and this is the one decision in the file worth
 * defending. The obvious alternative is to wrap it to their own public key, the
 * way it will be wrapped for everybody else, so that one code path serves all
 * members. Bitwarden does exactly that, and it is what attack BW09 in
 * *Zero Knowledge (About) Encryption* (USENIX Security '26) turns on: a server
 * can substitute its own wrapped key, the client cannot tell, and the paper
 * calls the result "entirely undetectable".
 *
 * Nobody needs public-key encryption to send something to themselves. Sealing
 * under the MEK means the server has nothing to substitute — a swapped blob
 * simply fails to open, because only this user's MEK ever could have made it.
 *
 * The other copies are a different matter, and are signed as well as encrypted
 * so a recipient can tell who granted them. That belongs with invitations.
 */
export async function sealKeyForSelf(householdKey: CryptoKey, mek: CryptoKey): Promise<string> {
  const raw = await crypto.subtle.exportKey('raw', householdKey)
  return sealUnder(new Uint8Array(raw), mek)
}

export async function openKeyFromSelf(wrapped: string, mek: CryptoKey): Promise<CryptoKey> {
  const raw = await openUnder(wrapped, mek)
  return crypto.subtle.importKey('raw', ownBuffer(raw), { name: AES_ALGO, length: KEY_LENGTH }, true, [
    'encrypt',
    'decrypt',
  ])
}

/**
 * The household's name, sealed under its own key.
 *
 * Its own small ciphertext rather than a column the server can read, because
 * "Flat with Anna" is the household telling the server who its members are to
 * each other. And not inside the vault payload either: the switch lists every
 * household somebody belongs to, and reading names out of payloads would mean
 * fetching and decrypting all of them to draw a menu.
 */
export async function sealName(name: string, householdKey: CryptoKey): Promise<string> {
  return sealUnder(new TextEncoder().encode(name), householdKey)
}

export async function openName(sealed: string, householdKey: CryptoKey): Promise<string> {
  return new TextDecoder().decode(await openUnder(sealed, householdKey))
}

/**
 * The initials the dial shows inside the house mark.
 *
 * Derived rather than stored, so it can never disagree with the name, and
 * derived on the client because the name only exists there.
 *
 * Two letters at most, from the first two words — "Flat with Anna" gives FW,
 * "Zuhause" gives ZU. A single word falls back to its first two characters
 * rather than one, because one letter in a house is hard to tell from a mark
 * with nothing in it.
 *
 * Deliberately not `.toUpperCase()` on a slice of code units: `Array.from`
 * walks characters, so a name beginning with an emoji or any astral character
 * yields that character rather than half of a surrogate pair.
 */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return ''

  const letters =
    words.length === 1
      ? Array.from(words[0]).slice(0, 2)
      : [Array.from(words[0])[0], Array.from(words[1])[0]]

  return letters.join('').toLocaleUpperCase()
}

/** A household as the app holds it: what the server said, plus what it means. */
export interface OpenHousehold {
  id: number
  name: string
  key: CryptoKey
  /** owner | writer | reader — what this member may do, per the server. */
  role: string
  updatedAt: string
}

/**
 * Turn what the server listed into something with a readable name.
 *
 * Only `wrap_kind: 'self'` — a copy somebody else wrapped has to be checked
 * against their key first, which needs the household's member list, so it goes
 * through `openGrantedKey` instead. An unknown kind is skipped rather than
 * guessed at.
 */
export async function openListedHousehold(
  listed: { id: number; encrypted_name: string; wrapped_key: string; wrap_kind: string; role: string; updated_at: string },
  mek: CryptoKey,
): Promise<OpenHousehold | null> {
  if (listed.wrap_kind !== 'self') return null

  const key = await openKeyFromSelf(listed.wrapped_key, mek)
  return {
    id: listed.id,
    name: await openName(listed.encrypted_name, key),
    key,
    role: listed.role,
    updatedAt: listed.updated_at,
  }
}

// Re-exported so callers working with households do not have to know that the
// base64 helpers happen to live next door in `identity`.
export { toBase64, fromBase64 }

/**
 * Open a household key somebody else wrapped for you.
 *
 * Everything that makes this safe is a *choice about which key to check
 * against*, so it is all here rather than scattered over the caller:
 *
 * 1. The grant says whose signature it carries. That is a claim, so it is used
 *    only to pick which member to check it against.
 * 2. If that member's verifying key has been seen before, it must be the same
 *    one. The server serves public keys unsigned and is the directory; a key
 *    that silently changes is a substitution, not an update.
 * 3. The signature is checked against that key, and the household id, both
 *    identities and the epoch are bound inside what it covers.
 * 4. A grant older than one already accepted is refused, so a compromised
 *    server cannot roll somebody back onto a key that was rotated away.
 *
 * Returns the key and what should now be remembered. Deliberately does not
 * write to the trust record itself: deciding and recording are different acts,
 * and the caller is the one holding a vault it can save.
 */
export async function openGrantedKey(params: {
  grant: string
  householdId: number
  members: { user_id: number; verifying_key: string }[]
  trust: VaultTrust
  identity: OpenIdentity
}): Promise<{ key: CryptoKey; epoch: number; pin: { userId: number; verifyingKey: string } }> {
  const sender = claimedSender(params.grant)
  if (!sender) throw new GrantError('malformed')

  // Which member's key hashes to the fingerprint the grant names.
  let granter: { user_id: number; verifying_key: string } | null = null
  for (const member of params.members) {
    if (!member.verifying_key) continue
    const fingerprint = toBase64(await fingerprintOf(fromBase64(member.verifying_key)))
    if (fingerprint === sender) {
      granter = member
      break
    }
  }
  if (!granter) throw new GrantError('wrong-sender')

  // Trust on first use, and only first use.
  const pinned = params.trust.pins[String(granter.user_id)]
  if (pinned && pinned !== granter.verifying_key) throw new GrantError('wrong-sender')

  const { key, epoch } = await openGrant({
    grant: params.grant,
    householdId: params.householdId,
    minimumEpoch: params.trust.epochs[String(params.householdId)] ?? 0,
    senderVerifyingKey: fromBase64(granter.verifying_key),
    recipientPrivateKey: params.identity.privateKey,
    recipientVerifyingKey: params.identity.verifyingKey,
  })

  return { key, epoch, pin: { userId: granter.user_id, verifyingKey: granter.verifying_key } }
}

/**
 * How long a household's name may be, in characters.
 *
 * Eighteen fits every place a name is drawn without being cut, with room to
 * spare where a longer language's controls sit beside it: the budget switcher's
 * pill in the toolbar, the stack in the corner of a phone, the row on Profile.
 * "Familie Müller" is 14, "WG Langstrasse" 14, "Ferienwohnung" 13 — the names
 * people give where they live come in well under it. A name ellipsised on the
 * control you check before entering rent is a name you cannot tell apart from
 * its neighbour, which is the one job that control has.
 *
 * Enforced where a name is typed and again where it is sealed. The server
 * cannot check it: a name is ciphertext by the time it arrives.
 */
export const HOUSEHOLD_NAME_MAX = 18

/**
 * How long a member's name may be, in characters.
 *
 * A name is what Belege will print in "Anna paid" and "you owe Ben", lines
 * that sit beside an amount on a phone. Twenty covers a first name and a
 * surname initial in any of the four languages, or a nickname, with room.
 */
export const PERSON_NAME_MAX = 20
