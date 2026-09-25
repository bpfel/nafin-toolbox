/// <reference types="svelte" />
/// <reference types="vite/client" />

/** Build id stamped in by `define` in vite.config.ts. See lib/util/buildVersion.svelte.ts. */
declare const __BUILD_ID__: string

/** Release version stamped in by `define` in vite.config.ts. See lib/util/VersionTag.svelte. */
declare const __APP_VERSION__: string
