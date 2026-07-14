// angled (up-right) arrow used as the card CTA
const ARROW_ICON = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
  <path d="M7 17 17 7M9 7h8v8" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

/**
 * Wrap the first word of an element's leading text in a span so it can be
 * styled (used for the featured card's two-tone title).
 * @param {Element} el element whose first text node should be split
 */
function highlightFirstWord(el) {
  const firstText = el.firstChild;
  if (!firstText || firstText.nodeType !== Node.TEXT_NODE) return;
  const match = firstText.textContent.match(/^(\s*)(\S+)([\s\S]*)$/);
  if (!match) return;
  const [, lead, firstWord, rest] = match;
  const span = document.createElement('span');
  span.className = 'card-highlight-word';
  span.textContent = firstWord;
  firstText.replaceWith(
    document.createTextNode(lead),
    span,
    document.createTextNode(rest),
  );
}

/**
 * Card collection — a responsive grid of product cards plus an optional
 * featured promo tile (a card with no CTA link) that spans two columns.
 * @param {Element} block the card-collection block element
 */
export default function decorate(block) {
  [...block.children].forEach((card) => {
    card.classList.add('card');
    const [imageWrap, bodyWrap] = card.children;
    imageWrap?.classList.add('card-image');
    if (!bodyWrap) return;
    bodyWrap.classList.add('card-body');

    const paras = [...bodyWrap.querySelectorAll(':scope > p')];
    const titleP = paras.find((p) => p.querySelector('strong')) || paras[0];
    titleP?.classList.add('card-title');
    paras.forEach((p) => {
      if (p !== titleP && !p.classList.contains('button-container') && !p.querySelector('a')) {
        p.classList.add('card-description');
      }
    });

    const cta = bodyWrap.querySelector('a[href]');
    if (cta) {
      // turn the authored link into a circular arrow-icon CTA
      const label = cta.getAttribute('title') || cta.textContent.trim() || 'Learn more';
      cta.className = 'card-cta';
      cta.setAttribute('aria-label', label);
      cta.innerHTML = ARROW_ICON;

      // drop the wrapping button-container paragraph, then split text vs. cta
      const wrapP = cta.closest('p');
      bodyWrap.append(cta);
      if (wrapP && wrapP !== cta && !wrapP.textContent.trim()) wrapP.remove();

      const text = document.createElement('div');
      text.className = 'card-text';
      [...bodyWrap.children].forEach((el) => { if (el !== cta) text.append(el); });
      bodyWrap.prepend(text);
    } else {
      // no CTA → featured promo tile (image background, two-tone title)
      card.classList.add('featured');
      if (titleP) highlightFirstWord(titleP.querySelector('strong') || titleP);
    }
  });
}
