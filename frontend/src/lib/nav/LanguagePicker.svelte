<script lang="ts">
  import { focusTrap } from '../util/focusTrap'
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
  // A bare globe, no 'DE | FR | IT': the icon is one of the few that reads
  // without language, and a row of codes would compete with the gear beside it.
  // The list itself is in endonyms, so it is legible from any starting language.

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
    class="globe"
    aria-haspopup="menu"
    aria-expanded={open}
    aria-label={t('menu.language')}
    title={t('menu.language')}
    onclick={() => (open ? close() : (open = true))}
  >
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10"></circle>
      <line x1="2" y1="12" x2="22" y2="12"></line>
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
    </svg>
  </button>

  {#if open}
    <div class="backdrop" role="presentation" onclick={handleBackdrop}></div>

    <ul class="panel" role="menu" aria-label={t('menu.language')} use:focusTrap>
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
  .globe {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: #e0e0e0;
    color: #333;
    border: none;
    border-radius: 6px;
    padding: 0.35rem;
    min-width: 34px;
    min-height: 34px;
    cursor: pointer;
  }
  .globe:hover { background: #ccc; }
  .globe:focus-visible {
    outline: 2px solid #2d6a4f;
    outline-offset: 2px;
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
    min-width: 12rem;
    list-style: none;
    margin: 0;
    background: white;
    border: 1px solid #e0e0e0;
    border-radius: 8px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
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
  .name { flex: 1; }
  .provisional {
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
