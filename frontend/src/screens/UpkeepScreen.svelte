<script lang="ts">
  import { UPKEEP, forReview, needsAttention, statusOf, DUE_WITHIN_DAYS } from '../lib/upkeep/register'
  import type { UpkeepEntry, UpkeepStatus } from '../lib/upkeep/register'
  import { sendUpkeepReminder } from '../lib/api/client'

  /**
   * The figures compiled into this build, and when each stops being true.
   *
   * English, like every admin screen: the person reading it edits TypeScript
   * and cuts a release, and `untranslated.test.ts` lists this screen alongside
   * Users and Audit for that reason.
   *
   * **It changes nothing.** Every entry names a file to edit and a page that
   * publishes the current figure; a human does the editing. That is the whole
   * point of keeping the knowledge base build-only — the alternative is a
   * server-side copy of four Swiss numbers that can fall out of step with the
   * seeds they are meant to describe.
   */
  const today = new Date().toISOString().slice(0, 10)

  let entries = $derived(forReview(today))
  let pressing = $derived(needsAttention(today))

  let sending = $state(false)
  let result = $state<string | null>(null)
  let failed = $state(false)

  const LABEL: Record<UpkeepStatus, string> = {
    overdue: 'Overdue',
    due: `Within ${DUE_WITHIN_DAYS} days`,
    scheduled: 'Scheduled',
    undated: 'No fixed date',
  }

  function daysAway(entry: UpkeepEntry): string {
    if (!entry.changesOn) return ''
    const days = Math.round((Date.parse(entry.changesOn) - Date.parse(today)) / 86_400_000)
    if (days === 0) return 'today'
    if (days < 0) return `${-days} day${days === -1 ? '' : 's'} ago`
    return `in ${days} day${days === 1 ? '' : 's'}`
  }

  async function remind() {
    sending = true
    result = null
    failed = false
    try {
      // Only what is pressing. A reminder listing everything would be one more
      // thing to skim, and the entries that are not yet due are on this screen
      // already for whoever wants to look ahead.
      const sent = await sendUpkeepReminder(
        pressing.map(e => ({
          subject: e.subject,
          current: e.current,
          becomes: e.becomes,
          changesOn: e.changesOn,
          cadence: e.cadence,
          where: e.where.join(', '),
          source: e.source.label,
          sourceUrl: e.source.url,
        })),
      )
      result = `Sent to ${sent.sent_to}.`
    } catch (error) {
      failed = true
      result = error instanceof Error ? error.message : 'Could not send the reminder.'
    } finally {
      sending = false
    }
  }
</script>

<div class="upkeep">
  <h1>Upkeep</h1>
  <p class="lede">
    Figures this build states as fact. Each is correct on the day it was written and wrong
    on some later one. Nothing here changes the app — edit the file, then cut a release.
  </p>

  <section class="remind">
    {#if pressing.length === 0}
      <p class="quiet">Nothing is due. The next dated change is further out than {DUE_WITHIN_DAYS} days.</p>
    {:else}
      <p>
        {pressing.length} of {UPKEEP.length}
        {pressing.length === 1 ? 'figure needs' : 'figures need'} a look.
      </p>
      <button class="btn-primary" onclick={remind} disabled={sending}>
        {sending ? 'Sending…' : 'Email me these'}
      </button>
      <!-- The address is the one you are signed in with. The server reads it
           from the session; this screen cannot name a recipient. -->
      <p class="quiet">Sent to the address you signed in with.</p>
    {/if}

    {#if result}
      <p class:error={failed} class:ok={!failed}>{result}</p>
    {/if}
  </section>

  <ul class="register">
    {#each entries as entry (entry.id)}
      {@const status = statusOf(entry, today)}
      <li class="entry {status}">
        <div class="head">
          <h2>{entry.subject}</h2>
          <span class="badge {status}">{LABEL[status]}</span>
        </div>

        <dl>
          <dt>Now</dt>
          <dd>{entry.current}</dd>

          {#if entry.becomes}
            <dt>Becomes</dt>
            <dd>{entry.becomes}</dd>
          {/if}

          {#if entry.changesOn}
            <dt>From</dt>
            <dd>{entry.changesOn} <span class="quiet">({daysAway(entry)})</span></dd>
          {:else if entry.cadence}
            <dt>Check</dt>
            <dd>{entry.cadence}</dd>
          {/if}

          <dt>Edit</dt>
          <dd>
            {#each entry.where as path}
              <code>{path}</code>
            {/each}
          </dd>

          <dt>Source</dt>
          <dd><a href={entry.source.url} target="_blank" rel="noopener noreferrer">{entry.source.label}</a></dd>
        </dl>
      </li>
    {/each}
  </ul>
</div>

<style>
  .upkeep {
    max-width: 44rem;
    margin: 0 auto;
    padding: 1rem;
  }

  h1 {
    margin: 0 0 0.25rem;
    font-size: 1.5rem;
  }

  .lede {
    margin: 0 0 1.5rem;
    color: var(--text-muted, #666);
  }

  .remind {
    border: 1px solid var(--border, #ddd);
    border-radius: 8px;
    padding: 1rem;
    margin-bottom: 1.5rem;
  }

  .remind p {
    margin: 0 0 0.5rem;
  }

  .quiet {
    color: var(--text-muted, #666);
    font-size: 0.875rem;
  }

  .ok {
    color: #155724;
  }

  .error {
    color: #721c24;
  }

  .register {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 1rem;
  }

  .entry {
    border: 1px solid var(--border, #ddd);
    border-left-width: 4px;
    border-radius: 8px;
    padding: 1rem;
  }

  /* Colour carries the same thing the badge says in words. On its own it would
     be the only signal, which is no signal at all to anyone who cannot see it. */
  .entry.overdue {
    border-left-color: #721c24;
  }
  .entry.due {
    border-left-color: #856404;
  }
  .entry.scheduled,
  .entry.undated {
    border-left-color: var(--border, #ddd);
  }

  .head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  h2 {
    margin: 0;
    font-size: 1rem;
  }

  .badge {
    font-size: 0.75rem;
    padding: 0.125rem 0.5rem;
    border-radius: 999px;
    background: #eee;
    color: #444;
    white-space: nowrap;
  }
  .badge.overdue {
    background: #f8d7da;
    color: #721c24;
  }
  .badge.due {
    background: #fff3cd;
    color: #856404;
  }

  dl {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: 0.25rem 1rem;
    margin: 0.75rem 0 0;
    font-size: 0.9rem;
  }

  dt {
    color: var(--text-muted, #666);
  }

  dd {
    margin: 0;
  }

  code {
    font-size: 0.85em;
    background: var(--surface-sunken, #f4f4f4);
    padding: 0.05rem 0.3rem;
    border-radius: 4px;
    margin-right: 0.35rem;
  }

  /* A phone is not where anyone edits a seed, but an admin may well check the
     list on one, so the two-column definition list folds rather than squeezes. */
  @media (max-width: 480px) {
    dl {
      grid-template-columns: 1fr;
      gap: 0 0;
    }

    dt {
      margin-top: 0.4rem;
    }
  }
</style>
