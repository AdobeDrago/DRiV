import { createOptimizedPicture } from '../../../scripts/aem.js';

/**
 * DriveParts cards block.
 *
 * On DriveParts pages this overrides the stock cards block. The brands
 * directory (brands.html) authors a `cards list` variant: each entry is a
 * full-width row with the brand logo on the left and a description plus a
 * visible "Learn More" link on the right (matches the source design).
 *
 * Authored structure per row (two cells):
 *   [ logo <picture> ] | [ description <p> , CTA <p><a> ]
 *
 * @param {Element} block The block element
 */
export default function decorate(block) {
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

  // brand logos are small; keep them crisp without upscaling
  ul.querySelectorAll('picture > img').forEach((img) => img
    .closest('picture')
    .replaceWith(createOptimizedPicture(img.src, img.alt, false, [{ width: '500' }])));

  ul.querySelectorAll(':scope > li').forEach((li) => {
    const body = li.querySelector('.cards-card-body');
    if (!body) return;

    [...body.querySelectorAll(':scope > p')].forEach((p) => {
      const a = p.querySelector('a');
      if (a) {
        // the generic drivparts button decoration runs before blocks and can
        // turn a standalone link into a pill button — revert that so the CTA
        // renders as a plain text link like the source
        p.classList.remove('button-container');
        p.classList.add('cards-card-cta');
        a.classList.remove('button', 'primary', 'secondary', 'accent');
        a.classList.add('cards-card-link');
      } else {
        p.classList.add('cards-card-description');
      }
    });
  });

  block.replaceChildren(ul);
}
