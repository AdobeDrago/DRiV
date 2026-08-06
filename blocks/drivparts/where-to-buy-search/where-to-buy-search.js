import { sitePath } from '../../../scripts/drivparts-paths.js';

/**
 * Reads the authored value from a block row, preferring the second cell if present.
 * @param {Element|undefined} row
 * @returns {string}
 */
function authoredValue(row) {
  if (!row) return '';
  const cells = [...row.children];
  const valueCell = cells.length > 1 ? cells[1] : cells[0];
  return valueCell?.textContent.trim() || '';
}

/**
 * loads and decorates the where-to-buy-search block
 * Authored rows (from DA), by position:
 * 1 CTA button label. Row may be a single value cell, or key | value
 * (key is author-only and ignored).
 * @param {Element} block The block element
 */
export default function decorate(block) {
  const [ctaRow] = [...block.children];
  const ctaLabel = authoredValue(ctaRow) || 'Search';

  block.textContent = '';

  const shell = document.createElement('div');
  shell.className = 'where-to-buy-search-shell';
  shell.setAttribute('role', 'search');
  shell.setAttribute('aria-label', 'Where to buy search');

  const form = document.createElement('form');
  form.className = 'where-to-buy-search-form';
  form.action = sitePath('/where-to-buy');
  form.method = 'get';

  const field = document.createElement('label');
  field.className = 'where-to-buy-search-field';

  const srOnly = document.createElement('span');
  srOnly.className = 'sr-only';
  srOnly.textContent = 'Enter ZIP/Postal Code';

  const input = document.createElement('input');
  input.className = 'where-to-buy-search-input';
  input.name = 'zip';
  input.type = 'search';
  input.placeholder = 'Enter a ZIP/Postal Code';
  input.autocomplete = 'postal-code';

  field.append(srOnly, input);

  const button = document.createElement('button');
  button.className = 'where-to-buy-search-button';
  button.type = 'submit';
  button.textContent = ctaLabel;

  form.append(field, button);
  shell.append(form);
  block.append(shell);
}
