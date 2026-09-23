# Shared Vaults

Saved 2026-09-22, from the couples/shared-budget research and a technical study
of Bitwarden's Organizations model. Revised through discussion.

## The principle

**A shared vault is just a vault.**

Same `VaultData`, same budget engine, same accounts math, same snapshots, same
screens. It holds a complete budget *and* its accounts. A shared vault with one
member behaves exactly like a personal vault, so there is no second code path.

The only genuinely new things are **membership** and **key wrapping**. Which
means:

- **No owner field** on accounts or entries. Nothing is classified — a joint
  account lives in the household vault because that is where you put it. The
  question answers itself by location.
- **No cross-vault references.** `sourceAccountId` always points inside its own
  vault, exactly as today. A member's contribution is a figure they enter in
  their own budget; linking it to the household's derived total was considered
  and dropped, to keep each vault a standalone artifact.
- **No per-entity visibility.** Privacy is the vault boundary and nothing else.

### One unlock, all vaults

Switching context is **not** an authentication event. The chain runs from a
single password entry:

```
password → KEK → MEK → your private key → SVK → the household vault
```

Everything after the password is unwrapping against material already in memory.
Two consequences worth writing down so nobody later "improves" them:

- **The lock is shared.** The existing `vaultLocked` gate locks everything at
  once — one MEK gates every vault, so "lock only the household" is meaningless
  in this hierarchy, however reasonable it sounds.
- **Load lazily.** Fetch a shared vault on first switch, not at unlock; do not
  pull a blob that may never be opened. The cost is a brief loading state on the
  first switch of a session.

## Starting a household

**A household is created by one person, alone.** Members are invited whenever —
possibly never. This is the only way to create one.

Requiring a member at creation would mean your partner must already have an
account before you can even look at the feature, which makes it impossible to
explore before committing someone else to it. It also fights the research:
merging is the condition people drop out of (34% attrition in the joint arm of
the Olson et al. RCT, against 12% and 6%), so incremental is the right default —
and "start alone, invite when ready" *is* incremental.

The consequence is the best part. Because you can fill a household vault before
anyone is in it, **by the time you invite, you have already decided what is
shared.** The boundary gets drawn calmly and in advance, rather than in the
moment of inviting. That is a far better shape than sharing a personal vault,
which would hand over an entire history at once (see **Out of scope**).

So a household vault with one member is not a degenerate case — it is the
normal first state, and it is what makes the invite a single step rather than a
migration.

## Households: naming, navigation, and knowing where you are

A user may belong to several. Not only a partner — a flat-share, a household plus
a holiday-cabin fund, a budget run with a parent. The crypto is linear in the
number of vaults: N wrapped keys, all unwrapped by the same private key.

**The personal vault stays singular**: exactly one, cannot be left, nobody can
remove you from it.

### Every household is named

No default. A household is **named at creation**, by whoever creates it. There is
no "Household" fallback label, because a second one could not use it and
"Household 2" is not a name anyone means.

"Vault" stays the *encryption* word it already is — `vault.unlockTitle` is
"Unlock Vault", `recoveryKey.stakes` says *"everything in your vault is gone"*,
German uses *Tresor*. The switch names what a vault **holds**, not how it is
stored: one object, two registers, rather than two competing names for one thing.

**Every household wears the same house mark.** No per-vault icon chosen by the
user — what distinguishes one household from another is its *name*, and its
initials inside the mark. One glyph to draw, one thing to learn, and nothing to
pick when creating a household beyond what it is called.

### Navigation — the dial carries it

The context control lives in the **action dial**, not in the navigation. It
changes which vault is current; every screen follows without knowing anything
about sharing.

It cannot be a destination. `destinations.ts` records that four fit at 320px and
five do not, so a fifth would displace Knowledge — and a "Household Budget"
destination beside "Budget" would need a "Household Accounts" beside "Accounts"
too, duplicating the whole tree for identical data. Two levels, hard stop, is
preserved untouched.

The dial is already the thing that holds what acts on the whole screen, and it
already renders as a dot on a phone and a sticky toolbar above 768px. The
household indicator follows that split:

- **Phone.** While a household is current, the dot is drawn as a **house with
  the household's initials inside it**. Opening the dial puts the **full
  household name to the left of the dot**.
- **Desktop.** The toolbar carries the **house mark and the full household
  name** outright; there is room, and no tap needed to read it.

With several households the switch is a **list to scan**, not a toggle to flip.

Three constraints this inherits from `ActionDial.svelte`, all of them real:

- **One set of markup at both widths**, switched by a media query. Rendering the
  indicator twice and hiding a copy would mean two tab orders and two of every
  label in the document — the rule the dial and `AppNav` already follow.
- **The dot already carries state**: a ring while saving, and the dirty
  indicator. Adding identity to the same target makes it carry three things.
  Initials sit inside the glyph and the ring rides the perimeter, so they do not
  collide — but this is the crowding limit, and a fourth thing does not fit.
- **There is more than one dial in the document.** The shell keeps Budget and
  Accounts both mounted and hides the one you are not on. Only one is visible, so
  the duplication is harmless, but the accessible name must not announce the
  household twice.

### Knowing where you are

**Editing the wrong household's budget is a silent error.** The number looks
plausible in both places, nothing catches it, and it surfaces much later. So:

> The current context must be legible at a glance on every screen, without
> opening anything.

That is what the house-with-initials buys on a phone and the named toolbar buys
on a desktop: the resting state already tells you, and opening the dial only
spells it out. A household must look *visibly different* from the personal vault
— this is the one place the app should spend some visual distinctiveness,
because the cost of confusion is a wrong number the user trusts.

### It does not appear before there is one

A user with no household sees no control at all. Creating one is a **setup flow
on the Profile screen**, which is where the things that are not your money
already live.

The **tour** is what makes it discoverable — a step that says households exist
and where to start one. That is the honest division: the dial shows what you
have, Profile is where you get one, and the tour is what tells you it is there.

## Per-entry splitting

The shared plan says what the household spends. Who pays which part is a property
of **each entry**, not one global rule — rent proportional, groceries equal, a car
one person mostly uses at 70/30.

```
VaultEntry gains:  split?:
    { kind: 'equal' }                                  // absent means this
  | { kind: 'percent', shares:  { [memberId]: string } }
  | { kind: 'fixed',   amounts: { [memberId]: string } }
```

Meaningful only in a multi-member vault; absent and ignored otherwise, which is
what keeps the two vault kinds structurally identical. `equal` divides by N, so
the shape generalises past two members without redesign.

**Each member's contribution is derived** — their share summed across entries —
rather than entered. That is the figure a member would put in their own personal
budget as an expense.

**A percentage is stored, not live-linked.** Recomputing it silently when somebody
gets a raise is a surprise, and surprises are expensive here. The app may notice
the ratio has drifted and *offer* to update.

The same structure serves both arrangements without a mode: a household that
pools everything puts income and all costs in the shared vault and never touches
splits; one that shares only joint costs keeps income personal and splits the
shared entries.

Swiss default worth offering, not imposing: joint costs pro rata to *net* income
after each keeps a personal floor — the Betreibungsrecht rule under SchKG Art. 93
excluding the ZGB Art. 164 free-disposal amount (BGE 114 III 12). Frame any
threshold as *notify*, never *approve*.

### Income sharing — opt-in, per member, per vault

To seed a ratio, something must know the incomes. A member may **opt in to
publish their net income figure** into a shared vault.

- **One number, not the entries.** Publishing income *entries* would reveal
  employer, bonus structure and side income, and would land on the shared plan's
  income side — changing what the budget means for a household sharing only costs.
- **It lives in the members block**, not the plan. Splits already key on
  `memberId`, so that block exists regardless; `declaredIncome` and its date sit
  there.
- **All must opt in** for a ratio to exist. Asymmetric disclosure produces
  nothing, which is the honest outcome.
- **Revocable.** Opting out removes the figure and leaves stored splits intact.
- **Per vault.** Publishing your income to a partner is a different decision from
  publishing it to a flat-share.

Updating is a prompt, never automatic.

## Why there is no privacy problem inside a shared vault

Worth stating, because the couples literature is full of a problem this app does
not have.

Other couples apps struggle to hide a birthday present, because they track
transactions and every purchase shows up. **This budget is a standing plan, not a
ledger** — `vault.ts` says so: *"The budget is a standing plan rather than a
per-month ledger… the calculator never tracked real money movement."*

No transactions means nothing to conceal. What remains is not a privacy mechanism
at all: the shared plan should carry a line per person for their own money,
exactly as the Budgetberatung template does with **Persönliche Auslagen Person 1
/ Person 2**. An ordinary budget entry.

## The key hierarchy

```
  existing, unchanged
  ────────────────────
  password + email ──PBKDF2──► KEK ──wraps──► MEK ──encrypts──► personal vault

  new
  ───
  MEK ──wraps──► encryption private key    (public key stored server-side, cleartext)
  MEK ──wraps──► signing private key       (see §4)

  Shared Vault Key (SVK, 256-bit, CSPRNG, created client-side)
        ├── wrapped symmetrically under the creator's own MEK        (see §4)
        └── signed by A, then encrypted to member B's public key
                    …all copies decrypt to the same SVK

  SVK ──encrypts──► the shared vault blob
```

The existing MEK/KEK split already matches Bitwarden's User Key / Stretched
Master Key split, so password change stays O(1) — one key to re-wrap, no vault
re-encryption — and that extends to shared vaults for free. We are ahead on
primitives: AES-GCM rather than their AES-CBC-plus-HMAC, and PBKDF2 at 600,000
iterations, their current default and enforced minimum.

## Four things we deliberately do differently from Bitwarden

### 1. No collections. One key per shared vault.

Bitwarden has exactly **one** symmetric key per organization. Collections have no
key — the entity has no key column, and access is a server-side join table. Every
confirmed member holds the key that decrypts every item in every collection; what
stops them reading an unassigned one is the server declining to send it.

They have had to defend this publicly. ETH Zurich's 2025 cryptography report,
Issue 10, status **Accepted**: *"This is an intentional design choice that enables
the collections feature, and not a vulnerability."*

1Password is the better reference: its unit of sharing *is* its unit of
cryptographic separation. **A second shared budget is a second vault with a second
key**, never a collection. What this rules out for us is covered under **Roles**.

### 2. Pin the other member's public key

The server serves public keys unsigned and is the directory, so it can substitute
one and receive the shared key. This is the root of the two worst findings against
Bitwarden in *Zero Knowledge (About) Encryption* (Scarlata, Torrisi, Backendal,
Paterson, USENIX Security '26, ePrint 2026/058) — BW08 and BW09, the latter
*"entirely undetectable"*. Their diagnosis: *"copies of the encrypted organisation
symmetric key are not authenticated in any way."*

Their own stop-gap is cheap: *"storing known public keys in the vault after an
(optional) out-of-band verification… the attacker can then only substitute public
keys on their first use."*

So: after verification, **store the other member's public key in your own vault**
and refuse a silently changed one. Bitwarden's fingerprint protects only the
moment of confirmation; nothing there detects a later substitution.

### 3. Rotate the shared key when a member is removed

Bitwarden does not — there is no org-key rotation path in their clients or
server. A removed member who ever synced keeps everything readable forever, and
their remedy is to change the shared passwords. **That remedy does not exist for
us.** You cannot rotate last year's salary.

Their reason is scale. At household size it is trivial: a new SVK, one blob
re-encrypted, one re-wrap per remaining member. It cannot un-leak what was already
synced, but it kills the departed member's retained key for everything after.

### 4. Signcryption

Encryption is not authentication. A public key is public, so **anyone can encrypt
to you** — decrypting a wrapped key proves it was encrypted *to* you and says
nothing about *who* wrapped it. Bitwarden's own `UnsignedSharedKey` is documented
as *"does not provide sender authentication… the receiver cannot guarantee the
sender's identity."*

Two different attacks, and pinning closes only one:

| | Attack | Defence |
|---|---|---|
| **(a)** Server lies to A about B's public key; A wraps the real key to the attacker | fingerprint + pinning (§2) — *sender side* |
| **(b)** Server fabricates a wrapped key and hands it to B; B joins a vault whose key the server chose | **signcryption** — no signature for pinning to check |

**Sign before encrypting.** A signs the key material, then encrypts to B; B
verifies against A's pinned public key. This needs a **separate signing keypair**,
wrapped under the member's MEK exactly as the encryption key is.

**And take the free half first.** For the creator's *own* copy of the SVK, do not
use public-key encryption at all — wrap it **symmetrically under their own MEK**.
The paper recommends precisely this: *"forgo public-key encryption entirely in
favour of symmetric (authenticated) encryption. This is possible since the user is
both the sender and the recipient."* That kills the undetectable attack for
whoever creates the vault at no cost, leaving only genuine member-to-member
handoffs needing a signature.

Signcryption matters more with more than two members, because then a member can be
impersonated *to another member*, not only to the server's victim.

#### Proposal — checked against Bitwarden, 2026-09-23

**There is nothing to wait for.** Bitwarden has *not* shipped signed organization
membership and has *not* published a design. Their engineer's last public status
(server issue #7029, 2026-02-28) is "in-progress"; the only public artefact is
draft POC [sdk-internal#593](https://github.com/bitwarden/sdk-internal/pull/593),
**closed unmerged on 2026-07-24**; and the security whitepaper still documents
the unauthenticated flow verbatim. What they *have* shipped is the user-side
layer — per-user signature keypairs, COSE-signed public keys, signed security
state, namespaced domain separation — with no organization counterpart:
`Organization` has only `PublicKey`/`PrivateKey`, and `OrganizationUser.Key` is
still a single unsigned wrapped blob.

So we design it ourselves. The POC is still worth copying *as a shape*, because
it gets the classic trap right.

**Shape: encrypt, then sign, with both identities inside the AEAD's authenticated
data.** Neither naive order is safe (Davis, *Defective Sign & Encrypt*, USENIX
2001): sign-then-encrypt allows **surreptitious forwarding** — a member decrypts,
keeps the still-valid signature and re-encrypts it to somebody else — and
encrypt-then-sign allows **signature stripping**, where anyone re-signs a
ciphertext they cannot read. The POC's own comment states the fix plainly: the
outer signature proves who sent the envelope, but the contents *"could have been
stripped and relayed"*, so the sender and recipient fingerprints go in the
protected header that the AEAD authenticates.

The signed payload must therefore bind, at minimum:

| Field | Prevents |
|---|---|
| sender signing-key fingerprint | stripping and re-signing |
| recipient signing-key fingerprint | surreptitious forwarding |
| purpose string | reuse of a grant as some other kind of grant |
| household vault id | presenting a grant for one household as another's |
| wrapped key id and algorithm | swapping a different key under a valid signature |
| epoch counter | **replay** — signatures are static and infinitely replayable |

The epoch is the one most easily forgotten, and Bitwarden's own
`security_state.rs` admits the gap for their equivalent object: a long-term
compromised server *"can record the security state of a user, and then replay
this specific state"*. A client-side highest-epoch-seen ratchet closes it.

**Primitive: Ed25519, via a library rather than WebCrypto.** WebCrypto's
`Ed25519` only reached Chrome in **137 (May 2025)**; Firefox 129 and Safari 17
are older. Every evergreen browser has it today, but Electron builds, embedded
WebViews and corporate LTS channels are a real tail for a self-hosted app. Safari
also produces *randomized* rather than RFC 8032 deterministic signatures, so
signature bytes must never be used as an identifier or dedupe key. `@noble/curves`
is audited, roughly 4 KB, pure TS with no WASM, deterministic everywhere — one
implementation, one set of test vectors, no browser matrix in the threat model.
Feature-detecting WebCrypto with that as fallback is a later optimisation, not a
starting position.

Deliberately **not ML-DSA-44**, which is Bitwarden's new default. Post-quantum
signatures are the right call for a password manager holding secrets that must
survive decades; a household budget is not that, and the dependency and key sizes
are not worth it here.

Deliberately **not HPKE Auth mode** either, despite it looking like a ready-made
answer. It is not in WebCrypto at all, it gives *repudiable* authentication where
we want transferable evidence of who granted whom, and RFC 9180 warns its DHKEM
variants are *"vulnerable to key-compromise impersonation… sender authentication
cannot be expected to hold in the Auth mode if the recipient private key is
compromised."* Wrong trade for a membership record.

**And the honest limit: a signature never establishes *whose* key it is.** It
proves the holder of some private key signed something. Neither Signal nor MLS
pretends otherwise — Signal falls back to safety-number comparison, and RFC 9420
hands the question to an external Authentication Service. The POC does the same
and its two `prompt_*_verify_fingerprint` functions are literal stubs returning
`true`.

**Our answer: an invite secret, used as a MAC key.** Bitwarden's one genuinely
shipped mitigation of this class (`bitwarden-organization-crypto`) puts 32 random
bytes *in the invite link*, **never sent to the server**. We take the secret and
use it differently from them — to authenticate the invitee's key *back to the
inviter*, which is the direction that matters.

```
A generates secret S, sends the link (containing S) to B, by hand
B accepts, and posts MAC_S(B's public key) alongside
A fetches B's public key from the server and checks the MAC
   ✗ doesn't verify → the server substituted the key; refuse
   ✓ verifies       → this key belongs to whoever held the link
A signs and wraps the SVK to that key
```

Two properties at once. The link carries **no key material**, so a leaked link
does not hand over the household — unlike Bitwarden's variant, where the vault
key itself travels in the link and it becomes a bearer credential. And A verifies
B's key **cryptographically rather than by voice**, so there is no human step to
skip. Bitwarden added a "don't ask again" preference and an auto-confirm policy
precisely because admins rubber-stamp fingerprint dialogs.

Note the direction. The link runs A→B, so it can only carry *A's* identity to B —
the wrong way round to protect the dangerous step, which is the server lying to
**A** about **B's** key. Using S as a MAC key fixes that; sealing A's thumbprint
under it, as Bitwarden does, would not.

This is a standard pre-shared-secret authenticated exchange. The residual risk is
that a link leaked *before* B uses it lets whoever holds it complete the exchange
— bounded by a short expiry, single use, and the invite already being bound to an
email address, which an attacker would also need.

**The fingerprint phrase stays, as the fallback.** It is not redundant, because
it covers the case the MAC cannot:

| Delivery | What verifies the key |
|---|---|
| The inviter sends the link themselves | the MAC, automatically |
| The app emails it | the fingerprint phrase, by voice |

If the app mails the link, the server has seen S and the MAC proves nothing. That
makes the delivery choice an honest offer rather than a nag: one path verifies
itself, the other asks for a sentence read aloud.

**Pinning** (§2) sits underneath both, so a key that changes later is refused
whichever way it was established in the first place.

## The threat model is different because we are self-hosted

Bitwarden's adversary is "a malicious Bitwarden". Ours may be **one of the
members**, because in a self-hosted app one of them probably runs the box.

- **The guarantee that matters still holds.** A member who runs the server still
  cannot read another's personal vault. That is the whole case for this design
  over anything ACL-based.
- **Server-side revocation is unenforceable against the host.** If the removed
  party is the host, "the server stops serving you" means nothing. Rotation (§3)
  is what protects the others; pinning (§2) stops a host substituting a key at
  invite time.

So the fingerprint check is not hardening for the paranoid — it is the primary
defence against the most plausible adversary in exactly the scenario the feature
exists for. Bitwarden's related admission applies to us directly: *"An attacker
capable of tampering with the traffic that delivers the web client could deliver a
malicious client to the user."* Our SPA is served by our own nginx.

## The invite flow

Two steps, because **nobody can do both halves.** At invite time you know an email
address, which is not a public key, and the invitee may have no account. At
confirm time only an existing member holds the plaintext key, so only they can
wrap it for someone new — the server structurally cannot.

1. **Invite.** A enters an email. A's client generates the **invite secret S**.
   The server creates a member row, status `invited`, no user link, **no key**,
   and stores only a hash of the invite token — never S.
2. **The link.** Carries the token and S. **S never reaches the server**, so the
   link is assembled client-side. A short expiry and single use; Bitwarden allows
   five days, which is too long for something handed over in person.
3. **Delivery — A's choice, and it decides how the key gets verified.**
   - **Show it.** A **QR code** on A's screen, scanned by B's phone. The most
     out-of-band channel there is: no chat history, no mail server, no backup.
     The natural gesture when two people are in the same room, which for a couple
     starting a household budget is the common case.
   - **Copy it.** A link A pastes into whatever they already use.
   - **Mail it.** The app sends it — at the cost of the server seeing S, which
     falls back to the fingerprint check at step 5.
4. **Accept.** B follows the link, registering if needed (which creates their
   keypairs), signs in fully, accepts — and posts **MAC_S(their public key)**.
   Server binds the row to their user id. **Still no key. B can read nothing.**
5. **Confirm.** A's client fetches B's public key and verifies the MAC. It
   verifies → A signs and wraps the SVK to that key, no human step. It does not,
   or the link was mailed → A is shown the **fingerprint phrase** to check
   against what B reads from their own profile, over a channel that is not this
   app. Either way A **pins B's public key**; B pins A's on first sync.
6. **Sync.** B unwraps the SVK and can read the vault.

**The QR is nearly free.** `frontend/src/lib/qrbill/` already encodes and renders
QR — the `qr` package plus `encode.ts` and `svg.ts` — for the Swiss QR bill. An
invite QR is the same encoder with a shorter payload and none of the bill
layout. Worth checking the payload stays comfortably inside a low error-correction
version: a 32-byte secret is 43 base64url characters, plus the token and the base
URL.

Scanning needs a camera, which points the gesture one way: **A shows, B scans**.
That is also the direction that makes A the deliverer, which is what the MAC
path requires.

**The fingerprint phrase**, about forty lines:

```
HKDF-Expand(PRK = SHA-256(publicKey), info = userId, L = 32, SHA-256)
  → read as base-7776 digits → 5 words from the EFF long wordlist  (≈64.6 bits)
```

Binding the user id into `info` domain-separates it, so a key whose fingerprint is
known in one context cannot be replayed into another.

It suits us better than it suits Bitwarden. For an enterprise admin confirming a
stranger, reading five words aloud is friction; **for two people who live together
it is one sentence.** The secure path is also the natural one. Bitwarden has since
added a "don't ask again" preference and an auto-confirm policy — we should not.

## Roles

Only what can actually be enforced. Because there is one key per vault (§1), a
"read-only member" would be a lie: any holder of the key decrypts everything.
Either a person holds the key or they do not. If a genuine viewer role is ever
wanted it needs a different mechanism — a separate derived read-only export under
its own key — not a flag.

**Leaving is always unilateral and immediate.** Any member may remove *themselves*
from any shared vault at any time, without the others' cooperation, and the
resulting notification must not escalate. The intimate-partner-violence research
(Bellini et al., USENIX Security '23) is unambiguous, and *"your partner has left
the shared budget"* is a dangerous push. Design the removal path and its
notifications deliberately.

**A household is owned by whoever created it.** Everyone else is a member with
**full editing rights** — the budget, the accounts, the splits, all of it. The
owner's only extra power is over *membership*: inviting, and removing someone
other than themselves.

That is the whole role model, and it is deliberately the smallest one that works.
It needs no permission tiers, because there are none to enforce; the single
asymmetry is the one the invite flow already requires, since somebody has to hold
the key in order to wrap it for a newcomer.

What it leaves open is succession — if the owner leaves a household they created,
ownership has to go somewhere. Simplest is that it passes to the longest-standing
remaining member; leaving it unowned would strand the household with no one able
to invite.

## Recovery

**No escrow.** Bitwarden's admin account recovery uses an organization keypair,
which is deliberate key escrow and the amplification vector in their attack BW01,
where compromising one user cascades through every organisation with recovery
enabled and overlapping members.

If one member loses their password they recover with their own recovery key, as
today, and the shared vault comes back with them. **If every member loses access,
the vault is lost** — exactly as a personal vault is today. This must be said
plainly when a household is created, not buried.

## Schema

**Vault version: v9.** Verified 2026-09-23 — `develop` and the merged
`feature/knowledge-upkeep` both sit at v8 (`tour`), and there are no open PRs, so
nothing else is in flight. Adding `split` and the members block makes it v9.

Today `user_vaults.user_id` is the PRIMARY KEY, so one vault per user is enforced
by the schema (`backend/migrations/001_init.sql:86`).

- `users` gains `public_key`, `encrypted_private_key` and the signing pair.
  Generated at **key setup for every user**, sharing or not, so a key is always
  there when an invite arrives.
- `shared_vaults` — id, name, ciphertext, nonce, version, updated_at. Same
  optimistic-concurrency discipline as `user_vaults`, which already refuses a
  stale write with 409 on `expected_updated_at`. That matters more here: two
  people editing one plan is the case it was written for.
- `shared_vault_members` — vault id, user id, `wrapped_key` (opaque to the
  server), status, timestamps.
- `shared_vault_invites` — token hash, vault id, invited email, expiry.

## Frontend refactor

Smaller than feared. `vaultStore.svelte.ts` holds `vault` and `mek` as
module-level singletons, but **13 files go through `getVaultState()`** and only
two reach past it: `SnapshotPanel.svelte` (`markDirty`) and `authStore.svelte.ts`
(the lifecycle functions).

So: the store keeps a map of vaults plus a current-vault pointer;
`getVaultState()` returns the current one and the 13 callers are unchanged in
spirit. `authStore` learns that unlocking makes more than one vault reachable.

## Open questions

1. **MAC construction.** HMAC-SHA256 over what, exactly — the raw public key
   bytes, or a canonical encoding of them. Per §4's own rule the input must be
   canonical and non-colliding, and the purpose string should be domain-separated
   from every other use of S.
2. **Invite expiry**, and whether a QR invite should be shorter-lived than a
   copied link, since it is scanned within seconds of being shown.
3. **Ownership succession.** If the owner leaves a household they created,
   ownership passes to — probably the longest-standing remaining member. Needs
   deciding, because an unowned household can never invite again.
4. **Household initials.** How they are derived from a name the user typed, what
   happens with one word or with a non-Latin script, and what the dot shows
   during the moment a household is loading.

## Out of scope

- **Any server-enforced partial visibility.** Privacy is key possession. A field
  the server is asked to hide is not private.
- **Migrating a personal vault into a shared one.** It would move one member's
  entire history into the shared blob at a stroke. Starting empty and filling
  deliberately is both safer and the whole point of **Starting a household**.
- **A single net-worth figure across vaults.** When a dashboard exists it must
  show the personal position and each household *separately*, and never sum them.
  Splits give a principled answer for the budget; accounts have no share concept
  and deliberately no owner field, so summing would require inventing each
  member's share of a joint account. That share depends on the Güterstand, on
  Miteigentum quotas, and on who contributed what — it is a thing to be
  *recorded*, never derived, and guessing it is exactly the wrong-but-trusted
  number the project forbids.
- **Large groups.** Nothing forbids them, but the roles model, the splitting UI
  and the removal semantics were reasoned about at household scale and should be
  revisited before anyone builds for a dozen people.
