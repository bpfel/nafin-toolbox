const NONCE_LENGTH = 12

export const VAULT_VERSION = 11

/**
 * A stored vault written by a build newer than this one.
 *
 * Thrown rather than scrubbed. Substituting an empty vault would show the user
 * their budget as blank and, the moment they touched anything, save that over
 * the real one — losing data to a problem whose whole fix is "reload the page".
 */
export class VaultVersionAheadError extends Error {
  constructor(readonly found: number) {
    super(`vault was saved by a newer version (v${found}, this build reads v${VAULT_VERSION})`)
    this.name = 'VaultVersionAheadError'
  }
}

// --- Vault data types ---

export interface VaultData {
  version: 11
  budget: BudgetVaultData
  accounts: VaultAccount[]
  /** Whether the guided tour has been taken, or turned down. */
  tour: TourState
  /** What this client has decided to believe about other people. */
  trust: VaultTrust
  /**
   * What the household calls its members, by user id. Household vaults only:
   * a personal vault carries an empty map and nothing reads it.
   *
   * In the vault rather than on the server, because a name is personal data and
   * the server's whole job is not to read any. Kept when a member leaves, so a
   * record that mentions them — who paid, in Belege — can still say who.
   */
  people: Record<string, VaultPerson>
  /** What was actually spent: one record per receipt, the Belege module. */
  belege: Beleg[]
  /** Households only: money one member paid another to even out. */
  settlements: Settlement[]
  /** Households only: how a record is divided between members when entered. */
  split: Split
}

export interface VaultPerson {
  name: string
}

/** One thing spent. A *record* in code; a *Beleg* to a German reader. */
export interface Beleg {
  id: string
  /** The day it was spent, `YYYY-MM-DD`, in local time. */
  date: string
  /** In CHF, as typed and normalised: `'12.50'`. */
  amount: string
  /** The budget line it counts against; `null` is Unassigned. Expense entries only. */
  entryId: string | null
  note?: string
  /** Households: a user id, or `'joint'` for the joint account. */
  paidBy?: string
  /**
   * Households: each member's weight in this record, copied from `split` when
   * it was entered, so changing the split later does not rewrite old records.
   */
  shares?: Record<string, number>
  /** User id of whoever entered it. */
  createdBy: string
  /** When it was entered, not when it was spent. */
  createdAt: string
}

export interface Settlement {
  id: string
  date: string
  from: string
  to: string
  amount: string
  createdBy: string
  createdAt: string
}

/** Equal between members, or a weight per member (percentages that add to 100). */
export type Split = { mode: 'equal' } | { mode: 'shares'; shares: Record<string, number> }

/**
 * The things a client must remember in order not to be lied to twice.
 *
 * Both belong in the *personal* vault rather than in a household's, because
 * both are needed to decide whether a household's key may be opened at all —
 * and a fact kept inside the thing it guards is a fact you cannot read until
 * you have already trusted it.
 *
 * Neither is shared. They are one person's record of what they have accepted,
 * and another member's copy could disagree without either being wrong.
 */
export interface VaultTrust {
  /**
   * Verifying keys accepted for other people, by user id, base64.
   *
   * Pinned after the first grant from somebody is verified. The server serves
   * public keys unsigned and is the directory, so a key that silently changes
   * afterwards is a substitution — the paper behind all of this recommends
   * exactly this as the cheap fix, noting that even without out-of-band
   * verification it means an attacker "can then only substitute public keys on
   * their first use".
   */
  pins: Record<string, string>
  /**
   * The highest grant generation accepted, by household id.
   *
   * Signatures are static and infinitely replayable, so a compromised server
   * could otherwise hand back a grant from before a rotation and put somebody
   * on a key that was rotated away. This is the ratchet that refuses it.
   */
  epochs: Record<string, number>
}

/**
 * What the app knows about the tour having been offered.
 *
 * Both null is the only state in which the app volunteers anything, and that
 * is the only question anything asks of this. The two timestamps are kept
 * apart rather than collapsed into one because they record different answers
 * to the offer — finished, and turned down — and an audit of one's own vault
 * should be able to tell them apart. Nothing in the interface branches on it:
 * Knowledge offers every walkthrough with the same Start button whatever has
 * gone before, so there is no "take it again" to distinguish.
 *
 * In the vault rather than localStorage so it follows the user to a new device.
 * The cost is that it cannot be read before the vault is unlocked, which is no
 * cost at all: every screen the tour walks needs an unlocked vault anyway, and
 * an administrator — who has no vault — correctly gets no offer.
 */
export interface TourState {
  completedAt: string | null
  dismissedAt: string | null
}

export interface BudgetVaultData {
  /** The headings a budget is organised under. Called groups before v5. */
  categories: VaultCategory[]
  /** The lines themselves — Rent, Salary. Called categories before v5. */
  entries: VaultEntry[]
  /**
   * The current plan: one planned amount per entry. There is exactly one.
   *
   * v4 removed monthly periods. The budget is a standing plan rather than a
   * per-month ledger — which is what it always was in practice, since the
   * calculator never tracked real money movement. Points in time are captured
   * deliberately, as named snapshots, instead of accruing one row per month.
   */
  plan: VaultPlanEntry[]
  /**
   * Copies of the plan: the ones taken by hand, named, and one per finished
   * month, taken by the app. Called archives before v6.
   */
  snapshots: VaultSnapshot[]
  /**
   * The month being recorded now, `'YYYY-MM'`: the oldest one without a copy
   * yet. Set on the first write; from then on every month up to the current
   * one is copied as it ends. Absent until the plan is first written, so a new
   * plan never backfills months from before it existed.
   */
  openMonth?: string
}

export interface VaultPlanEntry {
  entryId: string
  plannedAmount: string
}

/**
 * A named snapshot of the plan.
 *
 * Called an snapshot before v6, which used one word in two senses: the heading
 * "Snapshots" meant the collection, while each item meant a packaged copy. The
 * verb misled too — "snapshot the plan" reads as retiring it, when the plan
 * stays live and this is only a copy taken alongside it. The word the interface
 * had already reached for, in all four languages, was snapshot.
 *
 * Deliberately DENORMALISED: it stores the names and amounts as they were,
 * rather than pointing at live entries. A snapshot that referenced entries
 * would be rewritten by a later rename and would lose lines to a later delete —
 * it would stop being a record of anything. The cost is that a snapshot cannot
 * be diffed against the plan by id, which is not something we need.
 */
export interface VaultSnapshot {
  id: string
  /** Given by hand; may be empty on a month's copy, which is called by its month. */
  name: string
  createdAt: string
  lines: VaultSnapshotLine[]
  /**
   * `'YYYY-MM'` on the copy the app takes as a month ends: the plan that month
   * is read against in Belege, and the plan's history for everybody. Absent on
   * a snapshot taken by hand. One per month, and not deleted: a past month in
   * Belege depends on it.
   */
  month?: string
}

export interface VaultSnapshotLine {
  /** Which entry it was, for matching a month's records. Absent on old snapshots. */
  entryId?: string
  entryName: string
  categoryName: string
  type: EntryType
  plannedAmount: string
  /** Paid automatically, as it stood: Belege counts it as spent at its plan. */
  automatic?: boolean
}

export type AccountKind =
  | 'transactional'
  | 'reserves'
  | 'savings'
  | 'cash'
  | 'retirement_3a'
  | 'investment'

export interface QRAddress {
  name: string
  street: string
  buildingNumber: string
  postalCode: string
  city: string
  country: string
}

export interface VaultAccount {
  id: string
  name: string
  kind: AccountKind
  currency: 'CHF'
  currentAmount: string          // balance as at lastCorrectedAt
  lastCorrectedAt: string        // ISO date
  bankName?: string
  iban?: string
  ibanKind?: 'iban' | 'qr-iban'
  holder?: QRAddress
}

/**
 * What a budget line is.
 *
 * Five, not two, and not four-plus-a-schedule. Until v7 an entry was income or
 * expense and a separate `reserve.kind` said whether it saved towards a
 * recurring bill or a thing to be replaced — so the same fact lived in two
 * places, and three of the five kinds were disguised as expenses.
 *
 *   income    money arriving
 *   expense   money leaving and gone
 *   savings   out of what is spendable, still yours, going nowhere in particular
 *   bill      out of what is spendable, held for something that falls due again
 *   purchase  out of what is spendable, held for something to be bought
 *
 * The last three all leave your account without leaving your net worth, which
 * is the distinction the allocation screen used to narrate in a popover
 * because nothing in the model said it.
 *
 * `bill` and `purchase` replace the words `obligation` and `amortization`,
 * both of which were unusable in a Swiss app: *obligation* is the ordinary
 * French and German word for a bond, and *Amortisation* is paying down
 * mortgage principal. Their old explanatory strings — "a bill that will
 * arrive", "something to replace" — were the names all along.
 */
export type EntryType = 'income' | 'expense' | 'savings' | 'bill' | 'purchase'

/** Leaves the account but not the net worth. */
export function holdsMoney(type: EntryType): boolean {
  return type === 'savings' || type === 'bill' || type === 'purchase'
}

/**
 * Which half of the budget a type belongs on.
 *
 * Everything that is not income sits on the expense side, including the three
 * that only hold the money: they still come out of what is spendable, which is
 * what the side is about.
 */
export function sideOf(type: EntryType): 'income' | 'expense' {
  return type === 'income' ? 'income' : 'expense'
}

/** Saves towards a figure, and therefore carries a `reserve`. */
export function savesTowardsTarget(type: EntryType): type is 'bill' | 'purchase' {
  return type === 'bill' || type === 'purchase'
}

/**
 * A target to reach, and how long there is to reach it.
 *
 * Carried only by `bill` and `purchase` entries. It used to carry a `kind`
 * saying which of the two it was; the entry type says that now, so the
 * schedule is recorded once. `reserveMath` reads the type directly.
 */
export interface ReserveDefinition {
  targetAmount: string
  periodMonths: number
  anchorMonth: string            // 'YYYY-MM'
}

export interface VaultCategory {
  id: string
  name: string
  /**
   * Which half of the budget this heading sits on. Called `type` before v7,
   * which collided with an entry's own type once that grew past two values —
   * a Housing heading has to be able to hold both Rent and a roof fund.
   */
  side: 'income' | 'expense'
  sortOrder: number
}

export interface VaultEntry {
  id: string
  name: string
  type: EntryType
  sortOrder: number
  archived: boolean
  categoryId: string
  sourceAccountId: string | null
  sinkAccountId: string | null
  reserve?: ReserveDefinition
  /**
   * Paid without a receipt — a standing order, a direct debit: rent, health
   * insurance. Belege does not offer it for a record and counts it as paid at
   * its planned amount, so a month's total is the whole month. Absent is false.
   */
  automatic?: boolean
}

/** A vault whose contents do not match the version it declares. */
export class VaultShapeError extends Error {
  constructor(detail: string) {
    super(`vault does not match v${VAULT_VERSION}: ${detail}`)
    this.name = 'VaultShapeError'
  }
}

/**
 * Checks that a vault about to be written matches the version it claims.
 *
 * Reads are already defensive — migrateVault works from the keys rather than the
 * number — but nothing stopped an inconsistent vault being *written*, and a bad
 * write outlives the tab that made it. One did: a vault stamped v5 with a v4
 * budget, which every later reader turned into an undefined `entries` and a page
 * that froze mid-render.
 *
 * Cheap enough to run on every save: four array checks on data already in hand.
 */
export function assertVaultShape(vault: VaultData): void {
  if (vault.version !== VAULT_VERSION) {
    throw new VaultShapeError(`version says ${String(vault.version)}`)
  }

  const budget = (vault as unknown as { budget?: Record<string, unknown> }).budget
  if (!budget || typeof budget !== 'object') {
    throw new VaultShapeError('budget is missing')
  }

  // The tell of the bug this exists to catch: an older version's key still
  // present, meaning something stamped the number without reshaping the data.
  if ('categoryGroups' in budget) {
    throw new VaultShapeError('budget still carries v4 categoryGroups')
  }
  if ('archives' in budget) {
    throw new VaultShapeError('budget still carries v5 archives')
  }

  // v6 named a category's half `type` and hid the schedule in `reserve.kind`.
  // Either surviving means something stamped v7 without reshaping the data.
  const categories = budget.categories
  if (Array.isArray(categories) && categories.some(c => c != null && 'type' in c)) {
    throw new VaultShapeError('a category still carries v6 type instead of side')
  }
  const entries = budget.entries
  if (
    Array.isArray(entries) &&
    entries.some(e => e != null && e.reserve != null && 'kind' in e.reserve)
  ) {
    throw new VaultShapeError('an entry reserve still carries v6 kind')
  }

  for (const key of ['categories', 'entries', 'plan', 'snapshots'] as const) {
    if (!Array.isArray(budget[key])) {
      throw new VaultShapeError(
        `budget.${key} is ${budget[key] === undefined ? 'missing' : 'not an array'}`,
      )
    }
  }

  if (!Array.isArray(vault.accounts)) {
    throw new VaultShapeError('accounts is missing')
  }

  // v8's one addition. Absent means something stamped the number without
  // adding the field, which is the same class of bug as the tells above.
  const tour = (vault as unknown as { tour?: unknown }).tour
  if (!tour || typeof tour !== 'object') {
    throw new VaultShapeError('tour is missing')
  }

  // And v9's. Writing a vault without it would lose every pin and every epoch
  // the client had learned, which is not a blank slate — it is a client that
  // has forgotten it was ever lied to.
  const trust = (vault as unknown as { trust?: { pins?: unknown; epochs?: unknown } }).trust
  if (!trust || typeof trust !== 'object') {
    throw new VaultShapeError('trust is missing')
  }
  if (!trust.pins || typeof trust.pins !== 'object') {
    throw new VaultShapeError('trust.pins is missing')
  }
  if (!trust.epochs || typeof trust.epochs !== 'object') {
    throw new VaultShapeError('trust.epochs is missing')
  }

  // v10's. Without it a household would forget what everybody is called.
  const people = (vault as unknown as { people?: unknown }).people
  if (!people || typeof people !== 'object') {
    throw new VaultShapeError('people is missing')
  }

  // v11's. A vault written without these would lose every record anybody typed.
  const v11 = vault as unknown as { belege?: unknown; settlements?: unknown; split?: unknown }
  if (!Array.isArray(v11.belege)) throw new VaultShapeError('belege is missing')
  if (!Array.isArray(v11.settlements)) throw new VaultShapeError('settlements is missing')
  if (!v11.split || typeof v11.split !== 'object') throw new VaultShapeError('split is missing')
}

// --- Encrypt / decrypt ---

export async function encryptVault(
  data: VaultData,
  mek: CryptoKey,
): Promise<{ ciphertext: string; nonce: string }> {
  const plaintext = new TextEncoder().encode(JSON.stringify(data))
  const nonce = crypto.getRandomValues(new Uint8Array(NONCE_LENGTH))

  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce },
    mek,
    plaintext,
  )

  return {
    ciphertext: bytesToBase64(new Uint8Array(encrypted)),
    nonce: bytesToBase64(nonce),
  }
}

/**
 * Base64-encodes bytes in chunks.
 *
 * `String.fromCharCode(...bytes)` spreads every byte as a separate argument and
 * overflows the call stack somewhere around a hundred kilobytes — which is to
 * say, it fails on a large vault by throwing while SAVING. Snapshots make large
 * vaults ordinary, so this is the difference between growing a vault and being
 * unable to persist it.
 */
function bytesToBase64(bytes: Uint8Array): string {
  const CHUNK_SIZE = 0x8000
  let binary = ''
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK_SIZE))
  }
  return btoa(binary)
}

export async function decryptVault(
  ciphertext: string,
  nonce: string,
  mek: CryptoKey,
): Promise<VaultData> {
  const ciphertextBytes = Uint8Array.from(atob(ciphertext), c => c.charCodeAt(0))
  const nonceBytes = Uint8Array.from(atob(nonce), c => c.charCodeAt(0))

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: nonceBytes },
    mek,
    ciphertextBytes,
  )

  const parsed = JSON.parse(new TextDecoder().decode(decrypted))

  return migrateVault(parsed)
}

/**
 * Brings a decrypted vault up to the current version.
 *
 * Versions with a known upgrade path are migrated in place, preserving the
 * user's data. Anything else — a version predating migrations, a missing
 * version, a non-object — is scrubbed and replaced by a fresh vault. That
 * scrub remains the pre-v1.0 fallback; it is no longer the only behaviour.
 */
export function migrateVault(parsed: unknown): VaultData {
  if (!parsed || typeof parsed !== 'object') return createEmptyVault()

  const vault = parsed as {
    version?: unknown
    tour?: unknown
    budget?: {
      categories?: { type?: unknown; side?: unknown }[]
      entries?: unknown
      categoryGroups?: unknown
      archives?: unknown
      snapshots?: unknown
    }
  }

  // The number is a claim; the keys are the evidence. A vault stamped v5 whose
  // budget still carries v4's `categoryGroups` was renumbered by something that
  // did not reshape it, and taking its word leaves every reader of `entries`
  // reading undefined — which is a frozen page, not an error anyone can act on.
  // Migrating on the evidence recovers the contents instead.
  const wearingV4Keys =
    vault.budget != null &&
    vault.budget.entries === undefined &&
    vault.budget.categoryGroups !== undefined

  // Same reasoning one version on: v6 renamed `archives` to `snapshots`, so a
  // vault claiming v6 while still holding `archives` was renumbered without
  // being reshaped, and every reader of `snapshots` would see undefined.
  const wearingV5Keys =
    vault.budget != null &&
    vault.budget.snapshots === undefined &&
    vault.budget.archives !== undefined

  // And again for v7, which renamed a category's `type` to `side`. A vault with
  // categories still wearing `type` was not reshaped, whatever it claims.
  //
  // Read off the categories rather than the entries: an entry's type widened
  // rather than being renamed, so 'income' and 'expense' are still perfectly
  // legal v7 values and tell you nothing. Only the category gives an
  // unambiguous answer. A vault with no categories at all has nothing to
  // migrate either way, and `some` on an empty array is false.
  const wearingV6Keys =
    vault.budget != null &&
    Array.isArray(vault.budget.categories) &&
    vault.budget.categories.some(c => c != null && c.side === undefined && c.type !== undefined)

  // v8 only added a key, so the tell is the key's *absence* rather than an
  // older name surviving — and an absence is much weaker evidence than a
  // presence. `tour === undefined` alone is true of a v1 vault, a blob with no
  // version, `null`, and a vault from a future build, so on its own it drags
  // every one of those onto the v7 path: junk that should be scrubbed is
  // migrated instead, and a vault this build cannot read is quietly accepted
  // rather than refused.
  //
  // Narrowed to the one case the tell is for: a vault claiming to be current
  // while missing the key a current vault always writes. The honest case —
  // a vault that says 7 — is handled by its own branch below.
  const wearingV7Keys =
    vault.version === 8 && (vault as { tour?: unknown }).tour === undefined

  // v9 added a key, so the same reasoning as v8's tell applies — and the same
  // narrowing. Only a vault claiming to be current while missing what a current
  // vault always writes; anything older is handled by its own branch.
  const wearingV8Keys =
    (vault.version === 9 || vault.version === 10 || vault.version === VAULT_VERSION) &&
    (vault as { trust?: unknown }).trust === undefined

  // v10 added `people`; the same narrowing again.
  const wearingV9Keys =
    (vault.version === 10 || vault.version === VAULT_VERSION) &&
    (vault as { people?: unknown }).people === undefined

  // v11 added the Belege keys; `belege` stands for all four.
  const wearingV10Keys =
    vault.version === VAULT_VERSION && (vault as { belege?: unknown }).belege === undefined

  // Belege's months were briefly a map of their own before they became
  // snapshots, in builds that were never released. Folded in, so a test vault
  // from then reads as one from now.
  if (vault.version === VAULT_VERSION && (vault as { months?: unknown }).months !== undefined) {
    foldMonthsIntoSnapshots(vault as unknown as PreReleaseV11)
  }

  if (
    vault.version === VAULT_VERSION &&
    !wearingV4Keys &&
    !wearingV5Keys &&
    !wearingV6Keys &&
    !wearingV7Keys &&
    !wearingV8Keys &&
    !wearingV9Keys &&
    !wearingV10Keys
  ) {
    return vault as unknown as VaultData
  }
  // Chained, so a v2 vault is carried all the way forward rather than scrubbed
  // for being four steps behind. Everything from v8 on is purely additive, so
  // those last steps are one helper rather than one more wrapper on each line.
  const fromV8 = (v8: V8Shape) => migrateV10ToV11(migrateV9ToV10(migrateV8ToV9(v8)))
  if (vault.version === 2) {
    return fromV8(
      migrateV7ToV8(
        migrateV6ToV7(migrateV5ToV6(migrateV4ToV5(migrateV3ToV4(migrateV2ToV3(vault))))),
      ),
    )
  }
  if (vault.version === 3) {
    return fromV8(
      migrateV7ToV8(
        migrateV6ToV7(migrateV5ToV6(migrateV4ToV5(migrateV3ToV4(vault as unknown as V3Shape)))),
      ),
    )
  }
  if (vault.version === 4 || wearingV4Keys) {
    return fromV8(
      migrateV7ToV8(migrateV6ToV7(migrateV5ToV6(migrateV4ToV5(vault as unknown as V4Shape)))),
    )
  }
  if (vault.version === 5 || wearingV5Keys) {
    return fromV8(migrateV7ToV8(migrateV6ToV7(migrateV5ToV6(vault as unknown as V5Shape))))
  }
  if (vault.version === 6 || wearingV6Keys) {
    return fromV8(migrateV7ToV8(migrateV6ToV7(vault as unknown as V6Shape)))
  }
  if (vault.version === 7 || wearingV7Keys) return fromV8(migrateV7ToV8(vault as unknown as V7Shape))
  if (vault.version === 8 || wearingV8Keys) return fromV8(vault as unknown as V8Shape)
  if (vault.version === 9 || wearingV9Keys) return migrateV10ToV11(migrateV9ToV10(vault as unknown as V9Shape))
  if (vault.version === 10 || wearingV10Keys) return migrateV10ToV11(vault as unknown as V10Shape)

  // Ahead of us, not behind: there is nothing to migrate and nothing wrong with
  // the data. Refuse it so the app can say so, instead of handing back an empty
  // vault that reads as "your budget is gone".
  if (typeof vault.version === 'number' && vault.version > VAULT_VERSION) {
    throw new VaultVersionAheadError(vault.version)
  }

  return createEmptyVault()
}

interface V3Period {
  year: number
  month: number
  entries?: { categoryId: string; plannedAmount: string; actualAmount?: string }[]
}

interface V3Shape {
  version: number
  budget?: {
    categoryGroups?: { id: string; name: string }[]
    categories?: { id: string; name: string; type: 'income' | 'expense'; groupId: string }[]
    periods?: V3Period[]
  }
}

/**
 * v4 in its own vocabulary — groups and categories, before v5 renamed them to
 * categories and entries. Only the migration speaks this.
 */
interface V4Group { id: string; name: string; type: 'income' | 'expense'; sortOrder: number }
interface V4Category {
  id: string
  name: string
  type: 'income' | 'expense'
  sortOrder: number
  archived: boolean
  groupId: string
}
interface V4PlanEntry { categoryId: string; plannedAmount: string }
interface V4ArchiveLine {
  categoryName: string
  groupName: string
  type: 'income' | 'expense'
  plannedAmount: string
}
interface V4Archive { id: string; name: string; createdAt: string; lines: V4ArchiveLine[] }

interface V4Shape {
  version: number
  budget?: {
    categoryGroups?: V4Group[]
    categories?: V4Category[]
    plan?: V4PlanEntry[]
    archives?: V4Archive[]
  }
}

const MIGRATION_MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/**
 * v3 -> v4: monthly periods become a single plan plus named archives, and the
 * `actual` amount is dropped.
 *
 * The most recent period becomes the plan — it is the one the user was last
 * working in. Every earlier period becomes an snapshot named for its month, so
 * nothing entered is lost: it stops being a timeline and becomes a set of
 * snapshots, which is what the months were serving as anyway.
 *
 * Snapshots are denormalised here using the category and group names as they
 * stand now. Periods never stored names, so today's are the only ones available.
 */
function migrateV3ToV4(vault: V3Shape): V4Shape {
  const budget = vault.budget ?? {}
  const categories = budget.categories ?? []
  const groups = budget.categoryGroups ?? []
  const periods = [...(budget.periods ?? [])].sort(
    (a, b) => a.year - b.year || a.month - b.month,
  )

  const groupNameById = new Map(groups.map(g => [g.id, g.name]))
  const categoryById = new Map(categories.map(c => [c.id, c]))

  const latest = periods.pop()
  const plan: V4PlanEntry[] = (latest?.entries ?? []).map(e => ({
    categoryId: e.categoryId,
    plannedAmount: e.plannedAmount,
  }))

  const archives: V4Archive[] = periods.map(period => ({
    id: crypto.randomUUID(),
    name: `${MIGRATION_MONTH_NAMES[period.month - 1] ?? period.month} ${period.year}`,
    createdAt: `${period.year}-${String(period.month).padStart(2, '0')}-01`,
    lines: (period.entries ?? []).flatMap(entry => {
      const category = categoryById.get(entry.categoryId)
      // An entry whose category was deleted has no name left to record, so
      // there is nothing meaningful to snapshot.
      if (!category) return []
      return [{
        categoryName: category.name,
        groupName: groupNameById.get(category.groupId) ?? '',
        type: category.type,
        plannedAmount: entry.plannedAmount,
      }]
    }),
  }))

  const migrated = vault as unknown as V4Shape
  migrated.version = 4
  migrated.budget = {
    categoryGroups: (budget.categoryGroups ?? []) as unknown as V4Group[],
    categories: (budget.categories ?? []) as unknown as V4Category[],
    plan,
    archives,
  }
  return migrated
}

/**
 * v4 -> v5: the vocabulary changes, nothing else does.
 *
 * What v4 called a group is a category, and what it called a category is an
 * entry. Only the words move — every id, amount and snapshot line survives, so
 * this is a pure key rename rather than a reshaping.
 *
 * The names are worth the migration because the old pair was actively
 * misleading: "category" named the line item in the budget and the heading in
 * the accounts screen at the same time.
 */
function migrateV4ToV5(vault: V4Shape): V5Shape {
  const budget = vault.budget ?? {}

  const migrated = vault as unknown as V5Shape
  migrated.version = 5
  migrated.budget = {
    categories: (budget.categoryGroups ?? []) as unknown as V6Category[],
    entries: (budget.categories ?? []).map(({ groupId, ...rest }) => ({
      ...rest,
      categoryId: groupId,
    })) as unknown as V6Entry[],
    plan: (budget.plan ?? []).map(e => ({
      entryId: e.categoryId,
      plannedAmount: e.plannedAmount,
    })),
    archives: (budget.archives ?? []).map(a => ({
      id: a.id,
      name: a.name,
      createdAt: a.createdAt,
      lines: (a.lines ?? []).map(line => ({
        entryName: line.categoryName,
        categoryName: line.groupName,
        type: line.type,
        plannedAmount: line.plannedAmount,
      })),
    })),
  }
  return migrated
}

/**
 * A category and an entry as v5 and v6 held them — the two versions differ only
 * in what the snapshot list is called, so they share these.
 *
 * Spelled out rather than reusing `VaultCategory` and `VaultEntry`. Those
 * describe what the app reads *now*, and pointing a historical shape at them
 * means the next rename silently rewrites what a v6 vault is claimed to look
 * like. That happened during the v5 rollout: a blanket rename walked through
 * the old shapes and their fixtures together, every test still passed, and
 * real vaults would have lost every snapshot on upgrade.
 */
interface V6Category {
  id: string
  name: string
  type: 'income' | 'expense'
  sortOrder: number
}

interface V6Reserve {
  kind: 'obligation' | 'amortization'
  targetAmount: string
  periodMonths: number
  anchorMonth: string
}

interface V6Entry {
  id: string
  name: string
  type: 'income' | 'expense'
  sortOrder: number
  archived: boolean
  categoryId: string
  sourceAccountId: string | null
  sinkAccountId: string | null
  reserve?: V6Reserve
}

/**
 * The v5 shape: everything v6 has, under the name `archives`.
 */
interface V5Shape {
  version: number
  budget?: {
    categories?: V6Category[]
    entries?: V6Entry[]
    plan?: VaultPlanEntry[]
    archives?: VaultSnapshot[]
  }
  accounts?: VaultAccount[]
}

/** The v6 shape: two entry types, a category `type`, and a reserve `kind`. */
interface V6Shape {
  version: number
  budget?: {
    categories?: V6Category[]
    entries?: V6Entry[]
    plan?: VaultPlanEntry[]
    snapshots?: VaultSnapshot[]
  }
  accounts?: VaultAccount[]
}

/**
 * v5 -> v6: archives become snapshots. Only the name changes.
 *
 * The contents are identical — same ids, same lines, same order — so this is a
 * key move rather than a transformation. It still has to happen in stored data
 * rather than being papered over at read time: leaving both names alive is how
 * a vault ends up stamped with a version its shape does not match, which is the
 * failure the v4 tell above exists to catch.
 */
function migrateV5ToV6(vault: V5Shape): V6Shape {
  const budget = vault.budget ?? {}

  const migrated = vault as unknown as V6Shape
  migrated.version = 6
  migrated.budget = {
    categories: budget.categories ?? [],
    entries: budget.entries ?? [],
    plan: budget.plan ?? [],
    snapshots: budget.archives ?? [],
  }
  return migrated
}

/**
 * v6 -> v7: five entry types, and a category has a side.
 *
 * Everything this needs is already in the vault; none of it has to be guessed.
 *
 *   reserve.kind === 'obligation'    -> bill      a thing that falls due again
 *   reserve.kind === 'amortization'  -> purchase  a thing to be bought again
 *   an expense with a sink account   -> savings   held rather than spent
 *   anything else                    -> unchanged
 *
 * The third line is the interesting one. Until now "is this money set aside?"
 * was answered at render time by looking at where the entry was routed — the
 * allocation screen recomputed it on every keystroke and then wrote a sentence
 * explaining the result, because nothing in the stored data said so. That
 * inference happens once, here, and becomes a fact.
 *
 * Order matters: an entry with a reserve also has a sink, so the reserve has to
 * be read first or every bill and purchase would arrive as plain savings.
 *
 * `kind` is deleted rather than left alongside. Leaving both is how a vault
 * ends up stamped with a version its shape does not match — which is the exact
 * failure the tells in `assertVaultShape` exist to catch.
 */
function migrateV6ToV7(vault: V6Shape): V7Shape {
  const budget = vault.budget ?? {}

  // 7, not VAULT_VERSION. This step produces a v7 vault and the next one takes
  // it from there; writing the constant here is how a chained migration starts
  // stamping whatever the newest version happens to be while leaving the shape
  // two steps behind — the exact failure `assertVaultShape` exists to catch.
  const migrated = vault as unknown as V7Shape
  migrated.version = 7
  migrated.budget = {
    categories: (budget.categories ?? []).map(({ type, ...rest }) => ({
      ...rest,
      side: type,
    })),
    entries: (budget.entries ?? []).map(entry => {
      const { reserve, ...rest } = entry
      return {
        ...rest,
        type: typeOfV6Entry(entry),
        ...(reserve
          ? {
              reserve: {
                targetAmount: reserve.targetAmount,
                periodMonths: reserve.periodMonths,
                anchorMonth: reserve.anchorMonth,
              },
            }
          : {}),
      }
    }),
    plan: budget.plan ?? [],
    snapshots: budget.snapshots ?? [],
  }
  return migrated
}

function typeOfV6Entry(entry: V6Entry): EntryType {
  if (entry.type === 'income') return 'income'
  if (entry.reserve?.kind === 'obligation') return 'bill'
  if (entry.reserve?.kind === 'amortization') return 'purchase'
  // `!= null`, not `!== null`. Entries carried up from v2 and v3 predate
  // accounts entirely and have no routing keys at all, so a strict comparison
  // reads `undefined` as "has a sink" and turns every one of them into savings.
  if (entry.sinkAccountId != null) return 'savings'
  return 'expense'
}

/**
 * v2 -> v3: the `fixed` flag was removed from categories.
 *
 * Dropping a field is backward-compatible at runtime, so nothing breaks without
 * this — but the key would linger in stored data, describing a feature that no
 * longer exists. Strip it explicitly; everything else carries over untouched, so
 * budgets, accounts, routing and reserves all survive.
 */
function migrateV2ToV3(vault: { version?: unknown; budget?: { categories?: unknown } }): V3Shape {
  const categories = vault.budget?.categories
  if (Array.isArray(categories)) {
    for (const category of categories) {
      if (category && typeof category === 'object') {
        delete (category as Record<string, unknown>).fixed
      }
    }
  }
  vault.version = 3
  return vault as unknown as V3Shape
}

/**
 * v7 in full: identical to v8 but for the key v8 adds. Only the migration
 * speaks this.
 */
interface V7Shape {
  version: number
  budget: BudgetVaultData
  accounts: VaultAccount[]
}

/**
 * v7 -> v8: the tour records whether it has been offered.
 *
 * Purely additive, and everyone arrives un-offered — including users who have
 * been running the app for months. That is deliberate rather than an oversight
 * about existing users: the tour is new to them too, and an offer they can turn
 * down in one tap is a smaller imposition than never telling them it exists.
 */
function migrateV7ToV8(vault: V7Shape): V8Shape {
  const migrated = vault as unknown as V8Shape
  // 8 rather than VAULT_VERSION. Stamping the current number here would have
  // claimed v9 for a shape with no `trust` in it — which is precisely the class
  // of bug every `wearing…Keys` tell above exists to catch.
  migrated.version = 8
  migrated.tour = { completedAt: null, dismissedAt: null }
  return migrated
}

interface V8Shape {
  version: number
  budget: BudgetVaultData
  accounts: VaultAccount[]
  tour: TourState
}

/**
 * v8 -> v9: what this client has decided to believe about other people.
 *
 * Empty for everybody, and correctly so. Pins and epochs are things a client
 * *learns* by verifying a grant; inventing either would be recording a decision
 * nobody made, and a pin nobody checked is worse than no pin at all — it would
 * silently accept whatever key happened to be there first.
 */
function migrateV8ToV9(vault: V8Shape): V9Shape {
  const migrated = vault as unknown as V9Shape
  // 9 rather than VAULT_VERSION, for the reason given in `migrateV7ToV8`.
  migrated.version = 9
  migrated.trust = { pins: {}, epochs: {} }
  return migrated
}

interface V9Shape {
  version: number
  budget: BudgetVaultData
  accounts: VaultAccount[]
  tour: TourState
  trust: VaultTrust
}

/**
 * v9 -> v10: what a household calls its members.
 *
 * Empty for everybody. Nobody has been named yet, and every place that shows a
 * member falls back to their email address, which is all the app knew before.
 */
function migrateV9ToV10(vault: V9Shape): V10Shape {
  const migrated = vault as unknown as V10Shape
  // 10 rather than VAULT_VERSION, for the reason given in `migrateV7ToV8`.
  migrated.version = 10
  migrated.people = migrated.people ?? {}
  return migrated
}

interface V10Shape extends V9Shape {
  people: Record<string, VaultPerson>
}

interface PreReleaseV11 {
  budget: { snapshots?: VaultSnapshot[] }
  months?: Record<string, { closedAt: string; lines: { entryId: string; entryName: string; categoryName: string; plannedAmount: string; automatic?: boolean }[] }>
}

function foldMonthsIntoSnapshots(vault: PreReleaseV11): void {
  const snapshots = (vault.budget.snapshots ??= [])
  for (const [month, closed] of Object.entries(vault.months ?? {})) {
    if (snapshots.some(s => s.month === month)) continue
    snapshots.push({
      id: crypto.randomUUID(),
      name: '',
      createdAt: closed.closedAt,
      month,
      lines: closed.lines.map(l => ({ ...l, type: 'expense' as const })),
    })
  }
  delete vault.months
}

/** This month, `'YYYY-MM'`, by the local calendar. */
function localMonth(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

/**
 * v10 -> v11: Belege. Nothing spent yet, no month closed, nobody owing
 * anybody, and the split even — the default a household would pick anyway.
 */
function migrateV10ToV11(vault: V10Shape): VaultData {
  const migrated = vault as unknown as VaultData
  migrated.version = VAULT_VERSION
  migrated.belege = migrated.belege ?? []
  // Months are kept from now on, not from before: no history is invented.
  migrated.budget.openMonth ??= localMonth()
  migrated.settlements = migrated.settlements ?? []
  migrated.split = migrated.split ?? { mode: 'equal' }
  return migrated
}

/**
 * @param mainAccountName What to call the one account every vault starts with.
 *   Data, like the seeded budget's names: written once, in the language the
 *   vault was made in, and the user's from then on. Callers pass it from
 *   `seedNamesFor(locale)`; English is only for the paths that have no locale
 *   to hand, such as replacing a blob too damaged to read.
 */
export function createEmptyVault(mainAccountName = 'Main'): VaultData {
  return {
    version: VAULT_VERSION,
    budget: {
      categories: [],
      entries: [],
      plan: [],
      snapshots: [],
      // A new plan's months start now: none is copied from before it existed.
      openMonth: localMonth(),
    },
    // Invariant: a vault always holds at least one account, so every category
    // can be routed from the moment it is created.
    accounts: [createMainAccount(mainAccountName)],
    trust: { pins: {}, epochs: {} },
    tour: { completedAt: null, dismissedAt: null },
    people: {},
    belege: [],
    settlements: [],
    split: { mode: 'equal' },
  }
}

function createMainAccount(name: string): VaultAccount {
  return {
    id: crypto.randomUUID(),
    name,
    kind: 'transactional',
    currency: 'CHF',
    currentAmount: '0.00',
    lastCorrectedAt: todayISO(),
  }
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}
