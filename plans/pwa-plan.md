# Progressive web app — plan

Written 2026-09-27. **Status: Tier 1 built on `feature/pwa` (2026-10-04). Tiers 2 and 3
are not.**

Decided: the app installs as **nafin** (`name` and `short_name`); the icon is a placeholder
"n" monogram in the accent green (`frontend/public/icons/*.svg`, rendered to PNG with
`rsvg-convert` — ImageMagick's built-in SVG renderer drops the stroke); the install hint is on
Profile only, on iOS only, in de/fr/it/en — `rm` shows the English until a native speaker
writes it. Back closing dialogs is `lib/nav/closeOnBack.ts`; the tour is deliberately not
wired to it, since it navigates between screens itself.

---

## What it is

Making the app installable to the home screen, so it opens in its own window without the
browser's toolbars. The layout below 768px is already an app layout — a bottom bar and one
screen at a time — and in a browser tab Safari's and Chrome's chrome sits on top of it.

It is also how the app reaches more people without app stores, which matters for something
self-hosted and multi-user.

## What already exists

- No manifest, no icons. `index.html` is titled "Finance Tracker".
- `nginx.conf` sends `Cache-Control: no-cache` on `index.html` and
  `public, max-age=31536000, immutable` on the hashed `/assets/`. That is most of the
  start-up speed a service worker would otherwise buy.
- `version.json` is emitted at build time (`vite.config.ts`) and `buildVersion.svelte.ts`
  notices a new deployment. Any service worker updates through this, not beside it.
- The CSP is `default-src 'self'`, which already covers a same-origin manifest and worker.

## The tiers

### Tier 1 — installable, no service worker (do this)

Current Chrome and Safari install from a manifest alone; neither needs a service worker any
more. So the home-screen app comes without the one risk a PWA carries (see Tier 2).

1. `public/manifest.webmanifest` — `name`, `short_name` (≤ 12 characters, it is the label
   under the icon), `start_url: "/"`, `scope: "/"`, `display: "standalone"`, `theme_color`
   and `background_color` from the tokens in `app.css`, icons.
2. Icons in `public/icons/`: 192 and 512 px, a maskable 512 with the mark inside the safe
   zone, and a 180 px `apple-touch-icon`.
3. `index.html`: `<link rel="manifest">`, `<link rel="apple-touch-icon">`,
   `<meta name="theme-color">` (light and dark, by `media`), and `<title>` set to the name
   decided below.
4. `nginx.conf`: serve `.webmanifest` as `application/manifest+json`, and under the same
   `no-cache` as `index.html` — a renamed app or changed icon has to reach installed copies.
5. Standalone mode leaves no browser back button. The router already pushes tab switches onto
   history (see **Navigation** in `CLAUDE.md`), so the Android back gesture works; check that
   every modal closes on it and that nothing is reachable only by the browser's back button.
6. `env(safe-area-inset-*)` on the bottom bar, the rail and the screen header, with
   `viewport-fit=cover` — without them the bottom bar sits under the iPhone home indicator.

### Tier 2 — service worker for the shell (later, only if start-up feels slow)

Caches the hashed `/assets/` only. `index.html`, `version.json` and everything under
`/api/` always go to the network, and the worker says so in a test rather than in a comment.

The risk is a user pinned to an old build. The vault is at v7 and moves; an old client
opening a newer vault is the failure that matters across several users. The update path is
the existing `version.json` check: on a new build, `skipWaiting` and reload, never "the next
time every tab is closed".

Handwritten (~50 lines) rather than `vite-plugin-pwa`: Workbox is a large dependency with
its own `npm audit` surface, for a worker that caches one directory.

### Tier 3 — offline vault (not planned)

Reading the encrypted vault offline is possible — it is ciphertext, and caching it is no
worse than the server holding it. Writing offline means reconciling with the server copy
later, and shared vaults make that a merge problem. Saving needs the server; the app says so
rather than pretending otherwise.

## What changes for the user once installed

- **iOS keeps a separate storage for an installed app.** A user signs in once more after
  adding it to the home screen.
- **The vault locks when the app is killed.** The MEK is in `sessionStorage`, whose lifetime
  in standalone mode is the app process. That is arguably right for a finance app; it will
  still be noticed, and the unlock screen should not read as a sign-out.
- **iOS has no install prompt.** "Share → Add to Home Screen" has to be explained, once, in
  Profile — in all five locales, kept short (see the i18n catalogue).

## Open questions — the user's to decide

- **The installed name.** `name` and `short_name`: "nafin", something else, or keep
  "Finance Tracker"? `short_name` has to fit under an icon.
- **The icon.** Is there a mark, or is a placeholder drafted?
- **Where the install hint lives.** Profile only, or also a one-time notice on a phone-sized
  screen in a browser tab?
