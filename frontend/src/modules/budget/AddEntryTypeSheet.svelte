<script lang="ts">
  import { t } from '../../lib/i18n/index.svelte'
  import Sheet from '../../lib/nav/Sheet.svelte'
  import { TYPE_GUIDES } from '../../lib/budget/typeGuide'
  import type { EntryType } from '../../lib/crypto/vault'

  /**
   * Which kind of budget line is being added.
   *
   * The screen's "+" cannot open the form directly the way the accounts one
   * can: an account is one thing, and a budget line is five, each with its own
   * form — a bill asks how often it arrives, a purchase how long the thing
   * lasts, an expense neither. Something has to choose, and defaulting to
   * expense would quietly make the other four harder to reach from the control
   * that claims to add any of them.
   *
   * The sections each keep their own "+", which arrives at the same form with
   * the type already settled by where it was pressed. This is the route in for
   * someone who does not yet know which section they want, so it leads with
   * what each kind is rather than what it is called: the guide titles are
   * already one line each and already translated.
   */
  interface Props {
    onchoose: (type: EntryType) => void
    onclose: () => void
  }

  let { onchoose, onclose }: Props = $props()

  // The order money moves through them, matching the sections on the screen
  // behind — what arrives, what goes, what is kept, what is owed, what is
  // being saved for.
  const TYPES: EntryType[] = ['income', 'expense', 'savings', 'bill', 'purchase']
</script>

<Sheet label={t('entry.chooseType')} {onclose}>
  <h3>{t('entry.chooseType')}</h3>

  <ul class="types">
    {#each TYPES as type (type)}
      <li>
        <button class="type" onclick={() => onchoose(type)}>
          <span class="name">{t(`entryType.${type}` as 'entryType.expense')}</span>
          <span class="what">{t(TYPE_GUIDES[type].title)}</span>
        </button>
      </li>
    {/each}
  </ul>

  <div class="actions">
    <button class="btn" onclick={onclose}>{t('action.cancel')}</button>
  </div>
</Sheet>

<style>
  h3 {
    margin: 0;
    font-size: 1.1rem;
  }

  .types {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  /* A row per kind, full width: the name is what you are looking for and the
     line under it is what settles the choice, so they stack rather than
     competing for the same line. */
  .type {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.15rem;
    width: 100%;
    padding: 0.7rem 0.85rem;
    text-align: left;

    background: #f8f9fa;
    border: 1px solid var(--rule, #dee2e6);
    border-radius: 8px;
    color: inherit;
    cursor: pointer;
  }

  /* app.css fills every button green on hover, and an element-plus-pseudo-class
     outranks a plain class for that property. */
  .type:hover {
    background: #eef1f4;
    border-color: #cdd3d9;
    color: inherit;
  }

  .type:focus-visible {
    outline: 2px solid var(--accent, #2d6a4f);
    outline-offset: 1px;
  }

  .name {
    font-weight: 600;
    font-size: 0.95rem;
  }

  .what {
    font-size: 0.8rem;
    color: var(--ink-faint);
    line-height: 1.35;
  }

  .actions {
    display: flex;
    justify-content: flex-end;
  }

  .btn {
    padding: 0.5rem 1.25rem;
    border-radius: 6px;
    font-size: 0.9rem;
    cursor: pointer;
    background: #f1f3f5;
    border: 1px solid #dee2e6;
    color: #333;
  }

  .btn:hover {
    background: #e9ecef;
    color: #333;
  }
</style>
