# Knowledge: how this app is made, and where it runs — idea

Written 2026-10-24. Not yet planned in detail. **Status: idea, to consider.**

---

## The idea

A few articles about the app itself, beside the ones about Swiss money:

1. **Built with AI assistance.** Much of this code was written with an AI coding
   assistant, under review: what that means, what it does not mean, and how the
   work is checked — tests that run on every change, an independent security
   audit (0.5.0's found and fixed a sign-in race and an over-trusted proxy
   setting), plans written before code, and a person deciding what ships.
2. **Your data, your server.** What self-hosting means for a user who never ran a
   server: who runs this instance, what they can and cannot see (the vault is
   encrypted on the device; the administrator sees email addresses and the audit
   log), what happens to the data if they stop, and why that is different from a
   bank's or an app store's finance app.
3. **Running your own.** For the curious: what it takes (a small VPS or a NAS,
   a domain, an evening), linking to `readmore/self-hosting.md` through the
   source card in `source-link-plan.md`.

## Why it might be worth it

- **Trust is the product.** A finance app asks people to type in what they earn
  and owe. Saying plainly who can see what — and how the code came to be — answers
  the question a careful user has and rarely gets answered.
- **Honesty about AI.** People increasingly ask whether software was written by
  AI. Saying so, with what is done to check it, is better than being found out —
  and the process here (plans, tests, audits, review) is a good story.
- **Self-hosting is unusual** for a consumer app, and the second article is what
  makes a household comfortable using an instance a friend runs.

## Why it might not

- **Knowledge is about money.** Its articles explain Swiss finance in the user's
  terms. Articles about software dilute that; they may belong on an *About* sheet
  reached from the source card (`source-link-plan.md`) rather than in the library.
- **The sources rule.** Knowledge articles cite official domains only
  (`registry.test.ts`). Articles about the app itself have no official source;
  they would need their own kind, outside that rule, and the reason for the rule
  (no unsourced figures) does not apply to them.
- **It dates.** "How the work is checked" is true of a process, and processes
  change. Whatever is written must be kept true, which is upkeep.

## To decide before planning

- Library articles, or an *About* sheet from Profile? Leaning *About* sheet: it
  keeps Knowledge about money and needs no exception to the sources rule.
- Which of the three, and in which languages. The second is the one users need;
  the first is the one the owner wants to say; the third is for very few.
- Tone for the AI article: matter-of-fact, neither promotional nor apologetic.
