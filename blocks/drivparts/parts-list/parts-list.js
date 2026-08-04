import { loadCSS } from '../../../scripts/aem.js';
import {
  normalizeCartImageUrl,
  submitPartsListToCart,
} from '../../../scripts/storefront-session.js';

// localStorage-backed "My Parts List" + modal; dynamically imported from
// part-details so it's only fetched on first "Add To Parts List" click.
// QA key: "partsList" (ADD_TO_CART_PARTS_LIST).
const STORAGE_KEY = 'partsList';
const LEGACY_STORAGE_KEY = 'driv-parts-list';
const CHANGE_EVENT = 'partslist:change';
// Bump when cart POST field semantics change (e.g. drop catalog-brand prefix).
const CART_FORMAT_VERSION = '2';

function writeStorage(list) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // storage unavailable (e.g. private browsing quota) — state simply
    // won't persist across reloads, nothing else to do here.
  }
}

function migrateCartBrandCodes(list) {
  try {
    if (localStorage.getItem('partsList-cart-format') === CART_FORMAT_VERSION) return list;
    const migrated = list.map((item) => ({
      ...item,
      brandCode: '',
      brand_code: '',
    }));
    localStorage.setItem('partsList-cart-format', CART_FORMAT_VERSION);
    if (migrated.length) {
      writeStorage(migrated);
    }
    return migrated;
  } catch {
    return list;
  }
}

function itemKey(item) {
  return `${item.brand}::${item.partNumber}`;
}

function matchesItem(item, brand, partNumber) {
  return item.brand === brand && item.partNumber === partNumber;
}

/**
 * Coerce a storage/API row into the single camelCase shape used everywhere.
 * Returns null for corrupt or incomplete entries (localStorage is untrusted).
 * @param {unknown} item
 * @returns {{
 *   id: string,
 *   brand: string,
 *   partNumber: string,
 *   brandCode: string,
 *   qty: number,
 *   description: string,
 *   imageUrl: string,
 * } | null}
 */
function normalizeStoredItem(item) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
  const brand = String(item.brand || item.brand_name || '').trim();
  const partNumber = String(item.partNumber || item.part_number || '').trim();
  if (!partNumber) return null;
  const qty = Number(item.qty ?? item.quantity ?? 1);
  const brandCode = String(item.brandCode || item.brand_code || '').trim();
  return {
    id: String(item.id || `${partNumber}-${brandCode}`),
    brand,
    partNumber,
    brandCode,
    qty: Number.isFinite(qty) && qty >= 1 ? qty : 1,
    description: String(item.description || item.part_type || ''),
    imageUrl: normalizeCartImageUrl(String(item.imageUrl || '')),
  };
}

export function getPartsList() {
  try {
    let raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      raw = localStorage.getItem(LEGACY_STORAGE_KEY);
      if (raw) {
        localStorage.setItem(STORAGE_KEY, raw);
        localStorage.removeItem(LEGACY_STORAGE_KEY);
      }
    }
    const list = raw ? JSON.parse(raw) : [];
    const items = Array.isArray(list) ? list : [];
    const migrated = migrateCartBrandCodes(items);
    const normalized = migrated.map(normalizeStoredItem).filter(Boolean);
    // Drop corrupt rows silently so the modal never throws on bad storage.
    if (normalized.length !== migrated.length) {
      writeStorage(normalized);
    }
    return normalized;
  } catch {
    return [];
  }
}

function saveList(list) {
  writeStorage(list);
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: list }));
}

export function isInPartsList(brand, partNumber) {
  return getPartsList().some((i) => matchesItem(i, brand, partNumber));
}

export function addToPartsList(item) {
  const normalized = normalizeStoredItem(item);
  if (!normalized) return;
  const list = getPartsList();
  const existing = list.find((i) => itemKey(i) === itemKey(normalized));
  if (existing) {
    existing.qty += normalized.qty;
  } else {
    list.push(normalized);
  }
  saveList(list);
}

export function updatePartsListQty(brand, partNumber, qty) {
  const list = getPartsList();
  const found = list.find((i) => matchesItem(i, brand, partNumber));
  if (!found) return;
  found.qty = Math.max(1, Number(qty) || 1);
  saveList(list);
}

export function removeFromPartsList(brand, partNumber) {
  saveList(getPartsList().filter((i) => !matchesItem(i, brand, partNumber)));
}

export function clearPartsList() {
  saveList([]);
}

export function onPartsListChange(callback) {
  window.addEventListener(CHANGE_EVENT, callback);
  return () => window.removeEventListener(CHANGE_EVENT, callback);
}

let dialogEl = null;
let tbodyEl = null;
let emptyEl = null;
let statusEl = null;
let printBtnEl = null;
let cartBtnEl = null;
let clearBtnEl = null;
let unsubscribeChange = null;
/** Brand::partNumber fingerprint of the last rendered rows (skips remount on qty-only updates). */
let renderedFingerprint = '';

function setCartStatus(message, isError = false) {
  if (!statusEl) return;
  statusEl.textContent = message || '';
  statusEl.hidden = !message;
  statusEl.classList.toggle('parts-list-status-error', isError);
}

function syncToolbar(items) {
  const empty = !items.length;
  if (emptyEl) emptyEl.hidden = !empty;
  if (printBtnEl) printBtnEl.disabled = empty;
  if (cartBtnEl) cartBtnEl.disabled = empty;
  if (clearBtnEl) clearBtnEl.disabled = empty;
}

function listFingerprint(items) {
  return items.map((i) => itemKey(i)).join('|');
}

function renderRows() {
  if (!tbodyEl) return;
  const items = getPartsList();
  const fingerprint = listFingerprint(items);

  // Qty edits dispatch CHANGE_EVENT; remounting would steal focus from the input.
  if (fingerprint === renderedFingerprint && tbodyEl.rows.length === items.length) {
    items.forEach((item, index) => {
      const input = tbodyEl.rows[index]?.querySelector('.parts-list-qty-input');
      if (input && document.activeElement !== input) {
        input.value = String(item.qty);
      }
    });
    syncToolbar(items);
    return;
  }

  renderedFingerprint = fingerprint;
  tbodyEl.replaceChildren();
  items.forEach((item) => {
    const tr = document.createElement('tr');

    const tdBrand = document.createElement('td');
    tdBrand.textContent = item.brand;

    const tdNumber = document.createElement('td');
    tdNumber.textContent = item.partNumber;

    const tdDesc = document.createElement('td');
    tdDesc.textContent = item.description || '';

    const tdQty = document.createElement('td');
    const qtyInput = document.createElement('input');
    qtyInput.type = 'number';
    qtyInput.min = '1';
    qtyInput.step = '1';
    qtyInput.className = 'parts-list-qty-input';
    qtyInput.value = String(item.qty);
    qtyInput.setAttribute('aria-label', `Quantity for ${item.partNumber}`);
    qtyInput.addEventListener('change', () => {
      updatePartsListQty(item.brand, item.partNumber, qtyInput.value);
    });
    tdQty.append(qtyInput);

    // Inline SVG trash icon (avoids loading Font Awesome for one glyph).
    const tdRemove = document.createElement('td');
    tdRemove.className = 'parts-list-remove-cell';
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'parts-list-remove-btn';
    removeBtn.setAttribute('aria-label', `Remove ${item.partNumber} from parts list`);
    const trashIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    trashIcon.setAttribute('viewBox', '0 0 448 512');
    trashIcon.setAttribute('aria-hidden', 'true');
    trashIcon.classList.add('parts-list-trash-icon');
    const trashPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    trashPath.setAttribute('fill', 'currentColor');
    trashPath.setAttribute('d', 'M135.2 17.7L128 32H32C14.3 32 0 46.3 0 64S14.3 96 32 96H416c17.7 0 32-14.3 32-32s-14.3-32-32-32H320l-7.2-14.3C307.4 6.8 295.2 0 282 0H166c-13.2 0-25.4 6.8-30.8 17.7zM416 128H32L53.2 467c1.6 25.3 22.6 45 47.9 45H346.9c25.3 0 46.3-19.7 47.9-45L416 128z');
    trashIcon.append(trashPath);
    removeBtn.append(trashIcon);
    removeBtn.addEventListener('click', () => {
      removeFromPartsList(item.brand, item.partNumber);
    });
    tdRemove.append(removeBtn);

    tr.append(tdBrand, tdNumber, tdDesc, tdQty, tdRemove);
    tbodyEl.append(tr);
  });
  syncToolbar(items);
}

/**
 * QA: POST the whole list to /fme-cat-cart/entries/add. Guests are redirected
 * to Hybris sign-in; authenticated sessions continue to the cart.
 */
function handleAddToCart() {
  const items = getPartsList();
  if (!items.length) return;
  setCartStatus('');
  const result = submitPartsListToCart(items);
  if (!result.ok) {
    setCartStatus(result.reason, true);
  }
}

function buildDialog() {
  const dialog = document.createElement('dialog');
  dialog.className = 'parts-list-modal';
  dialog.setAttribute('aria-labelledby', 'parts-list-title');

  const titleBar = document.createElement('div');
  titleBar.className = 'parts-list-title-bar';

  // Title mark: two spans styled in CSS (matches drivparts.com dialog).
  const titleIcon = document.createElement('div');
  titleIcon.className = 'parts-list-title-icon';
  titleIcon.setAttribute('aria-hidden', 'true');
  titleIcon.append(document.createElement('span'), document.createElement('span'));

  const title = document.createElement('h2');
  title.id = 'parts-list-title';
  title.className = 'parts-list-title';
  title.textContent = 'My Parts List';
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'parts-list-close-btn';
  closeBtn.setAttribute('aria-label', 'Close');
  closeBtn.textContent = '×';
  closeBtn.addEventListener('click', () => dialog.close());
  titleBar.append(titleIcon, title, closeBtn);

  const toolbar = document.createElement('div');
  toolbar.className = 'parts-list-toolbar';

  printBtnEl = document.createElement('button');
  printBtnEl.type = 'button';
  printBtnEl.className = 'parts-list-print-btn';
  printBtnEl.textContent = 'Print List';
  printBtnEl.addEventListener('click', () => window.print());

  cartBtnEl = document.createElement('button');
  cartBtnEl.type = 'button';
  cartBtnEl.className = 'parts-list-cart-btn';
  cartBtnEl.textContent = 'Add To Cart';
  cartBtnEl.addEventListener('click', handleAddToCart);

  clearBtnEl = document.createElement('button');
  clearBtnEl.type = 'button';
  clearBtnEl.className = 'parts-list-clear-btn';
  clearBtnEl.textContent = 'Clear List';
  clearBtnEl.addEventListener('click', () => {
    if (!getPartsList().length) return;
    // Destructive clear — native confirm is intentional for this one-shot prompt.
    // eslint-disable-next-line no-alert
    if (!window.confirm('Clear all parts from your list?')) return;
    clearPartsList();
  });

  statusEl = document.createElement('p');
  statusEl.className = 'parts-list-status';
  statusEl.hidden = true;
  statusEl.setAttribute('role', 'alert');

  toolbar.append(printBtnEl, cartBtnEl, clearBtnEl, statusEl);

  const table = document.createElement('table');
  table.className = 'parts-list-table';
  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  [
    { label: 'Brand' },
    { label: 'Part Number' },
    { label: 'Description' },
    { label: 'Qty.' },
    { label: 'Remove', srOnly: true },
  ].forEach(({ label, srOnly }) => {
    const th = document.createElement('th');
    th.scope = 'col';
    if (srOnly) {
      const span = document.createElement('span');
      span.className = 'parts-list-sr-only';
      span.textContent = label;
      th.append(span);
    } else {
      th.textContent = label;
    }
    headRow.append(th);
  });
  thead.append(headRow);
  tbodyEl = document.createElement('tbody');
  table.append(thead, tbodyEl);

  emptyEl = document.createElement('p');
  emptyEl.className = 'parts-list-empty';
  emptyEl.textContent = 'Your parts list is empty.';
  emptyEl.hidden = true;

  const tableWrapper = document.createElement('div');
  tableWrapper.className = 'parts-list-table-wrapper';
  tableWrapper.append(table, emptyEl);

  dialog.append(titleBar, toolbar, tableWrapper);

  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close();
  });

  dialog.addEventListener('close', () => {
    unsubscribeChange?.();
    unsubscribeChange = null;
  });

  document.body.append(dialog);
  return dialog;
}

export async function openPartsListModal() {
  await loadCSS(`${window.hlx.codeBasePath}/blocks/drivparts/parts-list/parts-list.css`);
  if (!dialogEl) dialogEl = buildDialog();
  if (!unsubscribeChange) {
    unsubscribeChange = onPartsListChange(() => {
      if (dialogEl?.open) renderRows();
    });
  }
  renderRows();
  setCartStatus('');
  if (!dialogEl.open) dialogEl.showModal();
}
