import { createOptimizedPicture } from '../../scripts/aem.js';

// angled (up-right) arrow used as the card affordance
const ARROW_ICON = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
  <path d="M7 17 17 7M9 7h8v8" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

export default function decorate(block) {
  /* change to ul, li */
  const ul = document.createElement('ul');
  [...block.children].forEach((row) => {
    const li = document.createElement('li');
    while (row.firstElementChild) li.append(row.firstElementChild);
    [...li.children].forEach((div) => {
      if (div.children.length === 1 && div.querySelector('picture')) div.className = 'cards-card-image';
      else div.className = 'cards-card-body';
    });
    ul.append(li);
  });

  // replace images with optimized versions
  ul.querySelectorAll('picture > img').forEach((img) => img.closest('picture').replaceWith(createOptimizedPicture(img.src, img.alt, false, [{ width: '750' }])));

  // decorate each card: title/description, arrow affordance, whole-card link
  ul.querySelectorAll(':scope > li').forEach((li) => {
    const body = li.querySelector('.cards-card-body');
    if (!body) return;

    const cta = body.querySelector('a[href]');
    const href = cta ? cta.getAttribute('href') : null;

    const paras = [...body.querySelectorAll(':scope > p')];
    const titleP = paras.find((p) => p.querySelector('strong')) || paras[0];
    titleP?.classList.add('cards-card-title');
    paras.forEach((p) => {
      if (p !== titleP && !p.classList.contains('button-container') && !p.querySelector('a')) {
        p.classList.add('cards-card-description');
      }
    });

    // drop the authored CTA — the entire card becomes the link
    (cta?.closest('p') || cta)?.remove();

    // group the copy so the arrow can sit beside it
    const text = document.createElement('div');
    text.className = 'cards-card-text';
    [...body.children].forEach((el) => text.append(el));
    body.append(text);

    const arrow = document.createElement('span');
    arrow.className = 'cards-card-arrow';
    arrow.innerHTML = ARROW_ICON;
    body.append(arrow);

    // make the whole card clickable via a single wrapping link
    if (href) {
      const link = document.createElement('a');
      link.className = 'cards-card-link';
      link.href = href;
      link.setAttribute('aria-label', (titleP?.textContent || '').trim() || 'Learn more');
      while (li.firstChild) link.append(li.firstChild);
      li.append(link);
    }
  });

  block.replaceChildren(ul);
}
