# Features

[← Back to README](../README.md)

The app starts empty of *data*, not of features: every screen is there from the
first sign-in, and one that holds nothing yet says what it is for and offers the
action that starts it. Nothing is filled in on your behalf unless you ask.

## Budget

One standing plan rather than a ledger per month. Every line is one of five
kinds, each in its own section:

| Kind | Meaning |
|---|---|
| Income | Money arriving |
| Expense | Money spent |
| Savings | Money set aside that stays yours |
| Bill | Saving towards a bill that will arrive — a yearly tax bill, a premium |
| Purchase | Saving towards something to replace — a laptop, a bicycle |

Lines sit under categories (Housing, Employment, …). Bills and purchases carry a
target and a period, so the app works out the monthly amount to put aside.

When the plan changes enough to keep, save a named **snapshot**; snapshots live in
the **Archive**. A starter budget based on the BFS household budget survey
(HABE) is available if you want one, never imposed.

## Accounts and allocations

List the accounts you hold — transactional, reserves, savings, cash, pillar 3a,
investment — with their current balance, entered by hand.
Route each budget line to the account it is paid from or saved into, and the
**Allocations** view shows what each account needs to hold, projecting reserves
for bills and purchases so a yearly bill is covered before it falls due.

## Swiss QR bills

Generate a QR bill payable to any account with an IBAN, optionally filled from an
allocation, following the Swiss Payment Standards.

## Shared households

A household is a second budget kept beside your own, which its members open with
their own password. Start one from Profile and invite someone by email, link or QR
code, as a *writer* or a *reader*. A switcher always shows which budget is on
screen. The household is encrypted under its own key; see
[Security and privacy](security.md#shared-households).

## Knowledge

A short optional tour, and pieces on how the app and Swiss money work. Swiss
figures link to whoever publishes them rather than being quoted.

## Everywhere

- **Four screens:** Budget, Accounts, Knowledge, Profile — a bar along the bottom
  on a phone, a rail on a desktop. Administrators get Users, Audit, Upkeep and
  Profile instead.
- **Installable** to the home screen as *nafin*, where it opens without browser
  bars and the back gesture closes an open dialog before it leaves the screen.
  Android offers to install it; on an iPhone, Profile explains how. Needs HTTPS
  with a trusted certificate. It is a shortcut, not an offline app: it needs the
  server like the browser tab does.
- **Hide amounts** from whoever is looking over your shoulder.
- **Languages:** German, French and Italian throughout, informal register.
  Rumantsch Grischun covers the plain interface words and is provisional until a
  speaker has read it.
- **Currency:** CHF. There is no currency conversion yet.

## Not built yet

Pillar 3a, investments (pillar 3b), a net-worth view and currency conversion. See
the [roadmap](roadmap.md).
