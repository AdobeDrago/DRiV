// "brands" variant: rebuilds the block into a background layer plus an overlaid heading/intro.
function decorateBrands(block) {
  const picture = block.querySelector('picture');

  const background = document.createElement('div');
  background.className = 'hero-banner-background';
  if (picture) background.append(picture);

  const content = document.createElement('div');
  content.className = 'hero-banner-content';
  [...block.querySelectorAll(':scope > div')].forEach((row) => {
    if (row.querySelector('picture')) return;
    [...row.children].forEach((el) => content.append(el));
  });

  block.replaceChildren(background, content);
}

// Wraps the banner picture and CTA link into one clickable anchor, using the CTA text as its label.
function wrapInSingleLink(block, picture, link) {
  const anchor = document.createElement('a');
  anchor.href = link.href;
  anchor.className = 'hero-banner-link';
  if (link.target) anchor.target = link.target;
  anchor.setAttribute('aria-label', link.textContent.trim() || (picture.querySelector('img')?.alt ?? ''));

  anchor.appendChild(picture);
  const cell = link.closest('div') || block;
  const linkWrapper = link.parentElement;
  link.remove();
  if (linkWrapper && linkWrapper !== cell && linkWrapper.textContent.trim() === '' && !linkWrapper.querySelector('img, picture')) {
    linkWrapper.remove();
  }
  cell.querySelectorAll('p:empty').forEach((p) => p.remove());
  cell.prepend(anchor);
}

// Makes the whole banner image clickable using the authored CTA instead of a separate button.
export default function decorate(block) {
  if (block.classList.contains('brands')) {
    decorateBrands(block);
    return;
  }

  const picture = block.querySelector('picture');
  const link = block.querySelector('a[href]');

  if (!picture) {
    block.classList.add('no-image');
    return;
  }

  if (link) wrapInSingleLink(block, picture, link);
}
