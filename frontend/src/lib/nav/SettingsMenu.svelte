<script lang="ts">
  import { focusTrap } from '../util/focusTrap'
  import { t } from '../i18n/index.svelte'

  interface Props {
    role: string
    email: string
    onnavigate: (view: 'security' | 'modules') => void
    onlogout: () => void
  }

  let { role, email, onnavigate, onlogout }: Props = $props()

  let open = $state(false)

  function close() {
    open = false
  }

  function go(view: 'security' | 'modules') {
    close()
    onnavigate(view)
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && open) close()
  }

  function handleBackdrop(e: MouseEvent) {
    if (e.target === e.currentTarget) close()
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="settings">
  <button
    class="gear"
    aria-haspopup="menu"
    aria-expanded={open}
    aria-label={t('menu.settings')}
    onclick={() => (open ? close() : (open = true))}
  >
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3"></circle>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
    </svg>
  </button>

  {#if open}
    <div class="backdrop" role="presentation" onclick={handleBackdrop}></div>

    <div class="panel" role="menu" aria-label={t('menu.settings')} use:focusTrap>
      <!-- Repeated from the bar because the bar hides them on a narrow screen,
           where this panel is the only place they appear. -->
      <div class="who">
        <span class="role">{role}</span>
        <span class="email">{email}</span>
      </div>

      <button class="item" role="menuitem" onclick={() => go('security')}>{t('menu.security')}</button>
      <button class="item" role="menuitem" onclick={() => go('modules')}>{t('menu.modules')}</button>
      <button class="item danger" role="menuitem" onclick={() => { close(); onlogout() }}>
        {t('menu.logout')}
      </button>
    </div>
  {/if}
</div>

<style>
  .settings {
    position: relative;
  }
  .gear {
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
  .gear:hover { background: #ccc; }
  .gear:focus-visible {
    outline: 2px solid #2d6a4f;
    outline-offset: 2px;
  }

  /* Catches the click that closes the panel. Transparent: a dimmed page would
     overstate what is a small menu. */
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
    min-width: 15rem;
    background: white;
    border: 1px solid #e0e0e0;
    border-radius: 8px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
    padding: 0.35rem;
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
  }

  .who {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    padding: 0.5rem 0.6rem 0.6rem;
    border-bottom: 1px solid #eee;
    margin-bottom: 0.25rem;
  }
  .role {
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #2d6a4f;
    font-weight: 600;
  }
  .email {
    font-size: 0.8rem;
    color: #666;
    overflow-wrap: anywhere;
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
  .item.danger { color: #c0392b; }
  .item.danger:hover { background: #fdecea; }

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
