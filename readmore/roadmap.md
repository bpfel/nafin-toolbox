# Roadmap

[← Back to README](../README.md)

Ideas and plans, not promises. To propose something, open an issue.

## Planned modules

- **Pillar 3a** — retirement accounts, yearly contributions against the legal cap,
  provider and fund.
- **Investments (pillar 3b)** — traded securities valued through a market-data
  API, physical gold by weight times the spot price, unlisted shares valued by
  hand with a date.
- **Net worth** — one view across every module that holds data, with snapshots
  over time.
- **Currency conversion** — for holdings in USD or EUR. Live rates or manual is
  still open.

A screen joins the navigation once the feature behind it exists, not before.

## Bank connections

*As of November 2025.*

Swiss banks do not offer personal API keys. Access runs through **SIX bLink**,
which brokers data between banks and licensed third-party apps.

- bLink multibanking is live for retail customers at UBS, ZKB, PostFinance,
  Valiant, BEKB, Aargauische KB, Luzerner KB, Hypi Lenzburg and Banque CIC; more
  than 30 banks support the data interface.
- Raiffeisen does not take part in multibanking yet; its open-banking offer is for
  business customers only.
- Becoming a bLink *service user* needs a legal entity, a commercial register
  entry, an IT security audit and an admission test — not feasible for a
  self-hosted personal project.

The practical path:

1. **File import** — every Swiss bank exports transactions from e-banking; support
   the common formats (CSV, MT940) bank by bank.
2. **An aggregator** such as Salt Edge, which covers Swiss banks commercially and
   avoids bLink admission, at the cost of a paid relationship.
3. **Direct access**, if regulation arrives: the Federal Council asked for
   measurable open-banking progress by the end of 2025, with regulation as the
   fallback.

| Bank | Developer portal | Retail API | bLink multibanking |
|---|---|---|---|
| UBS | [developer.ubs.com](https://developer.ubs.com) | Via bLink only | Yes |
| ZKB | [API portal](https://www.zkb.ch/de/lps/unternehmen/digitales-banking/api-developer-portal.html) (sandbox) | Via bLink only | Yes |
| Raiffeisen | None for Switzerland | Not available | Not yet |
