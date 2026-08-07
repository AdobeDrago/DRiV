# EDS Block Review — drivparts/brand-detail

**Date:** 2026-08-07 · **Repo:** `/Users/vishalsharma/Documents/DRiV` · **Evidence:** code-only (`blocks/drivparts/brand-detail/brand-detail.js`, `brand-detail.css`)

**Verdict:** The best-defended block reviewed in this project so far — every cell access is null-checked, external links are safely decorated, no XSS sinks, and CSS is correctly scoped to the block's own selectors (no reaching into unrelated blocks' layout, unlike `brand-nav`/`cards`). Two real issues: a duplicated storefront URL prefix that already lives in a shared module, and a missing `aria-controls` on the Browse Parts toggle (brand-nav in this same repo gets this right). Ready to ship with those addressed.

**Findings:** 0 Critical · 2 Warning · 2 Info

## Findings

### [Warning] Storefront URL prefix duplicated instead of reusing the shared `STOREFRONT` route map — `blocks/drivparts/brand-detail/brand-detail.js:4`
```js
const STOREFRONT_CATEGORY_BASE = '/fmstorefront/federalmogul/en/USD/brands/c';
```
`scripts/storefront-session.js:5-18` already centralizes every other Hybris storefront path behind the same `/fmstorefront/federalmogul/en/USD/` prefix in one `STOREFRONT` object (`iframe`, `logout`, `account`, `signIn`, `cart`, …), specifically so the locale/currency/tenant segment isn't hand-typed in multiple files. `brand-detail.js` redeclares that same prefix independently. If the storefront tenant, locale, or currency segment ever changes, this block can silently drift out of sync with the shared map since nothing ties them together.

**Fix:** Add a `brandsCategory` (or similar) entry to `STOREFRONT` in `storefront-session.js` and import it, e.g.:
```js
// storefront-session.js
export const STOREFRONT = {
  ...
  brandsCategory: '/fmstorefront/federalmogul/en/USD/brands/c',
};

// brand-detail.js
import { STOREFRONT } from '../../../scripts/storefront-session.js';
// use STOREFRONT.brandsCategory instead of a local constant
```

### [Warning] Browse Parts toggle is missing `aria-controls` — `blocks/drivparts/brand-detail/brand-detail.js:142-165`
```js
const toggle = document.createElement('button');
toggle.type = 'button';
toggle.className = 'brand-detail-browse-toggle';
toggle.setAttribute('aria-expanded', 'true');
toggle.textContent = 'Browse Parts';
const list = document.createElement('ul');
list.className = 'brand-detail-browse-list';
...
toggle.append(icon)... // no aria-controls, list has no id
```
The toggle correctly manages `aria-expanded`, but never associates itself with the list it expands/collapses via `aria-controls` (and the list has no `id` to point to). This is the exact ARIA pattern the `brand-nav` block in this same repo already implements correctly (`LIST_ID` constant + `toggle.setAttribute('aria-controls', listId)`), so it's an easy, consistent fix rather than new design work.

**Fix:**
```js
const listId = 'brand-detail-browse-list';
list.id = listId;
toggle.setAttribute('aria-controls', listId);
```

## Info

### [Info] `section.classList.add('brand-detail-section')` duplicates the auto-generated `-container` class — `blocks/drivparts/brand-detail/brand-detail.js:279-280`
```js
const section = block.closest('.section');
if (section) section.classList.add('brand-detail-section');
```
`aem.js`'s `decorateBlock` already stamps `${shortBlockName}-container` (i.e. `.brand-detail-container`) onto the same parent section *before* this block's `decorate()` runs (`decorateBlocks(main)` in `scripts.js:257` runs ahead of `loadSections`/`loadBlock` at `scripts.js:354`). So by the time this line executes, the section already carries an equivalent class doing the same job — `brand-detail.css:3-16` then has to style both `.brand-detail-section` and `.brand-detail-container` identically to cover it. Not a functional bug, just redundant JS and doubled CSS selectors for one target.

**Fix:** Drop the manual `classList.add` and the `.brand-detail-section` selectors from the CSS; style `main .section.brand-detail-container` only.

### [Info] Several heading sizes hardcode pixel values that duplicate existing design tokens — `blocks/drivparts/brand-detail/brand-detail.css:198-223`
`h2` (28px), `h3` (20px — should logically be `l`'s 24px or `m`'s 20px), and `h4` (16px) hardcode values that already exist as `--heading-font-size-xl` (28px), `--heading-font-size-m` (20px), and `--heading-font-size-xs` (16px) in `styles/drivparts.css:40-45`. `h1`'s 38px doesn't match any token (closest is `--heading-font-size-xxl` at 36px). Using the custom properties would keep this block in sync if the type scale ever changes globally, and would surface whether the 38px h1 is an intentional one-off or drift.

## Checked and clean
- **Decorate export**: `export default function decorate(block)` present, synchronous... actually async-capable (no `await` needed here), folder/file/class name (`brand-detail`) consistent, correctly routed via `DRIVPARTS_BLOCKS` in `scripts/aem.js:539-553`.
- **Defensive DOM handling**: every helper (`readLabeledCells`, `takePicture`, `buildSidebarBrand`, `buildBrowseParts`, `appendHeading`, `appendBody`, `appendExtraLinks`) null-checks its input cell/element before use — the most thoroughly defended block reviewed in this project so far.
- **Vanilla JS**: no frameworks, no runtime dependencies.
- **CSS scoping**: every selector is scoped to `.brand-detail`, its own `-wrapper`/`-container`/`-section`, or `.brand-detail-*` private classes — no reaching into unrelated blocks' or pages' layout (unlike the `main:has(.brand-nav.block)` pattern flagged and fixed in `brand-nav`/`cards`).
- **CSS craft**: mobile-first (base rules unwrapped, `@media (width >= 768px)`/`(width >= 1024px)` layer up), no `!important`, no cross-breakpoint duplicate rule blocks.
- **Class/selector maps**: `BRAND_NAME_BY_SLUG` is a genuine lookup table (14 real entries, used for a real fallback need), not single-use noise.
- **Constants**: `BECK_CATALOG_URL`, `STOREFRONT_CATEGORY_BASE`, and all regexes are module-top consts (aside from the sharing opportunity noted above).
- **Async/API robustness**: block does no fetching; `decorateExternalLink`'s `new URL(...)` is wrapped in try/catch.
- **XSS/untrusted sinks**: no `innerHTML`/`insertAdjacentHTML`/`eval`; all URLs assigned to `href` are built from `encodeURIComponent`-escaped authored text or hardcoded constants, not raw untrusted input.
- **a11y**: "Back to Brands" link correctly uses a single `aria-label` with two `aria-hidden` responsive text spans instead of duplicating accessible names; external links get `target="_blank"` + `rel="noopener noreferrer"`; heading levels are preserved from authored content when present, only synthesizing an `h1` as a documented fallback.
- **Block Collection comparison**: no direct Block Collection equivalent (brand-detail-page layout is site-specific); not a reinvention.
- **aem.js helpers**: correctly does *not* call `createOptimizedPicture` here since it reuses the already-optimized authored `<picture>` as-is (no custom breakpoint set needed), unlike `cards`/`brand-nav` which do need one — appropriate, not a gap.

## Not verifiable at this scope
- Whether the synthesized `<h1>` fallback ever collides with another authored `h1` elsewhere on the same page (heading-hierarchy check needs a live page).
- Real visual impact of the `h1` 38px vs. `--heading-font-size-xxl` 36px mismatch — needs a rendered comparison to confirm intent.
- Rendered focus order and contrast for the Browse Parts toggle/list and back link — requires a live/preview URL.
