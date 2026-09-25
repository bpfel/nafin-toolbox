# Knowledge Articles: Money Between Two People

Saved 2026-09-22, from the couples/shared-budget research. Articles only — the
feature side lives in `pillar-3a-ledger-plan.md` and, when it is written, the
shared-vault plan.

## Why articles first

Most of what the research turned up about Swiss couples is not a calculation.
It is a **record somebody should have kept** or a **form somebody should have
filed**, and the cost of not knowing is large, one-off and silent. That is
prose, not a screen. Several of these articles would be worth publishing even
if no sharing feature is ever built.

It also suits the library's existing bargain (`content.ts:28`): every figure
below that varies by year, canton or personal situation is **linked, never
quoted**. Almost nothing here needs a number at all — the articles are about
*what to keep* and *what to file*.

## How an article gets added

Per `registry.ts`: a row in `ARTICLES` (id, section, illustration), an entry in
`content/en.ts`, and nothing else. `registry.test.ts` holds the two halves
together and holds `sources` to official domains. Other locales are `Partial`
and show English through their gaps.

Sections: `about` explains this app, `swiss` explains the country. Everything
below is `swiss` except where noted.

## The articles

Ordered by value, not by writing order — see **Sequencing**.

### 1. `konkubinat` — what living together does not give you

The highest-stakes article in the set, because every failure mode is binary and
paperwork-shaped, and because roughly four in five cohabiting couples are
exposed to all of them at once.

Cover, as a checklist the reader can act on:

- **No inheritance right.** Without a will the partner takes nothing. But the
  lever is unusually large: with no descendants, spouse or registered partner,
  the *entire* estate is freely disposable (ZGB Art. 470(2)); the parents'
  Pflichtteil was abolished on 1.1.2023. A childless couple can leave each other
  everything. Holograph will: handwritten throughout, dated, signed (ZGB 505).
- **No AHV survivor's pension.** AHVG Art. 23/24 are defined purely in terms of
  *Witwe/Witwer*. The reform in flight is **not in force** and its committee
  voted to keep entitlement tied to civil status — do not imply it is coming.
- **Pillar 2 partner pension is discretionary.** BVG Art. 20a: the fund *"kann …
  vorsehen"*. Worth telling as the case it is — BGE 142 V 233, where a man who
  had cohabited since 2007 named his partner sole heir and executor and the fund
  still refused, because he never notified it as the regulations required.
  **A will is not a substitute for the pension fund's own form.**
- **Pillar 3a is better, and few know it.** BVV 3 Art. 2 puts a partner of five
  continuous years at rank 2, level with direct descendants — by ordinance, not
  by a foundation's discretion. Notification still needed.
- **Inheritance tax is a lottery.** Link, do not tabulate. Fully exempt in a
  handful of cantons on conditions (shared household for a set number of years,
  sometimes same tax domicile, sometimes both partners unmarried); an allowance
  only in others; taxed as unrelated elsewhere. ESTV publishes no rate table at
  all and commercial calculators contradict each other badly — this is the
  clearest "ask/look it up, never estimate" case in the app.
- **Joint mortgage means Solidarschuldner.** Each liable for the *whole* debt,
  and moving out does not release you — only the lender can.
- **No maintenance duty**, during or after (ZGB 159/163 are confined to
  spouses). If only one name is on the lease or title, the other can be required
  to leave (ZGB 169 and 219 are marriage-only).
- **No property regime at all.** Cohabitation has no effect on ownership and
  matrimonial property principles are *not* applied by analogy (BGE 108 II 204).
  Failing proof, the possessor of a movable is presumed owner (ZGB 930); where
  both possess, equal shares (ZGB 646(2)). Hence: keep an inventory, and update
  it.

Source: the Federal Council / BJ report *"Übersicht über das Konkubinat im
geltenden Recht – Ein PACS nach Schweizer Art?"* (30.03.2022) is the
authoritative link and far better than any consumer material.

### 2. `marriage-and-money` — Errungenschaft, Eigengut, and why records matter

The companion piece, and the one that justifies any future ownership-ledger
feature.

- The default regime is Errungenschaftsbeteiligung and it is overwhelmingly what
  people have — only about 5–10% of spouses conclude a marriage contract at all,
  most of those choosing separation of property, and community of property is
  effectively extinct (CEFL national report, Schwenzer/Bock — 2008, label the
  vintage).
- **ZGB Art. 200(3) is the sentence the article is built around:** everything is
  presumed Errungenschaft — half to the other spouse — until proven otherwise.
  Inheritances and pre-marital assets do not protect themselves.
- **Vermischung is the trap.** Money from an inheritance paid into a joint
  account stays Eigengut in law but becomes unprovable, so Art. 200(3) converts
  it and half is gone. It is invisible at the moment it happens. The only
  mitigations are weak: BGer 5A_37/2011 is expressly a *Beweiserleichterung* and
  does not reverse the burden of proof, and an Ersatzforderung under ZGB 209(1)
  needs amount and date anyway.
- **What to keep**, concretely: a dated snapshot of all accounts at the marriage
  date; Erbschein and Erbteilungsvertrag; gift confirmations written, dated and
  signed **together with the donor's own debit statement** (an incoming credit
  alone does not prove the gift was gratuitous); a sole-name account for
  inherited money; for property a complete paper trail — contract, land-register
  entry and quotas, every investment with amount and date, amortisation,
  renovation invoices, any pillar-2 Vorbezug. The burden is double: the Eigengut
  must be shown to have arrived *and* to be still identifiable today.
- **The one-year window.** ZGB Art. 195a: either spouse may at any time demand
  the other's cooperation in an inventory by public deed, and an inventory drawn
  up within one year of the assets coming in is **presumed correct**. Outside
  the window it only proves consistent statements were made. Entries must be
  precise — a generic "furniture" line is evidentially worthless.
- Mention without detail that a contribution to the *other's* asset carries a
  Nennwertgarantie (ZGB 206) while one between pools inside your own estate does
  not (ZGB 209(3)) — enough that a reader knows the question exists.

Do **not** attempt the Gütergemeinschaft-at-death case: the post-2023 Pflichtteil
fraction of the Gesamtgut under ZGB 241(3) is unresolved in the research and the
pre-2023 figure circulating is now wrong.

### 3. `splitting-household-costs` — 50/50, or in proportion

Short, practical, and the one most readers will actually use.

- Name the three arrangements plainly: pooled, split equally, split in
  proportion to income. No moralising about which is right.
- The Swiss rule of thumb has a legal pedigree worth citing: under the
  Betreibungsrecht guidelines to SchKG Art. 93, joint living costs are borne
  *"im Verhältnis ihrer Nettoeinkommen"*, explicitly excluding the ZGB Art. 164
  free-disposal amount from the pool being apportioned (BGE 114 III 12). That is
  "proportional, after each keeps a personal floor" — with a source.
- **ZGB Art. 164**: a spouse who keeps house, cares for children or helps in the
  other's business is *entitled* to a regular amount at free disposal. The law
  gives the entitlement; **no statute gives a number**, so the article says so
  and stops.
- Worth stating because it is counter-intuitive: choosing Gütertrennung does not
  change your tax position (DBG Art. 9 aggregates *"ohne Rücksicht auf den
  Güterstand"*), and joint liability for tax debts survives it too (DBG Art. 13).

### 4. `parental-leave` — what the allowance actually pays

The concrete instance of the life-events material, and the one where a naive
assumption is most expensive.

- Maternity allowance is 80% of prior earnings **but capped at a daily maximum**,
  for 14 weeks; paternity allowance is 2 weeks on the same basis. Link the
  figures to the AHV/IV Merkblatt rather than quoting them.
- The point of the article: **for a higher earner the drop is not 20%.** It is
  20% *plus everything above the cap*. A household that budgets "80% of salary"
  for the leave period will be wrong by exactly the amount that matters, and
  wrong in the direction that hurts.
- Say plainly that the way to get the real number is to ask the employer and the
  Ausgleichskasse, because employer top-ups vary and are not a legal minimum.

### 5. `part-time-and-pension` — the second-pillar cost of reducing your workload

- The mechanism: the coordination deduction is subtracted from salary before the
  BVG-insured portion is computed, so a part-time salary is insured on a
  disproportionately small base. Link the current deduction; do not quote it.
- The scale of the consequence is worth stating because it is not intuitive:
  roughly four in five Swiss mothers work part-time, women's pension income runs
  far below men's, and the overwhelming majority of that gap comes from the
  second pillar — not the first.
- The actionable half: a reduction in workload is a decision with a pension
  price, the price is knowable, and the way to know it is the **Vorsorgeausweis**
  — which the fund issues and which states the insured salary. Per the app's own
  rule, the article points at the document rather than estimating from a
  percentage.
- Note that some funds insure from the first franc or reduce the coordination
  deduction pro rata, so this is a question to ask *your* fund, not a universal.

### 6. `pillar-3a-gaps` — paying in for a year you missed

Pairs with `plans/pillar-3a-ledger-plan.md`; the article explains, the feature
tracks. Publishable on its own.

- Since 1.1.2025 a missed year can be made up. Conditions, in the reader's terms:
  you must have been entitled to contribute in the year you are closing; you must
  pay the current year in full first; only one buy-in per gap year, though one
  buy-in can close several; and none at all once you have started drawing the
  benefit.
- The two facts people get wrong: the window is the **ten preceding years**, but
  **only gaps from 2025 onward can ever be closed** — so 2026 is the first year
  this does anything, and a 2025 gap expires in 2035.
- The foundation needs a **written application** naming the amount, the years
  being closed, and any contributions already made in those years with dates.
- Cap figures are linked, not quoted (they move with the BVG limits).

### 7. `pension-on-divorce` — why the wedding-date balance matters

Short, and deliberately unsentimental. Divorce is common enough that the record
is worth keeping by default.

- Occupational pension assets accrued **from the wedding to the initiation of
  proceedings** are split — not to the decree, and not what came before. The
  pre-marital Austrittsleistung, compounded forward at the BVG minimum rate, is
  deducted first.
- Therefore: **each partner's pension-fund balance on the wedding date decides
  what is theirs alone.** Funds issue it on request. Almost nobody asks, and
  reconstructing it later is painful.
- Pillar 3a is different and worth one line: it is divided under matrimonial
  property law, not Vorsorgeausgleich — so the *same* wedding-date record matters
  for a different reason.
- Deviation from an equal split is possible by agreement under ZGB 124b, subject
  to adequate provision remaining.

## Sequencing

`marriage-and-money` and `konkubinat` are the pair that makes the rest readable,
and they are mutually exclusive for any given reader — so publish both before
either is linked from anywhere. Then `splitting-household-costs`, which is the
one people arrive wanting. `parental-leave` and `part-time-and-pension` are a
natural pair and can follow. `pillar-3a-gaps` should land with or before the
ledger feature. `pension-on-divorce` last — it is the least urgent to read and
the most useful to have read.

Note the section is already carrying an intended-next list in `registry.ts`
(`franchise`, `premium-reduction`, `tax-is-a-bill`, `qr-bill`, `three-pillars`).
`three-pillars` arguably precedes `pillar-3a-gaps` and `pension-on-divorce` for
a reader who does not know the frame; worth deciding whether to pull it forward.

## Illustrations

Six or seven new articles will want illustrations. `pillars` exists and suits
`pillar-3a-gaps` and `pension-on-divorce`. The others need new ones — worth
checking what `Illustration.svelte` costs per drawing before committing to the
full set, since that may be the real gate on how many of these ship at once.

## What deliberately stays out

- **Any cantonal figure.** Inheritance tax rates for partners especially: ESTV
  publishes no table and the calculators disagree.
- **Any franc amount that moves with the year** — 3a caps, the coordination
  deduction, the daily allowance cap, AHV pensions. All linked.
- **Tax-reform speculation.** Individual taxation reportedly passed at
  referendum with a long lead time before it takes effect; an article asserting
  what will be true in 2032 would be the exact failure mode the library's
  sourcing rule exists to prevent. Revisit when it is closer, and verify the
  vote independently first.
- **Advice about which arrangement a couple should choose.** The library
  describes rules; it does not counsel.
