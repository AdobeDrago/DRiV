# EDS Block Review — drivparts/brand-nav

**Date:** 2026-08-07 · **Repo:** `/Users/vishalsharma/Documents/DRiV` · **Evidence:** code-only (`blocks/drivparts/brand-nav/brand-nav.js`, `brand-nav.css`)

**Verdict:** Solid, well-defended implementation — correct decorate export, defensive DOM handling, proper ARIA toggle wiring, and a shared `sitePath()` helper reused from `brand-detail`. One real convention violation (block CSS reaching up to restructure `main`/section layout) and a couple of minor a11y/naming nits. Ready to ship with the CSS-scoping fix considered.

**Findings:** 0 Critical · 1 Warning · 2 Info

## Findings

### [Warning] Block CSS reaches outside the block to restructure `main` and section layout — `blocks/drivparts/brand-nav/brand-nav.css:15-24, 179-214`
The stylesheet doesn't stop at `.brand-nav`/`.brand-nav-wrapper`/`.brand-nav-container`. It also targets `main:has(.brand-nav.block)`, `main:has(.brand-nav.block) > .section`, and sibling sections (`.section:not(:has(.brand-nav))`) to: reorder sections on mobile/tablet (`order: -1`), switch `main` to a two-column grid on desktop, strip the generic section gutters, and hardcode a page max-width (`var(--page-max-width, 1440px)`). This is page/section-level layout logic living inside one block's file — per aem.live convention this belongs in `styles/styles.css` or should be driven by section metadata (e.g. an authorable `Style: sidebar` on the section), not smuggled into `brand-nav.css` via `:has()`. As written, any other block/page that also wants a sidebar layout can't reuse this without duplicating the same `:has()` rules, and a page author has no way to see or control this behavior from authoring.

**Fix:** Extract the `main:has(...)`/section-grid rules into `styles/styles.css` (or a section-metadata-driven class the author can apply, e.g. `Section (sidebar)`), keeping only `.brand-nav`-scoped rules in the block's own CSS.

### [Info] Toggle `aria-expanded` state goes stale when the toggle button is hidden by CSS — `blocks/drivparts/brand-nav/brand-nav.js:57-68`, `brand-nav.css:169-171`
At `>=1024px` the toggle button is set to `display: none` and the list is forced always-visible via CSS, independent of the `is-open` class/JS state. Functionally harmless (a `display: none` element is out of the accessibility tree), but if the desktop rule is ever removed or overridden, the leftover `aria-expanded="false"`/closed list state would then surface a real bug. Worth a short comment noting the coupling, or resetting `aria-expanded="true"` alongside forcing the list open at that breakpoint.

### [Info] `--brand-color-hover` used for the non-hover base heading color — `blocks/drivparts/brand-nav/brand-nav.css:43,157,166`
The variable name suggests a hover-only color but it's used as the primary heading/background/accent color in the default (non-hover) state, and again literally on `:hover`/`:focus-visible` links elsewhere. Not a functional issue since it's defined once in `styles/drivparts.css`, just a naming clarity nit — consider `--brand-color` for the base token if a rename is convenient.

## Checked and clean
- **Decorate export**: `export default function decorate(block)` present, synchronous, folder/file/class name (`brand-nav`) consistent.
- **Defensive DOM handling**: `extractHeadingText` and `buildList` guard against missing links, empty rows, and non-anchor first rows before touching them — no unchecked chained indexing.
- **Vanilla JS**: no frameworks, no `node_modules` runtime deps, no vendor bundles.
- **CSS scoping**: block-private rules are correctly scoped to `.brand-nav*` selectors (aside from the `main`/section reach flagged above).
- **CSS craft**: mobile-first structure (base rules unwrapped, `@media (width >= 1024px)` layers desktop), no `!important`, uses CSS custom properties with sensible fallbacks, no duplicated rule blocks across breakpoints.
- **Class/selector maps**: none — literal class names used directly, no unnecessary indirection.
- **Shared helpers across flow blocks**: `sitePath()` from `scripts/drivparts-paths.js` is reused identically in `brand-detail.js`, not reimplemented.
- **Constants**: `DEFAULT_HEADING_TEXT` and `LIST_ID` are module-top consts, each referenced meaningfully (not single-use noise).
- **Async/API robustness**: N/A — block does no fetching.
- **XSS/untrusted sinks**: no `innerHTML`/`insertAdjacentHTML`/`eval`; all authored links are moved via `element.append`, all dynamic text set via `textContent`.
- **a11y**: toggle is a real `<button>` with `aria-expanded`/`aria-controls`/`aria-label`; decorative spans use `aria-hidden="true"`; list stays a semantic `<ul>`; no heading level injected (uses a plain link, not `h1`/`h2`).
- **Block Collection comparison**: this is a custom nav pattern with no direct Block Collection equivalent — no reinvention concern.
- **aem.js helpers**: no image/metadata/icon work in this block, so no helper reinvention to check.

## Not verifiable at this scope
- Whether the `main:has()` grid rules collide with other sidebar-style blocks elsewhere in the project (would need a repo-wide CSS scoping pass).
- Rendered focus order and contrast for the heading/toggle at both breakpoints — requires a live/preview URL and PSI/axe run.
- Actual behavior across a resize from mobile→desktop→mobile while `is-open` is toggled (class persistence across breakpoints) — code reading suggests it's harmless but only a live page can confirm no flash/jump.
