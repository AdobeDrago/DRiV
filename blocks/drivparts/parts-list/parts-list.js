import { loadCSS } from '../../../scripts/aem.js';
import { submitPartsListToCart } from '../../../scripts/storefront-session.js';

// Shared "My Parts List" feature: a localStorage-backed list of parts the
// shopper has flagged, plus the "MY PARTS LIST" modal used to review it.
// Lives under blocks/drivparts/ (rather than scripts/) so it's dynamically imported —
// see part-details.js — and only fetched once a shopper actually clicks
// "Add To Parts List", instead of being bundled into every page that imports
// this file. The modal itself is a single instance appended to <body>
// lazily, so it isn't tied to any one block's markup.
// QA driv-part-list-modal uses localStorage key "partsList" (ADD_TO_CART_PARTS_LIST).
const STORAGE_KEY = 'partsList';
const LEGACY_STORAGE_KEY = 'driv-parts-list';
const CHANGE_EVENT = 'partslist:change';
// Bump when cart POST field semantics change (e.g. drop catalog-brand prefix).
const CART_FORMAT_VERSION = '2';

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
      localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
    }
    return migrated;
  } catch {
    return list;
  }
}

function itemKey(item) {
  const brand = item.brand || item.brand_name || '';
  const partNumber = item.partNumber || item.part_number || '';
  return `${brand}::${partNumber}`;
}

function normalizeStoredItem(item) {
  if (!item || typeof item !== 'object') return item;
  return {
    ...item,
    brand: item.brand || item.brand_name || '',
    partNumber: item.partNumber || item.part_number || '',
    brandCode: item.brandCode || item.brand_code || '',
    qty: item.qty ?? item.quantity ?? 1,
    description: item.description || item.part_type || '',
    imageUrl: item.imageUrl || '',
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
    return migrateCartBrandCodes(items).map(normalizeStoredItem);
  } catch {
    return [];
  }
}

function saveList(list) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // storage unavailable (e.g. private browsing quota) — state simply
    // won't persist across reloads, nothing else to do here.
  }
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: list }));
}

export function isInPartsList(brand, partNumber) {
  return getPartsList().some((i) => i.brand === brand && i.partNumber === partNumber);
}

export function addToPartsList(item) {
  const list = getPartsList();
  const existing = list.find((i) => itemKey(i) === itemKey(item));
  if (existing) {
    existing.qty += item.qty || 1;
  } else {
    list.push({ ...item, qty: item.qty || 1 });
  }
  saveList(list);
}

export function updatePartsListQty(brand, partNumber, qty) {
  const list = getPartsList();
  const found = list.find((i) => i.brand === brand && i.partNumber === partNumber);
  if (!found) return;
  found.qty = Math.max(1, Number(qty) || 1);
  saveList(list);
}

export function removeFromPartsList(brand, partNumber) {
  saveList(getPartsList().filter((i) => !(i.brand === brand && i.partNumber === partNumber)));
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
let statusEl = null;

function setCartStatus(message, isError = false) {
  if (!statusEl) return;
  statusEl.textContent = message || '';
  statusEl.hidden = !message;
  statusEl.classList.toggle('parts-list-status-error', isError);
}

function renderRows() {
  tbodyEl.innerHTML = '';
  getPartsList().forEach((item) => {
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
    qtyInput.className = 'parts-list-qty-input';
    qtyInput.value = String(item.qty);
    qtyInput.setAttribute('aria-label', `Quantity for ${item.partNumber}`);
    qtyInput.addEventListener('change', () => {
      updatePartsListQty(item.brand, item.partNumber, qtyInput.value);
    });
    tdQty.append(qtyInput);

    // The reference dialog renders this as the Font Awesome "fa-trash" glyph
    // (content: "\f1f8"). Rather than pulling in the Font Awesome font just
    // for one glyph, this reproduces the same trash-can silhouette as an
    // inline SVG path (no icons/ asset, no extra network request).
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
      renderRows();
    });
    tdRemove.append(removeBtn);

    tr.append(tdBrand, tdNumber, tdDesc, tdQty, tdRemove);
    tbodyEl.append(tr);
  });
}

/**
 * QA: POST the whole list to /fme-cat-cart/entries/add. Guests are redirected
 * to Hybris sign-in; authenticated sessions continue to the cart.
 */
async function handleAddToCart() {
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

  const titleBar = document.createElement('div');
  titleBar.className = 'parts-list-title-bar';

  // Circle-and-bar mark that sits to the left of the title, matching the
  // reference drivparts.com "MY PARTS LIST" dialog — drawn from two plain
  // spans rather than an icon asset (see styles/parts-list.css).
  const titleIcon = document.createElement('div');
  titleIcon.className = 'parts-list-title-icon';
  titleIcon.setAttribute('aria-hidden', 'true');
  titleIcon.append(document.createElement('span'), document.createElement('span'));

  const title = document.createElement('h2');
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

  const printBtn = document.createElement('button');
  printBtn.type = 'button';
  printBtn.className = 'parts-list-print-btn';
  printBtn.textContent = 'Print List';
  printBtn.addEventListener('click', () => window.print());

  const cartBtn = document.createElement('button');
  cartBtn.type = 'button';
  cartBtn.className = 'parts-list-cart-btn';
  cartBtn.textContent = 'Add To Cart';
  cartBtn.addEventListener('click', handleAddToCart);

  const clearBtn = document.createElement('button');
  clearBtn.type = 'button';
  clearBtn.className = 'parts-list-clear-btn';
  clearBtn.textContent = 'Clear List';
  clearBtn.addEventListener('click', () => {
    clearPartsList();
    renderRows();
  });

  statusEl = document.createElement('p');
  statusEl.className = 'parts-list-status';
  statusEl.hidden = true;
  statusEl.setAttribute('role', 'alert');

  toolbar.append(printBtn, cartBtn, clearBtn, statusEl);

  const table = document.createElement('table');
  table.className = 'parts-list-table';
  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  ['Brand', 'Part Number', 'Description', 'Qty.', ''].forEach((label) => {
    const th = document.createElement('th');
    th.textContent = label;
    headRow.append(th);
  });
  thead.append(headRow);
  tbodyEl = document.createElement('tbody');
  table.append(thead, tbodyEl);

  const tableWrapper = document.createElement('div');
  tableWrapper.className = 'parts-list-table-wrapper';
  tableWrapper.append(table);

  dialog.append(titleBar, toolbar, tableWrapper);

  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close();
  });

  document.body.append(dialog);
  return dialog;
}

export async function openPartsListModal() {
  await loadCSS(`${window.hlx.codeBasePath}/blocks/drivparts/parts-list/parts-list.css`);
  if (!dialogEl) dialogEl = buildDialog();
  renderRows();
  setCartStatus('');
  if (!dialogEl.open) dialogEl.showModal();
}
