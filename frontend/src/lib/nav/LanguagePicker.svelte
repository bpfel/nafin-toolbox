<script lang="ts">
  import { focusTrap } from '../util/focusTrap'
  import { closeOnBack } from './closeOnBack'
  import {
    AVAILABLE_LOCALES,
    getLocale,
    isProvisional,
    setLocale,
    t,
    type Locale,
  } from '../i18n/index.svelte'

  // Its own control rather than an item inside the settings menu, because the
  // screens that need it most — signing up from an invite, logging in — have no
  // settings menu at all. Until this existed, the language of those screens was
  // decided entirely by the browser's Accept-Language, with no way to correct it.
  //
  // It shows the current language by name. It was a bare globe while it sat in
  // a row of icons beside the gear, where a word would have competed with them
  // and where nothing else said what the control was for. The gear is gone and
  // the profile page gives it a labelled row of its own, so the icon was
  // answering a question the row already answers — and answering it less well,
  // since a globe says "language" without saying *which*.
  //
  // The name works on the signed-out screens too, which have no row and no
  // label: an endonym identifies itself. Someone who lands in a language they
  // cannot read sees the word for the language they are in, which is more than
  // a globe told them.
  //
  // The list is in endonyms for the same reason, so it stays legible from any
  // starting language.

  let open = $state(false)

  function close() {
    open = false
  }

  function choose(locale: Locale) {
    setLocale(locale)
    // Deliberately stays open. The whole interface changes underneath, which is
    // the confirmation — and someone who picked the wrong language can still
    // read the list, because it is written in endonyms.
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && open) close()
  }

  function handleBackdrop(e: MouseEvent) {
    if (e.target === e.currentTarget) close()
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="picker">
  <button
    class="trigger"
    aria-haspopup="menu"
    aria-expanded={open}
    aria-label={t('menu.language')}
    title={t('menu.language')}
    onclick={() => (open ? close() : (open = true))}
  >
    <span class="current">{t(`language.${getLocale()}` as 'language.en')}</span>
    <!-- A word on its own in a settings row reads as a value rather than as a
         control; the chevron is what says it can be opened. -->
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  </button>

  {#if open}
    <div class="backdrop" role="presentation" onclick={handleBackdrop}></div>

    <ul class="panel" role="menu" aria-label={t('menu.language')} use:focusTrap use:closeOnBack={close}>
      {#each AVAILABLE_LOCALES as locale}
        <li>
          <button
            class="item"
            role="menuitemradio"
            aria-checked={getLocale() === locale}
            onclick={() => choose(locale)}
          >
            <span class="tick" aria-hidden="true">{getLocale() === locale ? '✓' : ''}</span>
            <span class="name">{t(`language.${locale}` as 'language.en')}</span>
            {#if isProvisional(locale)}
              <span class="provisional">{t('language.provisional')}</span>
            {/if}
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .picker {
    position: relative;
  }
  .trigger {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    background: #e0e0e0;
    color: #333;
    border: none;
    border-radius: 6px;
    /* Less padding on the chevron side: the glyph carries its own. */
    padding: 0.35rem 0.5rem 0.35rem 0.7rem;
    min-height: 34px;
    font: inherit;
    font-size: 0.9rem;
    cursor: pointer;
  }
  .trigger:hover { background: #ccc; }
  .trigger:focus-visible {
    outline: 2px solid #2d6a4f;
    outline-offset: 2px;
  }

  /* Never wraps. The longest endonym is Rumantsch, and a language name broken
     across two lines reads as a fault rather than as a label. */
  .current {
    white-space: nowrap;
  }

  .trigger svg {
    width: 16px;
    height: 16px;
    flex: none;
    opacity: 0.7;
  }

  /* Transparent, as in the settings menu: dimming the page would overstate
     what is a five-item list. */
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 90;
  }

  .panel {
    position: absolute;
    right: 0;
    top: calc(100% + 0.4rem);
    z-index: 91;
    /* Wide enough for the longest row the catalogue can produce: an endonym
       beside the provisional badge, which in German reads "teilweise übersetzt".
       At 12rem that badge wrapped to two lines and the panel looked broken. */
    min-width: 15rem;
    max-width: min(22rem, calc(100vw - 1.5rem));
    list-style: none;
    margin: 0;
    background: white;
    border: 1px solid #e0e0e0;
    border-radius: 8px;
    box-shadow: var(--shadow-raised);
    padding: 0.35rem;
  }

  .item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    background: none;
    border: none;
    border-radius: 5px;
    padding: 0.55rem 0.6rem;
    font-size: 0.9rem;
    color: #333;
    text-align: left;
    cursor: pointer;
  }
  .item:hover { background: #f1f3f5; }
  .item:focus-visible {
    outline: 2px solid #2d6a4f;
    outline-offset: -2px;
  }

  .tick {
    width: 1rem;
    flex: none;
    color: #2d6a4f;
  }
  .name { flex: 1; white-space: nowrap; }
  .provisional {
    /* Never split. It is a label, and a label on two lines reads as an error. */
    white-space: nowrap;
    font-size: 0.7rem;
    color: #b26a00;
    background: #fdf3e0;
    border-radius: 4px;
    padding: 0.05rem 0.35rem;
  }

  @media (max-width: 768px) {
    .panel {
      position: fixed;
      right: 0.75rem;
      left: 0.75rem;
      top: 3.5rem;
      min-width: 0;
    }
    .item { padding: 0.75rem 0.6rem; }
  }
</style>
