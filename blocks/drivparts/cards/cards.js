import { createOptimizedPicture } from '../../../scripts/aem.js';

// Converts each authored row into an <li>, tagging cells as the logo image or the description/CTA.
function buildCardList(block) {
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

  return ul;
}

// Brand logos are small; re-optimize them so they stay crisp without upscaling.
function optimizeLogos(ul) {
  ul.querySelectorAll('picture > img').forEach((img) => img
    .closest('picture')
    .replaceWith(createOptimizedPicture(img.src, img.alt, false, [{ width: '500' }])));
}

// Turns the last card's CTA into a real button, matching the source's treatment of the final entry.
function makeButtonCta(p, a) {
  p.classList.add('cards-card-cta', 'cards-card-cta-button');
  a.classList.add('button');

  const icon = document.createElement('span');
  icon.className = 'cards-card-cta-icon';
  icon.setAttribute('aria-hidden', 'true');
  a.append(icon);
}

// Reverts the generic drivparts pill-button decoration so the CTA renders as a plain text link.
function makeTextLinkCta(p, a) {
  p.classList.remove('button-container');
  p.classList.add('cards-card-cta');
  a.classList.remove('button', 'primary', 'secondary', 'accent');
  a.classList.add('cards-card-link');
}

// Splits each card body into a description and a CTA: a button for the last card, else a text link.
function tagCardBodyContent(ul) {
  const items = [...ul.querySelectorAll(':scope > li')];
  items.forEach((li, index) => {
    const body = li.querySelector('.cards-card-body');
    if (!body) return;

    const isLastCard = index === items.length - 1;
    [...body.querySelectorAll(':scope > p')].forEach((p) => {
      const a = p.querySelector('a');
      if (!a) {
        p.classList.add('cards-card-description');
        return;
      }

      if (isLastCard) makeButtonCta(p, a);
      else makeTextLinkCta(p, a);
    });
  });
}

// Builds the brands directory list: each authored row becomes a logo + description/CTA list item.
export default function decorate(block) {
  const ul = buildCardList(block);
  optimizeLogos(ul);
  tagCardBodyContent(ul);
  block.replaceChildren(ul);
}
