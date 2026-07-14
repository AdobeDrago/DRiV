/**
 * Hero block — yellow promo banner with an eyebrow, heading, body copy,
 * two CTAs and a product image. This is the default variation.
 *
 * Authored structure (single cell):
 *   picture | eyebrow <p> | <h1> | body <p> | CTA <p> (strong>a + em>a)
 */
export default function decorate(block) {
  const cell = block.querySelector(':scope > div > div') || block;

  // lift the image out into its own background layer
  const picture = block.querySelector('picture');
  const background = document.createElement('div');
  background.className = 'hero-background';
  if (picture) background.append(picture);

  // group the remaining copy
  const content = document.createElement('div');
  content.className = 'hero-content';
  [...cell.children].forEach((el) => {
    // skip the now-empty paragraph that wrapped the picture
    if (el.tagName === 'P' && !el.textContent.trim() && !el.querySelector('a, img, picture')) return;
    content.append(el);
  });

  // eyebrow = the paragraph immediately before the heading
  const heading = content.querySelector('h1, h2');
  const eyebrow = heading && heading.previousElementSibling;
  if (eyebrow && eyebrow.tagName === 'P') eyebrow.classList.add('hero-eyebrow');

  // highlight variation: colour the first word of the heading
  if (block.classList.contains('highlight') && heading) {
    const firstText = heading.firstChild;
    if (firstText && firstText.nodeType === Node.TEXT_NODE) {
      const match = firstText.textContent.match(/^(\s*)(\S+)([\s\S]*)$/);
      if (match) {
        const [, lead, firstWord, rest] = match;
        const word = document.createElement('span');
        word.className = 'hero-highlight-word';
        word.textContent = firstWord;
        firstText.replaceWith(
          document.createTextNode(lead),
          word,
          document.createTextNode(rest),
        );
      }
    }
  }

  // buttonize the CTAs (authored together in one paragraph: strong=primary, em=secondary)
  const cta = [...content.querySelectorAll('p')].find((p) => p.querySelector('a'));
  if (cta) {
    cta.classList.add('button-container');
    [...cta.querySelectorAll('a')].forEach((a) => {
      const wrap = a.parentElement;
      a.classList.add('button');
      if (wrap.tagName === 'EM') a.classList.add('secondary');
      if (wrap.tagName === 'STRONG' || wrap.tagName === 'EM') wrap.replaceWith(a);
    });
  }

  block.textContent = '';
  block.append(content, background);
}
