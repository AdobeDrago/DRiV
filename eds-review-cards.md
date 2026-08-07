# EDS Block Review — drivparts/cards

**Date:** 2026-08-07 · **Repo:** `/Users/vishalsharma/Documents/DRiV` · **Evidence:** code-only (`blocks/drivparts/cards/cards.js`, `cards.css`)

**Verdict:** Solid override implementation — correct decorate export, proper use of `createOptimizedPicture`, no XSS sinks, clean mobile-first CSS. It's a deliberate site-specific override of the stock `cards` block (resolved via `DRIVPARTS_OVERRIDES`/`getBlockBasePath` in `scripts/aem.js:555-576`, not an accidental duplicate) for the brands-directory logo+description+CTA layout. Two Warnings worth fixing before this scales further: block CSS reaching into `main`/section layout coupled to a different block's presence, and a fragile "any paragraph with a link becomes a CTA" content assumption.

**Findings:** 0 Critical · 2 Warning · 2 Info

## Findings

### [Warning] Block CSS reaches outside the block, coupled to a different block's presence — `blocks/drivparts/cards/cards.css:11-13`
```css
main:has(.brand-nav.block) > .section.cards-container {
  margin: 0;
}
```
This rule doesn't stop at `.cards`/`.cards-wrapper`/`.cards-container` — it reaches up to `main` and keys off `.brand-nav.block` being present *elsewhere on the page* to zero out this section's margin. That's the same category of issue flagged in the `brand-nav` review (block CSS smuggling page/section layout instead of keeping it block-scoped) and it creates an implicit, undocumented-in-content contract between two unrelated block folders: if a future page uses `cards` without `brand-nav`, or `brand-nav` without `cards`, this rule silently does nothing or misfires. It also duplicates the page-layout home you already established: `styles/drivparts.css` now owns the other `main:has(.brand-nav.block)` rules from the brand-nav fix.

**Fix:** Move this rule into `styles/drivparts.css` next to the other `main:has(.brand-nav.block)` rules (added during the brand-nav review), so all the brands-directory-page layout logic lives in one place instead of being split across two blocks' CSS files.
```css
/* styles/drivparts.css, alongside the existing main:has(.brand-nav.block) rules */
main:has(.brand-nav.block) > .section.cards-container {
  margin: 0;
}
```

### [Warning] Any paragraph containing a link is reclassified as a CTA, not just a dedicated CTA paragraph — `blocks/drivparts/cards/cards.js:54-63`
```js
[...body.querySelectorAll(':scope > p')].forEach((p) => {
  const a = p.querySelector('a');
  if (!a) { p.classList.add('cards-card-description'); return; }
  if (isLastCard) makeButtonCta(p, a);
  else makeTextLinkCta(p, a);
});
```
The check is "does this paragraph contain a link anywhere," not "is this paragraph *only* a link." If an author writes a description paragraph with an inline link (e.g. "See our full return policy for details"), that entire paragraph gets stripped of `cards-card-description` treatment and turned into `cards-card-link`/`cards-card-cta-button` styling — losing the surrounding sentence's normal text formatting and likely breaking the layout (a CTA-styled full paragraph of prose). The stock `blocks/cards/cards.js` avoids this by only acting on `body.querySelector('a[href]')` once and removing just that CTA's own paragraph, not reclassifying every paragraph that happens to contain a link.

**Fix:** Only treat a paragraph as a CTA when the link is its sole content, e.g.:
```js
[...body.querySelectorAll(':scope > p')].forEach((p) => {
  const a = p.querySelector(':scope > a:only-child');
  if (!a) { p.classList.add('cards-card-description'); return; }
  if (isLastCard) makeButtonCta(p, a);
  else makeTextLinkCta(p, a);
});
```

## Info

### [Info] Which card gets the button CTA is implicit (last authored row), with no authorable signal
`tagCardBodyContent` (`cards.js:47-65`) always turns the *last* row's CTA into a primary button and every other row's into a text link, purely by array index. There's no way for an author reading the table, or reordering rows, to see or control this — adding a new brand row after the "final" one silently moves the button, and reordering rows moves it too. If the button-on-last-card treatment is an intentional design pattern (e.g. a "view all brands" style row), consider noting it in author-facing documentation; if any row should be able to opt into the button treatment, an explicit signal (e.g. bold-wrapping the link, as `decorateButtons` already differentiates `strong`/`em`) would make it authorable instead of position-dependent.

### [Info] `text-align: justify` on card descriptions — `blocks/drivparts/cards/cards.css:65`
Justified body text can produce uneven word spacing ("rivers") that hurts readability, especially at the narrow column widths used here (`.cards-card-description` sits in a `1fr` grid column on mobile). Not a hard accessibility failure, but `text-align: left` is generally recommended over `justify` for body copy.

## Checked and clean
- **Decorate export**: `export default function decorate(block)` present, synchronous, folder/file/class name (`cards`) consistent with the block's resolved name.
- **Defensive DOM handling**: `buildCardList` and `tagCardBodyContent` guard against a missing `.cards-card-body` (`if (!body) return`) and a missing anchor (`if (!a) {...return}`) before touching them.
- **Vanilla JS**: no frameworks, no runtime `node_modules` deps.
- **CSS scoping**: all rules besides the flagged `main:has()` one are correctly scoped under `.cards`, `.section.cards-container` (the auto-generated `{name}-container` class per `aem.js:630`), or `.cards-card-*` private classes.
- **CSS craft**: mobile-first (base rules unwrapped, `@media (width >= 768px)` layers desktop/tablet), no `!important`, consistent use of CSS custom properties with fallbacks.
- **Class/selector maps**: none — literal classes assigned directly.
- **Shared helpers**: uses `createOptimizedPicture` from `scripts/aem.js` correctly for logo re-optimization; no reinvented image/metadata helpers.
- **Constants**: no repeated magic strings/numbers needing extraction.
- **Async/API robustness**: N/A — block does no fetching.
- **XSS/untrusted sinks**: no `innerHTML`/`insertAdjacentHTML`/`eval`; all DOM assembly via `append`/`classList`, all content is authored (trusted) markup.
- **a11y**: CTA icon spans are `aria-hidden="true"` and sit inside anchors that already carry visible text, so accessible names aren't lost; alt text is preserved through `createOptimizedPicture(img.src, img.alt, ...)`; no headings injected/skipped.
- **Block Collection comparison**: this is a deliberate, code-documented override (`DRIVPARTS_OVERRIDES` in `scripts/aem.js:555-562`) of the stock `cards` block for a different authoring need (logo/description/CTA directory row vs. whole-card link), not an accidental reinvention — the two implementations diverge appropriately for their distinct content models.
- **aem.js helpers**: `createOptimizedPicture` used correctly; no `getMetadata`/`decorateIcons`/`readBlockConfig` reinvention.

## Not verifiable at this scope
- Real-world layout impact of the flagged inline-link CTA bug — would need an authored test row with a link inside prose to confirm the visual break.
- Whether the last-card-gets-a-button pattern matches design intent — that's a product/design call, not verifiable from code alone.
- Rendered focus order, contrast, and justified-text readability at actual breakpoints — requires a live/preview URL.
