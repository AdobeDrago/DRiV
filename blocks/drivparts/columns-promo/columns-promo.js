/**
 * Normalises heading levels inside a container so no level is skipped.
 * Walks headings in DOM order; whenever a heading jumps more than one level
 * down from the previous heading (e.g. h2 → h4) it is replaced with the
 * correct next level (h3 in that example), preserving all attributes and
 * child nodes.
 * @param {Element} container
 */
function normalizeHeadings(container) {
  const headings = [...container.querySelectorAll('h1,h2,h3,h4,h5,h6')];
  let prevLevel = 0;
  headings.forEach((heading) => {
    const level = parseInt(heading.tagName[1], 10);
    const expected = prevLevel === 0 ? level : Math.min(level, prevLevel + 1);
    if (expected !== level) {
      const replacement = document.createElement(`h${expected}`);
      [...heading.attributes].forEach((attr) => replacement.setAttribute(attr.name, attr.value));
      replacement.append(...heading.childNodes);
      heading.replaceWith(replacement);
    }
    prevLevel = expected;
  });
}

export default function decorate(block) {
  const prefix = 'columns-promo';
  const firstRow = block.firstElementChild;
  if (!firstRow) return;
  const cols = [...firstRow.children];
  block.classList.add(`${prefix}-${cols.length}-cols`);

  [...block.children].forEach((row) => {
    [...row.children].forEach((col) => {
      const pic = col.querySelector('picture');
      if (pic) {
        const picWrapper = pic.closest('div');
        if (picWrapper && picWrapper.children.length === 1) {
          picWrapper.classList.add(`${prefix}-img-col`);
        }
      }
    });
  });

  normalizeHeadings(block);
}
