import { sitePath } from '../../../scripts/drivparts-paths.js';

const DEFAULT_HEADING_TEXT = 'Brands';
const LIST_ID = 'brand-nav-list';

// Reads an optional first-row plain-text label that overrides the default heading.
function extractHeadingText(rows) {
  if (rows.length && !rows[0].querySelector('a') && rows[0].textContent.trim()) {
    const text = rows[0].textContent.trim();
    rows.shift().remove();
    return text;
  }
  return DEFAULT_HEADING_TEXT;
}

// Builds the <ul> of brand links from the remaining authored rows.
function buildList(rows) {
  const list = document.createElement('ul');
  list.className = 'brand-nav-list';
  list.id = LIST_ID;

  rows
    .map((row) => row.querySelector('a[href]'))
    .filter(Boolean)
    .forEach((a) => {
      const li = document.createElement('li');
      // overwrite rather than add: decorateButtons() already stamped a lone
      // link in its own <p>/<div> as `button` (the global MOOG-pill style)
      // before this block's decorate() ran
      a.className = 'brand-nav-link';
      li.append(a);
      list.append(li);
    });

  return list;
}

// Builds the heading row: accent tab + a "BRANDS" link + a separate expand/collapse toggle button.
function buildHeadingRow(block, headingText, listId) {
  const accent = document.createElement('span');
  accent.className = 'brand-nav-accent';
  accent.setAttribute('aria-hidden', 'true');

  const back = document.createElement('span');
  back.className = 'brand-nav-back';
  back.setAttribute('aria-hidden', 'true');

  const link = document.createElement('a');
  link.href = sitePath('/brands');
  link.className = 'brand-nav-heading-link';
  link.textContent = headingText;

  const icon = document.createElement('span');
  icon.className = 'brand-nav-toggle-icon';
  icon.setAttribute('aria-hidden', 'true');

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'brand-nav-toggle';
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-controls', listId);
  toggle.setAttribute('aria-label', `Toggle ${headingText} list`);
  toggle.append(icon);

  // At >=1024px the toggle is display:none (see brand-nav.css) and the list
  // is always visible, so this state only reflects reality below that
  // breakpoint — that's fine since a hidden button is out of the a11y tree.
  toggle.addEventListener('click', () => {
    const isOpen = block.classList.toggle('is-open');
    toggle.setAttribute('aria-expanded', String(isOpen));
  });

  const heading = document.createElement('div');
  heading.className = 'brand-nav-heading';
  heading.append(back, link, toggle);

  const headingRow = document.createElement('div');
  headingRow.className = 'brand-nav-heading-row';
  headingRow.append(accent, heading);
  return headingRow;
}

// Builds the brands sidebar: a "BRANDS" heading/accordion toggle plus the authored brand link list.
export default function decorate(block) {
  const rows = [...block.children];
  const headingText = extractHeadingText(rows);
  const list = buildList(rows);
  const headingRow = buildHeadingRow(block, headingText, list.id);

  block.replaceChildren(headingRow, list);
}
