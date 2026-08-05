/*
 * Renders the parts list at `/results`, linked to by the Parts Finder block.
 * Reuses its dropdown/lookup builders for the compact refine-search toolbar.
 */

import { loadCSS, createOptimizedPicture } from '../../../scripts/aem.js';
import { sitePath } from '../../../scripts/drivparts-paths.js';
import {
  brandLogoUrl,
  buildCatalogUrl,
  fetchBrandLogoMap,
  fetchJson,
  getDescriptionContents,
  resolveImageUrl,
  whereToBuyUrl,
} from '../../../scripts/catalog.js';
import {
  createDropdown,
  buildVehiclePanel,
  buildEnginePanel,
  closeAllDropdowns,
  setLookupHref,
} from '../parts-finder/parts-finder.js';

// Prefers the DAM's small thumbnail rendition over the full-resolution primary asset.
function resolveThumbnailUrl(damAssets) {
  const thumbnail = damAssets?.productThumbnails?.[0]?.url;
  const primary = damAssets?.productPrimaries?.[0]?.url;
  return resolveImageUrl(thumbnail || primary);
}

// Falls back to a text label if there's no logo, or if the resolved logo URL fails to load
// -- keeps the brand identifiable instead of a header/panel silently going blank.
function buildBrandLogo(brandName, logoUrl, imgClassName) {
  if (!logoUrl) {
    const name = document.createElement('span');
    name.textContent = brandName;
    return name;
  }
  const picture = createOptimizedPicture(logoUrl, brandName, false, [{ width: '100' }]);
  const img = picture.querySelector('img');
  if (imgClassName) img.className = imgClassName;
  img.addEventListener('error', () => {
    const name = document.createElement('span');
    name.textContent = brandName;
    picture.replaceWith(name);
  });
  return picture;
}

/**
 * Wires a tablist + panels with aria roles, roving tabindex, and arrow-key nav.
 * @param {HTMLElement} tabList
 * @param {Array<{ tab: HTMLButtonElement, panel: HTMLElement }>} entries
 * @param {string} [label]
 */
function wireTabGroup(tabList, entries, label) {
  tabList.setAttribute('role', 'tablist');
  if (label) tabList.setAttribute('aria-label', label);

  const selectTab = (activeIndex) => {
    entries.forEach(({ tab, panel }, index) => {
      const selected = index === activeIndex;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
      tab.classList.toggle('is-active', selected);
      panel.hidden = !selected;
    });
  };

  entries.forEach(({ tab, panel }, index) => {
    const tabId = tab.id || `results-tab-${index}`;
    const panelId = panel.id || `results-panel-${index}`;
    tab.id = tabId;
    panel.id = panelId;
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-controls', panelId);
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', tabId);
    tab.addEventListener('click', () => selectTab(index));
  });

  tabList.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    const tabs = entries.map(({ tab }) => tab);
    const current = tabs.indexOf(document.activeElement);
    if (current < 0) return;
    event.preventDefault();
    const next = event.key === 'ArrowRight'
      ? (current + 1) % tabs.length
      : (current - 1 + tabs.length) % tabs.length;
    selectTab(next);
    tabs[next].focus();
  });

  selectTab(0);
}

// `eager`: this page's LCP element is one of the first few result rows'
// images (no hero image competes with it there), and which row varies by
// search -- not reliably row 0. Callers pass `eager` for the first 3 rows;
// every row after that stays `loading="lazy"`, since eagering all of them
// would cost bandwidth/requests for images that are below the fold.
function buildProductImage(className, imageUrl, altText, sizeAttrs = {}, { eager = false } = {}) {
  const div = document.createElement('div');
  div.className = className;
  if (imageUrl) {
    const img = document.createElement('img');
    img.src = imageUrl;
    img.alt = altText || '';
    img.loading = eager ? 'eager' : 'lazy';
    Object.assign(img, sizeAttrs);
    div.appendChild(img);
  } else {
    div.classList.add(`${className}-placeholder`);
  }
  return div;
}

function readBracketParam(sp, name) {
  return sp.get(`${name}[value]`) || '';
}

function readBracketLabel(sp, name) {
  return sp.get(`${name}[label]`) || '';
}

function isEquipmentSearch(initial) {
  return Boolean(initial.vehicleValue && initial.mfrValue && initial.equipmentModelValue);
}

function isYmmSearch(initial) {
  return Boolean(initial.yearValue && initial.makeValue && initial.modelValue);
}

function isEngineSearch(initial) {
  return Boolean(initial.heavyMfrValue && initial.heavyBaseValue);
}

// Vehicle/equipment → api.catalog.corporate.partslist; engine → api.engine.heavyduty.partlist.
function buildPartsListRequest(initial, page = 1) {
  const shared = {
    page,
    limit: 50,
    view_type: initial.viewType,
    brand_codes: 'brand',
    own_brand: 'corporate',
  };

  if (initial.searchType === 'heavy') {
    const params = {
      ...shared,
      vehicle_group_ids: initial.vehicleGroupIdsValue || '90023',
      engine_mfr_id: initial.heavyMfrValue,
      engine_base_id: initial.heavyBaseValue,
    };
    if (initial.engineFilter) params.engine_version_id = initial.engineFilter;
    return {
      endpoint: 'api.engine.heavyduty.partlist',
      params,
    };
  }

  if (isEquipmentSearch(initial)) {
    const params = {
      ...shared,
      vehicle_type_id: initial.vehicleValue,
      mfr_id: initial.mfrValue,
      equipment_model_id: initial.equipmentModelValue,
      vehicle_group_ids: initial.typeValue,
    };
    if (initial.yearValue) params.year_id = initial.yearValue;
    return { endpoint: 'api.catalog.corporate.partslist', params };
  }

  return {
    endpoint: 'api.catalog.corporate.partslist',
    params: {
      ...shared,
      year_id: initial.yearValue,
      make_id: initial.makeValue,
      model_id: initial.modelValue,
      vehicle_group_ids: initial.typeValue,
    },
  };
}

// `&page=N` in the address bar (omit on page 1) so back/forward steps pages.
function updatePageInUrl(page, totalPages, { replace = false } = {}) {
  const url = new URL(window.location.href);
  if (totalPages > 1) url.searchParams.set('page', String(page));
  else url.searchParams.delete('page');
  if (url.href === window.location.href) return;
  if (replace) window.history.replaceState({ page }, '', url);
  else window.history.pushState({ page }, '', url);
}

function updateViewTypeInUrl(viewType) {
  const url = new URL(window.location.href);
  if (viewType === 'grid') url.searchParams.set('viewType', 'grid');
  else url.searchParams.delete('viewType');
  if (url.href === window.location.href) return;
  window.history.pushState({}, '', url);
}

function buildPartDetailsUrl({ brandCode, partNumber, partName }) {
  if (!brandCode || !partNumber) return '#';
  const params = new URLSearchParams({
    brand_code: brandCode,
    part_number: partNumber,
    part_name: partName || '',
  });
  return `${sitePath('/part-details')}?${params.toString()}`;
}

// Encodes refine-panel selections as the nested `additional_filters` query string
// the catalog API expects (e.g. `brand_codes=BBKH&category_ids=12`).
function buildAdditionalFilters(filterState) {
  const parts = [];
  if (filterState.brands.size) {
    parts.push(`brand_codes=${[...filterState.brands].join(',')}`);
  }
  if (filterState.subBrands.size) {
    parts.push(`sub_brand_codes=${[...filterState.subBrands].join(',')}`);
  }
  if (filterState.categories.size) {
    parts.push(`category_ids=${[...filterState.categories].join(',')}`);
  }
  if (filterState.subCategories.size) {
    parts.push(`sub_category_ids=${[...filterState.subCategories].join(',')}`);
  }
  if (filterState.partTypes.size) {
    const entries = [...filterState.partTypes].map((id) => {
      const positions = filterState.positionsByPartType.get(id);
      if (positions?.size) {
        return `{part_type_id:${id},position_ids:[${[...positions].join(',')}]}`;
      }
      return `{part_type_id:${id}}`;
    });
    parts.push(`part_types_and_positions_json=[${entries.join(',')}]`);
  }
  filterState.configs.forEach((ids, type) => {
    if (ids.size) parts.push(`${type}_ids=${[...ids].join(',')}`);
  });
  if (filterState.qualifiers?.size) {
    [...filterState.qualifiers].forEach((value) => {
      parts.push(`qualifiers[]=${encodeURIComponent(value)}`);
    });
  }
  return parts.join('&');
}

function clearFilterState(filterState) {
  filterState.brands.clear();
  filterState.subBrands.clear();
  filterState.categories.clear();
  filterState.subCategories.clear();
  filterState.partTypes.clear();
  filterState.positionsByPartType.clear();
  filterState.configs.forEach((ids) => ids.clear());
  filterState.qualifiers?.clear();
}

function hasActiveFilters(filterState) {
  return Boolean(
    filterState.brands.size
    || filterState.subBrands.size
    || filterState.categories.size
    || filterState.subCategories.size
    || filterState.partTypes.size
    || [...filterState.configs.values()].some((ids) => ids.size)
    || filterState.qualifiers?.size,
  );
}

// Auto-selects the first heavy-duty engine version when the URL has no `engineFilter`.
async function resolveEngineFilter(initial) {
  if (initial.engineFilter) return initial.engineFilter;
  const result = await fetchJson(buildCatalogUrl('api.engine.heavyduty.versions', {
    vehicle_group_ids: initial.vehicleGroupIdsValue || '90023',
    engine_base_id: initial.heavyBaseValue,
    engine_mfr_id: initial.heavyMfrValue,
    own_brand: 'corporate',
    brand_codes: 'brand',
  }));
  if (!result.ok) return '';
  const first = result.data.engine_versions?.[0];
  return first?.id != null ? String(first.id) : '';
}

function buildToolbarSummaryText(initial) {
  if (isEngineSearch(initial) || initial.searchType === 'heavy') {
    return [initial.vehicleGroupIdsLabel, initial.heavyMfrLabel, initial.heavyBaseLabel]
      .filter(Boolean).join(', ');
  }
  if (isEquipmentSearch(initial)) {
    return [initial.typeLabel, initial.vehicleLabel, initial.mfrLabel, initial.equipmentModelLabel]
      .filter(Boolean).join(', ');
  }
  return [initial.typeLabel, initial.yearValue, initial.makeLabel, initial.modelLabel]
    .filter(Boolean).join(', ');
}

function buildPartNumberPanel(panel, initialValue) {
  panel.classList.add('results-toolbar-part-panel');
  panel.innerHTML = `
    <div class="parts-finder-field">
      <input type="text" class="results-toolbar-part-input" placeholder="Part #" />
    </div>
    <a href="#" class="parts-finder-lookup results-toolbar-search" aria-disabled="true" tabindex="-1">Search</a>
  `;
  const input = panel.querySelector('.results-toolbar-part-input');
  const link = panel.querySelector('.parts-finder-lookup');
  input.value = initialValue || '';

  const updateLink = () => {
    const value = input.value.trim();
    if (!value) {
      setLookupHref(link, null);
      return;
    }
    const params = new URLSearchParams({ searchType: 'part-number-search', part: value });
    setLookupHref(link, `${sitePath('/results')}?${params.toString()}`);
  };
  input.addEventListener('input', updateLink);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && link.getAttribute('href')) {
      event.preventDefault();
      window.location.href = link.href;
    }
  });
  updateLink();
}

async function buildToolbar(uid, initial) {
  loadCSS('/blocks/drivparts/parts-finder/parts-finder.css');

  const toolbar = document.createElement('div');
  toolbar.className = 'results-toolbar';

  const summaryBar = document.createElement('button');
  summaryBar.type = 'button';
  summaryBar.className = 'results-toolbar-summary';
  summaryBar.setAttribute('aria-expanded', 'false');
  const summaryLabel = document.createElement('span');
  summaryLabel.className = 'results-toolbar-summary-label';
  summaryLabel.textContent = buildToolbarSummaryText(initial) || 'Vehicle Search';
  const summaryIcon = document.createElement('span');
  summaryIcon.className = 'results-toolbar-summary-icon';
  summaryIcon.textContent = '+';
  summaryIcon.setAttribute('aria-hidden', 'true');
  summaryBar.append(summaryLabel, summaryIcon);
  toolbar.append(summaryBar);

  const scope = document.createElement('div');
  scope.className = 'parts-finder results-toolbar-scope';

  const modeField = document.createElement('div');
  modeField.className = 'parts-finder-field results-toolbar-mode';

  const fieldsWrap = document.createElement('div');
  fieldsWrap.className = 'results-toolbar-fields';

  const vehiclePanel = document.createElement('div');
  const enginePanel = document.createElement('div');
  const partNumberPanel = document.createElement('div');
  enginePanel.hidden = true;
  partNumberPanel.hidden = true;

  fieldsWrap.append(vehiclePanel, enginePanel, partNumberPanel);
  scope.append(modeField, fieldsWrap);
  toolbar.append(scope);
  buildPartNumberPanel(partNumberPanel, initial.partValue);

  summaryBar.addEventListener('click', () => {
    const expanded = toolbar.classList.toggle('is-expanded');
    summaryBar.setAttribute('aria-expanded', String(expanded));
    summaryIcon.textContent = expanded ? '−' : '+';

    const firstRow = document.querySelector('.results-list > .results-row');
    const wtb = firstRow?.querySelector('.results-row-where-to-buy');
    if (expanded && firstRow && wtb) {
      const panelBottom = scope.getBoundingClientRect().bottom;
      const wtbTop = wtb.getBoundingClientRect().top;
      const gap = 16;
      const spacerHeight = Math.max(0, panelBottom + gap - wtbTop);
      firstRow.style.setProperty('--collapsed-row-spacer', `${spacerHeight}px`);
    } else if (firstRow) {
      firstRow.style.removeProperty('--collapsed-row-spacer');
    }
  });

  const modeDropdown = createDropdown({ id: `${uid}-mode`, label: 'Search mode' });
  modeField.append(modeDropdown.root);
  modeDropdown.setOptions([
    { value: 'vehicle', label: 'Vehicle search' },
    { value: 'part-number', label: 'Part Number / Interchange' },
    { value: 'heavy', label: 'Engine search' },
    { value: 'performance', label: 'Performance search', disabled: true },
    { value: 'vin', label: 'VIN search', disabled: true },
    { value: 'specification', label: 'Specification search', disabled: true },
  ]);
  modeDropdown.setDisabled(false);

  const vehicleController = buildVehiclePanel(vehiclePanel, uid, 'Search', { defer: true });
  const engineController = buildEnginePanel(enginePanel, uid, 'Search');
  let engineActivated = false;

  vehiclePanel.querySelectorAll('.parts-finder-lookup').forEach((link) => {
    link.classList.add('results-toolbar-search');
  });
  enginePanel.querySelectorAll('.parts-finder-lookup').forEach((link) => {
    link.classList.add('results-toolbar-search');
  });

  const setMode = (mode) => {
    vehiclePanel.hidden = mode !== 'vehicle';
    enginePanel.hidden = mode !== 'heavy';
    partNumberPanel.hidden = mode !== 'part-number';
  };

  const ensureEngineReady = async (selection) => {
    if (!engineActivated) {
      engineActivated = true;
      if (selection) await engineController.setSelection(selection);
      else engineController.activate();
      return;
    }
    if (selection) await engineController.setSelection(selection);
  };

  let initialMode = 'vehicle';
  if (initial.searchType === 'heavy') initialMode = 'heavy';
  else if (initial.searchType === 'part-number-search') initialMode = 'part-number';
  modeDropdown.setValue(initialMode);
  modeDropdown.onChange(() => {
    closeAllDropdowns();
    setMode(modeDropdown.value);
    if (modeDropdown.value === 'heavy') ensureEngineReady();
  });
  setMode(modeDropdown.value);

  (async () => {
    if (modeDropdown.value === 'vehicle') {
      if (isEquipmentSearch(initial) || isYmmSearch(initial)) {
        await vehicleController.setSelection({
          typeValue: initial.typeValue,
          yearValue: initial.yearValue,
          makeValue: initial.makeValue,
          modelValue: initial.modelValue,
          vehicleValue: initial.vehicleValue,
          mfrValue: initial.mfrValue,
          equipmentModelValue: initial.equipmentModelValue,
        });
      } else {
        vehicleController.activate();
      }
    } else if (modeDropdown.value === 'heavy') {
      if (isEngineSearch(initial)) {
        await ensureEngineReady({
          mfrValue: initial.heavyMfrValue,
          baseValue: initial.heavyBaseValue,
        });
      } else {
        await ensureEngineReady();
      }
    }
  })().catch((err) => {
    // eslint-disable-next-line no-console
    console.error('results: failed to restore toolbar selection from URL', err);
  });

  return toolbar;
}

function buildListRow(app, { eager = false } = {}) {
  const li = document.createElement('li');
  li.className = 'results-row';

  const imageUrl = resolveThumbnailUrl(app.dam_assets);
  const imageDiv = buildProductImage(
    'results-row-image',
    imageUrl,
    app.part_name,
    { width: 100, height: 100 },
    { eager },
  );

  const href = buildPartDetailsUrl({
    brandCode: app.brand,
    partNumber: app.part_number,
    partName: app.part_name,
  });

  const brandName = app.brand_name || app.wtb_brand_name || '';
  const brandLabel = app.sub_brand_name ? `${brandName} - ${app.sub_brand_name}` : brandName;

  const partNumberEl = document.createElement('p');
  partNumberEl.className = 'results-row-part-number';
  const partNumberLink = document.createElement('a');
  partNumberLink.href = href;
  partNumberLink.textContent = app.part_number;
  const brandEl = document.createElement('span');
  brandEl.className = 'results-row-brand';
  brandEl.textContent = brandLabel;
  partNumberEl.append('Part No: ', partNumberLink, brandEl);

  const partNameEl = document.createElement('p');
  partNameEl.className = 'results-row-part-name';
  const partNameLink = document.createElement('a');
  partNameLink.href = href;
  partNameLink.textContent = app.product || app.part_type || app.part_name || '';
  partNameEl.appendChild(partNameLink);

  const titleBlock = document.createElement('div');
  titleBlock.className = 'results-row-title';
  titleBlock.append(partNumberEl, partNameEl);

  const whereToBuy = document.createElement('a');
  whereToBuy.className = 'button primary results-row-where-to-buy';
  whereToBuy.href = whereToBuyUrl('store', brandName);
  whereToBuy.textContent = 'Where To Buy';

  const header = document.createElement('div');
  header.className = 'results-row-header';
  header.append(titleBlock, whereToBuy);

  const criteria = document.createElement('div');
  criteria.className = 'results-row-criteria';
  const criteriaHeading = document.createElement('p');
  criteriaHeading.className = 'results-row-criteria-heading';
  criteriaHeading.textContent = 'Application Criteria';
  criteria.append(criteriaHeading);

  const appendCriteria = (label, value) => {
    if (value == null || value === '') return;
    const row = document.createElement('p');
    const labelEl = document.createElement('span');
    labelEl.className = 'results-row-criteria-label';
    labelEl.textContent = `${label}:`;
    row.append(labelEl, ` ${value}`);
    criteria.append(row);
  };

  appendCriteria('Position', app.position?.value);
  appendCriteria('Engine base', app.engine_base_value?.value ?? app.engine_base_value);
  appendCriteria('Application quantity', app.qty);

  const details = document.createElement('div');
  details.className = 'results-row-details';
  details.appendChild(criteria);

  if (app.additional_fit_criteria) {
    const qualifiers = document.createElement('div');
    qualifiers.className = 'results-row-qualifiers';
    const qualifiersHeading = document.createElement('p');
    qualifiersHeading.className = 'results-row-qualifiers-heading';
    qualifiersHeading.textContent = 'Qualifiers:';
    const qualifiersValue = document.createElement('p');
    qualifiersValue.textContent = app.additional_fit_criteria;
    qualifiers.append(qualifiersHeading, qualifiersValue);
    details.appendChild(qualifiers);
  }

  const content = document.createElement('div');
  content.className = 'results-row-content';
  content.append(header, details);

  li.append(imageDiv, content);
  return li;
}

function renderResultsList(applications, listEl) {
  listEl.innerHTML = '';
  applications.forEach((app, index) => {
    // First 3 rows eager: LCP measurements showed the actual largest-image
    // row varies by search result (not reliably row 0), so widening the
    // eager window covers more of the likely candidates. Still only a partial
    // fix -- these are unoptimized full-resolution primaries (no
    // `productThumbnails` from the list endpoint), so this removes the
    // `loading="lazy"` discovery delay but not the download time itself.
    listEl.appendChild(buildListRow(app, { eager: index < 3 }));
  });
}

const GRID_COLUMNS = [
  { key: 'sub_model', label: 'Submodel' },
  { key: 'drive', label: 'Drivewheel' },
  { key: 'engine_base_value', label: 'Engine Base' },
  { key: 'engine_vin', label: 'Engine VIN' },
  { key: 'position', label: 'Position' },
  { key: 'designation', label: 'Designation' },
  { key: 'additional_fit_criteria', label: 'Qualifiers' },
];

const GRID_COLUMN_WIDTHS = {
  image: '64px',
  part: '140px',
  sub_model: '100px',
  drive: '100px',
  engine_base_value: '170px',
  engine_vin: '110px',
  position: '90px',
  designation: '110px',
  qty: '75px',
  wtb: '46px',
};

function gridCellText(app, key) {
  const value = app[key];
  if (value == null || value === '') return '—';
  if (typeof value === 'object') return value.value ?? '—';
  return String(value);
}

const productDetailCache = new Map();

// Cached per part-number+brand so repeated "Quick Details" clicks don't re-fetch.
async function fetchProductDetail(app) {
  const cacheKey = `${app.brand}:${app.part_number}`;
  if (productDetailCache.has(cacheKey)) return productDetailCache.get(cacheKey);
  const promise = fetchJson(buildCatalogUrl('api.catalog.product', {
    part_number: app.part_number,
    brand_code: app.brand,
    brand_codes: app.brand,
    lite: 'true',
  }));
  productDetailCache.set(cacheKey, promise);
  return promise;
}

function buildFeaturesTab(product, app, brandLogoMap) {
  const wrap = document.createElement('div');
  wrap.className = 'results-quick-details-features';

  const brandName = app.brand_name || app.wtb_brand_name || '';
  const logoUrl = brandLogoUrl(brandName, brandLogoMap);
  if (logoUrl) {
    wrap.appendChild(buildBrandLogo(brandName, logoUrl, 'results-quick-details-logo'));
  }

  const title = document.createElement('h3');
  title.className = 'results-quick-details-title';
  const brandLabel = app.sub_brand_name ? `${app.part_type} - ${app.sub_brand_name}` : app.part_type;
  title.textContent = brandLabel || product.title || '';
  wrap.appendChild(title);

  const [marketing] = getDescriptionContents(product, 'MKT');
  if (marketing) {
    const p = document.createElement('p');
    p.className = 'results-quick-details-marketing';
    p.textContent = marketing;
    wrap.appendChild(p);
  }

  const features = getDescriptionContents(product, 'FAB');
  if (features.length) {
    const list = document.createElement('ul');
    list.className = 'results-quick-details-feature-list';
    features.forEach((feature) => {
      const li = document.createElement('li');
      li.textContent = feature;
      list.appendChild(li);
    });
    wrap.appendChild(list);
  }

  return wrap;
}

function buildSpecificationsTab(product) {
  const wrap = document.createElement('div');
  wrap.className = 'results-quick-details-specs';
  const attrs = product.part_attributes || [];
  if (!attrs.length) {
    const empty = document.createElement('p');
    empty.textContent = 'No specifications available.';
    wrap.appendChild(empty);
    return wrap;
  }
  const table = document.createElement('table');
  const tbody = document.createElement('tbody');
  attrs.forEach((attr) => {
    const tr = document.createElement('tr');
    const th = document.createElement('th');
    th.className = 'results-quick-details-spec-label';
    th.textContent = attr.attribute;
    const td = document.createElement('td');
    td.className = 'results-quick-details-spec-value';
    td.textContent = attr.attribute_value;
    tr.append(th, td);
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  wrap.appendChild(table);
  return wrap;
}

function buildQuickDetailsPanel(product, app, onClose, brandLogoMap) {
  const panel = document.createElement('div');
  panel.className = 'results-quick-details';
  const uid = `qd-${Math.random().toString(36).slice(2, 8)}`;

  const chrome = document.createElement('div');
  chrome.className = 'results-quick-details-tabs';

  const tabList = document.createElement('div');
  tabList.className = 'results-quick-details-tablist';

  const featuresTabBtn = document.createElement('button');
  featuresTabBtn.type = 'button';
  featuresTabBtn.className = 'results-quick-details-tab';
  featuresTabBtn.id = `${uid}-features-tab`;
  featuresTabBtn.textContent = 'Features';

  const specsTabBtn = document.createElement('button');
  specsTabBtn.type = 'button';
  specsTabBtn.className = 'results-quick-details-tab';
  specsTabBtn.id = `${uid}-specs-tab`;
  specsTabBtn.textContent = 'Specifications';

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'results-quick-details-close';
  closeBtn.setAttribute('aria-label', 'Close quick details');
  closeBtn.textContent = '×';
  closeBtn.addEventListener('click', onClose);

  tabList.append(featuresTabBtn, specsTabBtn);
  chrome.append(tabList, closeBtn);

  const featuresPanel = buildFeaturesTab(product, app, brandLogoMap);
  featuresPanel.id = `${uid}-features-panel`;
  const specsPanel = buildSpecificationsTab(product);
  specsPanel.id = `${uid}-specs-panel`;

  wireTabGroup(tabList, [
    { tab: featuresTabBtn, panel: featuresPanel },
    { tab: specsTabBtn, panel: specsPanel },
  ], 'Quick details');

  panel.append(chrome, featuresPanel, specsPanel);
  return panel;
}

function buildGridRow(app, colCount, brandLogoMap) {
  const row = document.createElement('tr');
  row.className = 'results-grid-row';

  const imageCell = document.createElement('td');
  imageCell.className = 'results-grid-image-cell';
  const imageUrl = resolveThumbnailUrl(app.dam_assets);
  if (imageUrl) {
    const img = document.createElement('img');
    img.src = imageUrl;
    img.alt = app.part_name || '';
    img.loading = 'lazy';
    imageCell.appendChild(img);
  }
  row.appendChild(imageCell);

  const partCell = document.createElement('td');
  partCell.className = 'results-grid-part-cell';
  const href = buildPartDetailsUrl({
    brandCode: app.brand,
    partNumber: app.part_number,
    partName: app.part_name,
  });
  const partLink = document.createElement('a');
  partLink.href = href;
  partLink.className = 'results-grid-part-number';
  partLink.textContent = app.part_number;
  const detailsBtn = document.createElement('button');
  detailsBtn.type = 'button';
  detailsBtn.className = 'results-grid-quick-details-toggle';
  detailsBtn.setAttribute('aria-expanded', 'false');
  const detailsIcon = document.createElement('span');
  detailsIcon.className = 'results-grid-quick-details-icon';
  detailsIcon.setAttribute('aria-hidden', 'true');
  detailsIcon.textContent = '☰';
  const detailsText = document.createElement('span');
  detailsText.textContent = 'Quick Details';
  detailsBtn.append(detailsIcon, detailsText);
  const partCellInner = document.createElement('div');
  partCellInner.className = 'results-grid-part-cell-inner';
  partCellInner.append(partLink, detailsBtn);
  partCell.appendChild(partCellInner);
  row.appendChild(partCell);

  GRID_COLUMNS.forEach(({ key }) => {
    const td = document.createElement('td');
    td.textContent = gridCellText(app, key);
    row.appendChild(td);
  });

  const qtyCell = document.createElement('td');
  qtyCell.textContent = app.qty ?? '—';
  row.appendChild(qtyCell);

  const wtbCell = document.createElement('td');
  const wtbLink = document.createElement('a');
  wtbLink.href = whereToBuyUrl('store', app.brand_name || app.wtb_brand_name || '');
  wtbLink.className = 'results-grid-wtb';
  wtbLink.setAttribute('aria-label', 'Where to buy');
  wtbLink.innerHTML = '<svg viewBox="0 0 20 20" width="12" height="12" aria-hidden="true"><path d="M10 1c-3.3 0-6 2.7-6 6 0 4.5 6 12 6 12s6-7.5 6-12c0-3.3-2.7-6-6-6zm0 8.5A2.5 2.5 0 1 1 10 4.5a2.5 2.5 0 0 1 0 5z" fill="currentColor"/></svg>';
  wtbCell.appendChild(wtbLink);
  row.appendChild(wtbCell);

  let detailsRow = null;
  detailsBtn.addEventListener('click', async () => {
    if (detailsRow) {
      detailsRow.remove();
      detailsRow = null;
      detailsBtn.setAttribute('aria-expanded', 'false');
      return;
    }
    detailsBtn.setAttribute('aria-expanded', 'true');
    detailsRow = document.createElement('tr');
    detailsRow.className = 'results-grid-details-row';
    const td = document.createElement('td');
    td.className = 'results-grid-details-cell';
    td.colSpan = colCount;
    td.textContent = 'Loading…';
    const toggleRect = detailsBtn.getBoundingClientRect();
    const rowLeft = row.getBoundingClientRect().left;
    const toggleCenter = (toggleRect.left + toggleRect.width / 2) - rowLeft;
    td.style.setProperty('--details-arrow-left', `${toggleCenter}px`);
    detailsRow.appendChild(td);
    row.insertAdjacentElement('afterend', detailsRow);

    const result = await fetchProductDetail(app);
    if (!detailsRow) return;
    if (!result.ok) {
      td.textContent = 'Failed to load details.';
      return;
    }
    td.textContent = '';
    td.appendChild(buildQuickDetailsPanel(result.data, app, () => {
      detailsRow.remove();
      detailsRow = null;
      detailsBtn.setAttribute('aria-expanded', 'false');
    }, brandLogoMap));
  });

  return row;
}

const GRID_COL_COUNT = GRID_COLUMNS.length + 4; // image + part + qty + where-to-buy

function buildGridColgroup() {
  const colgroup = document.createElement('colgroup');
  const order = [
    'image', 'part',
    ...GRID_COLUMNS.map((c) => c.key),
    'qty', 'wtb',
  ];
  order.forEach((key) => {
    const col = document.createElement('col');
    const width = GRID_COLUMN_WIDTHS[key];
    if (width) col.style.width = width;
    colgroup.appendChild(col);
  });
  return colgroup;
}

function buildGridColumnHeaderRow() {
  const headRow = document.createElement('tr');
  headRow.className = 'results-grid-columns-row';
  ['', 'Part', ...GRID_COLUMNS.map((c) => c.label), 'Veh. Qty', ''].forEach((label, i) => {
    const th = document.createElement('th');
    if (i === 0) {
      th.innerHTML = '<svg class="results-grid-image-header-icon" viewBox="0 0 20 20" width="14" height="14" aria-hidden="true"><path d="M17 3H3c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 12H3V5h14v10z" fill="currentColor"/><circle cx="6.5" cy="8.5" r="1.5" fill="currentColor"/><path d="M5 13l3-3 2 2 4-4 4 4v1H5z" fill="currentColor"/></svg>';
    } else {
      th.textContent = label;
    }
    headRow.appendChild(th);
  });
  return headRow;
}

function buildGridPartTypeGroupRow(partTypeEntry) {
  const groupRow = document.createElement('tr');
  groupRow.className = 'results-grid-part-type-row';
  const groupCell = document.createElement('td');
  groupCell.colSpan = GRID_COL_COUNT;
  const label = document.createElement('span');
  label.textContent = partTypeEntry.part_type_value;
  groupCell.appendChild(label);
  groupRow.appendChild(groupCell);
  return groupRow;
}

// One `<table>` per brand (shared across its part types) so column widths stay
// aligned down the page instead of drifting independently per part type.
function buildGridBrandSection(brandEntry, brandLogoMap) {
  const section = document.createElement('div');
  section.className = 'results-grid-brand';

  const header = document.createElement('div');
  header.className = 'results-grid-brand-header';
  const logoUrl = brandLogoUrl(brandEntry.brand, brandLogoMap);
  header.appendChild(buildBrandLogo(brandEntry.brand, logoUrl));
  section.appendChild(header);

  const table = document.createElement('table');
  table.className = 'results-grid-table';
  table.appendChild(buildGridColgroup());
  const tbody = document.createElement('tbody');
  (brandEntry.part_type_list || []).forEach((partType) => {
    tbody.appendChild(buildGridPartTypeGroupRow(partType));
    tbody.appendChild(buildGridColumnHeaderRow());
    const parts = partType.parts_list || [];
    parts.forEach((app, i) => {
      const gridRow = buildGridRow(app, GRID_COL_COUNT, brandLogoMap);
      if (i === parts.length - 1) gridRow.classList.add('is-last-in-group');
      tbody.appendChild(gridRow);
    });
  });
  table.appendChild(tbody);
  section.appendChild(table);

  return section;
}

async function renderGroupedResults(brandApplicationList, containerEl) {
  const brandLogoMap = await fetchBrandLogoMap();
  containerEl.innerHTML = '';
  brandApplicationList.forEach((brandEntry) => {
    containerEl.appendChild(buildGridBrandSection(brandEntry, brandLogoMap));
  });
}

function buildPaginationControl(page, totalPages, onPageChange) {
  const nav = document.createElement('div');
  nav.className = 'results-pagination';

  const pageLabel = document.createElement('span');
  pageLabel.className = 'results-pagination-text';
  pageLabel.textContent = 'Page';

  const pageInput = document.createElement('input');
  pageInput.type = 'text';
  pageInput.inputMode = 'numeric';
  pageInput.className = 'results-pagination-input';
  pageInput.value = String(page);
  pageInput.setAttribute('aria-label', 'Page number');
  const commitPage = () => {
    const next = parseInt(pageInput.value, 10);
    if (Number.isNaN(next) || next < 1 || next > totalPages || next === page) {
      pageInput.value = String(page);
      return;
    }
    onPageChange(next);
  };
  pageInput.addEventListener('change', commitPage);
  pageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') pageInput.blur();
  });

  const ofLabel = document.createElement('span');
  ofLabel.className = 'results-pagination-text';
  ofLabel.textContent = `of ${totalPages}`;

  const prevBtn = document.createElement('button');
  prevBtn.type = 'button';
  prevBtn.className = 'results-pagination-prev';
  prevBtn.setAttribute('aria-label', 'Previous page');
  prevBtn.textContent = '‹';
  prevBtn.disabled = page <= 1;
  prevBtn.addEventListener('click', () => onPageChange(page - 1));

  const nextBtn = document.createElement('button');
  nextBtn.type = 'button';
  nextBtn.className = 'results-pagination-next';
  nextBtn.setAttribute('aria-label', 'Next page');
  nextBtn.textContent = '›';
  nextBtn.disabled = page >= totalPages;
  nextBtn.addEventListener('click', () => onPageChange(page + 1));

  nav.append(pageLabel, pageInput, ofLabel, prevBtn, nextBtn);
  return nav;
}

// Re-fetches with a different `view_type` param.
function buildViewModeToggle(viewType, onChange) {
  const wrap = document.createElement('div');
  wrap.className = 'results-view-modes';

  const label = document.createElement('span');
  label.className = 'results-view-modes-label';
  label.textContent = 'View Mode:';
  wrap.appendChild(label);

  [
    { value: 'list', label: 'List view', icon: '☰' },
    { value: 'grid', label: 'Grid view', icon: '⊞' },
  ].forEach(({ value, label: ariaLabel, icon }) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'results-view-mode-btn';
    btn.classList.toggle('is-active', viewType === value);
    btn.setAttribute('aria-label', ariaLabel);
    btn.textContent = icon;
    btn.addEventListener('click', () => onChange(value));
    wrap.appendChild(btn);
  });

  return wrap;
}

function buildResultsToolbarRow(totalCount, page, totalPages, onPageChange, viewModeToggle) {
  const row = document.createElement('div');
  row.className = 'results-toolbar-row';

  const countEl = document.createElement('h2');
  countEl.className = 'results-count';
  countEl.textContent = `${totalCount} Part Result${totalCount !== 1 ? 's' : ''}`;
  row.appendChild(countEl);

  const right = document.createElement('div');
  right.className = 'results-toolbar-row-right';
  if (viewModeToggle) right.appendChild(viewModeToggle);
  if (totalPages > 1) {
    right.appendChild(buildPaginationControl(page, totalPages, onPageChange));
  }
  row.appendChild(right);

  return { row, countEl };
}

// Part-number search result card: different layout from the vehicle-search row
// (150x150 image, no Application Criteria, two grey CTAs).
function buildPartSearchRow(product) {
  const li = document.createElement('li');
  li.className = 'results-partsearch-row';

  const imageUrl = resolveThumbnailUrl(product.dam_assets);
  const imageDiv = buildProductImage('results-partsearch-image', imageUrl, product.part_name);

  const href = buildPartDetailsUrl({
    brandCode: product.brand,
    partNumber: product.part_number,
    partName: product.part_name,
  });
  const brandName = product.brand_name || product.wtb_brand_name || '';
  const brandLabel = product.sub_brand_name ? `${brandName} - ${product.sub_brand_name}` : brandName;

  const subheading = document.createElement('p');
  subheading.className = 'results-partsearch-subheading';
  const partNumberLink = document.createElement('a');
  partNumberLink.href = href;
  partNumberLink.textContent = product.part_number;
  subheading.append('Part No: ', partNumberLink, ` | ${brandLabel}`);

  const title = document.createElement('p');
  title.className = 'results-partsearch-title';
  const titleLink = document.createElement('a');
  titleLink.href = href;
  titleLink.textContent = product.part_type || product.part_name || '';
  title.appendChild(titleLink);

  const nameBlock = document.createElement('div');
  nameBlock.className = 'results-partsearch-name';
  nameBlock.append(subheading, title);

  const installBtn = document.createElement('a');
  installBtn.className = 'results-partsearch-cta-btn';
  installBtn.href = whereToBuyUrl('install', product.brand_name || '');
  installBtn.textContent = 'Get It Installed';

  const buyBtn = document.createElement('a');
  buyBtn.className = 'results-partsearch-cta-btn';
  buyBtn.href = whereToBuyUrl('store', product.brand_name || '');
  buyBtn.textContent = 'Buy In Store';

  const ctaWrap = document.createElement('div');
  ctaWrap.className = 'results-partsearch-cta';
  ctaWrap.append(installBtn, buyBtn);

  const content = document.createElement('div');
  content.className = 'results-partsearch-content';
  content.append(nameBlock, ctaWrap);

  li.append(imageDiv, content);
  return li;
}

function buildPartSearchList(products) {
  const listEl = document.createElement('ul');
  listEl.className = 'results-partsearch-list';
  products.forEach((product) => listEl.appendChild(buildPartSearchRow(product)));
  return listEl;
}

function buildInterchangeRow(item) {
  const tr = document.createElement('tr');

  const mfrCell = document.createElement('td');
  mfrCell.textContent = item.brand_name || '';

  const partNumberCell = document.createElement('td');
  partNumberCell.textContent = item.part_number || '';

  const ownCell = document.createElement('td');
  const ownLink = document.createElement('a');
  ownLink.href = buildPartDetailsUrl({
    brandCode: item.own_brand_code,
    partNumber: item.own_part_number,
    partName: item.own_part_type,
  });
  ownLink.textContent = item.own_part_number || '';
  ownCell.appendChild(ownLink);

  const typeCell = document.createElement('td');
  typeCell.textContent = item.own_part_type || '';

  const notesCell = document.createElement('td');

  tr.append(mfrCell, partNumberCell, ownCell, typeCell, notesCell);
  return tr;
}

function buildInterchangeTable(interchangeProducts) {
  const table = document.createElement('table');
  table.className = 'results-interchange-table';

  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  ['Manufacturer', 'Part Number', 'Our Part Number', 'Product Type', 'Notes'].forEach((label) => {
    const th = document.createElement('th');
    th.textContent = label;
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);

  const tbody = document.createElement('tbody');
  interchangeProducts.forEach((item) => tbody.appendChild(buildInterchangeRow(item)));

  table.append(thead, tbody);
  return table;
}

// A part number can match both the brand's own product ("Our Parts") and a
// competitor's crossref ("Interchange") at once; the tab bar always shows.
function buildPartNumberResultsView(products, interchangeProducts) {
  const wrapper = document.createElement('div');
  wrapper.className = 'results-part-number';
  const uid = `pn-${Math.random().toString(36).slice(2, 8)}`;

  const sections = [];
  if (products.length) {
    sections.push({ label: `Our Parts (${products.length})`, build: () => buildPartSearchList(products) });
  }
  if (interchangeProducts.length) {
    sections.push({
      label: `Interchange (${interchangeProducts.length})`,
      build: () => buildInterchangeTable(interchangeProducts),
    });
  }

  const tabList = document.createElement('div');
  tabList.className = 'results-part-number-tabs';
  const panels = document.createElement('div');
  const entries = sections.map((section, index) => {
    const tabBtn = document.createElement('button');
    tabBtn.type = 'button';
    tabBtn.className = 'results-part-number-tab';
    tabBtn.id = `${uid}-tab-${index}`;
    tabBtn.textContent = section.label;
    const panel = section.build();
    panel.id = `${uid}-panel-${index}`;
    tabList.appendChild(tabBtn);
    panels.appendChild(panel);
    return { tab: tabBtn, panel };
  });
  wireTabGroup(tabList, entries, 'Part number results');
  wrapper.append(tabList, panels);
  return wrapper;
}

function buildFacetCheckboxItem({
  value,
  label,
  checked,
  disabled,
  onChange,
}) {
  const item = document.createElement('li');
  item.className = 'results-facet-item';
  const isUnavailable = Boolean(disabled) && !checked;
  item.classList.toggle('is-unavailable', isUnavailable);
  const itemLabel = document.createElement('label');
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.value = value;
  checkbox.checked = checked;
  checkbox.disabled = isUnavailable;
  checkbox.addEventListener('change', () => onChange(checkbox.checked));
  const labelText = document.createElement('span');
  labelText.className = 'results-facet-item-label';
  labelText.textContent = label;
  itemLabel.append(checkbox, labelText);
  item.appendChild(itemLabel);
  return { item, checkbox };
}

// Nested facet accordion. `items` are `{ value, label, children? }`; `childMode`
// is 'set' for a flat shared Set or 'map' for a Map of Sets keyed by parent value.
function buildAccordion(label, items, {
  stateSet,
  childState,
  childMode = 'set',
  expanded,
  onFilterChange,
  isAvailable = () => true,
  isChildAvailable = () => true,
  searchable = false,
  openOverride,
  onToggle,
}) {
  const group = document.createElement('div');
  group.className = 'results-facet-group';

  const hasSelection = [...stateSet].some((value) => items.some((item) => item.value === value))
    || (childMode === 'set' && childState?.size > 0)
    || (childMode === 'map' && [...(childState?.values() || [])].some((set) => set.size > 0));

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'results-facet-toggle';
  const toggleText = document.createElement('span');
  toggleText.textContent = label;
  const toggleIcon = document.createElement('span');
  toggleIcon.className = 'results-facet-icon';
  const open = openOverride !== undefined ? openOverride : (expanded || hasSelection);
  toggleIcon.textContent = open ? '−' : '+';
  toggleIcon.setAttribute('aria-hidden', 'true');
  toggle.setAttribute('aria-expanded', String(open));
  toggle.append(toggleText, toggleIcon);

  let searchInput = null;
  if (searchable) {
    searchInput = document.createElement('input');
    searchInput.type = 'search';
    searchInput.className = 'results-facet-search';
    searchInput.placeholder = 'Filter';
    searchInput.setAttribute('aria-label', `Filter ${label} options`);
    searchInput.hidden = !open;
  }

  const list = document.createElement('ul');
  list.className = 'results-facet-list';
  list.hidden = !open;

  const searchEntries = [];

  items.forEach(({ value, label: itemLabel, children }) => {
    let subList = null;

    const { item, checkbox } = buildFacetCheckboxItem({
      value,
      label: itemLabel,
      checked: stateSet.has(value),
      disabled: !isAvailable(value),
      onChange: (checked) => {
        if (checked) stateSet.add(value);
        else {
          stateSet.delete(value);
          if (childMode === 'set' && children?.length) {
            children.forEach((child) => childState.delete(child.value));
          } else if (childMode === 'map') {
            childState.delete(value);
          }
        }
        if (subList) {
          subList.hidden = !checked;
          if (!checked) {
            subList.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
              cb.checked = false;
            });
          }
        }
        onFilterChange();
      },
    });

    if (children?.length) {
      subList = document.createElement('ul');
      subList.className = 'results-facet-sublist';
      subList.hidden = !checkbox.checked;

      children.forEach((child) => {
        const childChecked = childMode === 'map'
          ? Boolean(childState.get(value)?.has(child.value))
          : childState.has(child.value);

        const childItem = buildFacetCheckboxItem({
          value: child.value,
          label: child.label,
          checked: childChecked,
          disabled: !isChildAvailable(value, child.value),
          onChange: (checked) => {
            if (childMode === 'map') {
              let set = childState.get(value);
              if (!set) {
                set = new Set();
                childState.set(value, set);
              }
              if (checked) {
                set.add(child.value);
                stateSet.add(value);
                checkbox.checked = true;
                subList.hidden = false;
              } else {
                set.delete(child.value);
                if (!set.size) childState.delete(value);
              }
            } else if (checked) {
              childState.add(child.value);
              stateSet.add(value);
              checkbox.checked = true;
              subList.hidden = false;
            } else {
              childState.delete(child.value);
            }
            onFilterChange();
          },
        });
        subList.appendChild(childItem.item);
      });

      item.appendChild(subList);
    }
    list.appendChild(item);
    searchEntries.push({
      el: item,
      text: [itemLabel, ...(children || []).map((child) => child.label)].join(' ').toLowerCase(),
    });
  });

  if (searchInput) {
    searchInput.addEventListener('input', () => {
      const query = searchInput.value.trim().toLowerCase();
      searchEntries.forEach(({ el, text }) => {
        el.hidden = Boolean(query) && !text.includes(query);
      });
    });
  }

  toggle.addEventListener('click', () => {
    const nowOpen = list.hidden;
    list.hidden = !nowOpen;
    if (searchInput) searchInput.hidden = !nowOpen;
    toggleIcon.textContent = nowOpen ? '−' : '+';
    toggle.setAttribute('aria-expanded', String(nowOpen));
    onToggle?.(nowOpen);
  });

  group.append(toggle, ...(searchInput ? [searchInput] : []), list);
  return group;
}

function mapBrandFacetItems(brands) {
  return (brands || []).map((brand) => ({
    value: String(brand.code),
    label: brand.name,
    children: (brand.sub_brands || []).map((sub) => ({
      value: String(sub.code),
      label: sub.name,
    })),
  }));
}

function mapCategoryFacetItems(categories) {
  return (categories || []).map((category) => ({
    value: String(category.id),
    label: category.value,
    children: (category.sub_categories || []).map((sub) => ({
      value: String(sub.id),
      label: sub.value,
    })),
  }));
}

function mapPartTypeFacetItems(partTypePositions) {
  return (partTypePositions || [])
    .filter((entry) => entry.part_type?.id != null)
    .map((entry) => ({
      value: String(entry.part_type.id),
      label: entry.part_type.value,
      children: (entry.position || entry.positions || []).map((pos) => ({
        value: String(pos.id),
        label: pos.value,
      })),
    }));
}

function mapQualifierFacetItems(qualifiersGroup) {
  return (qualifiersGroup || [])
    .filter((entry) => entry?.qualifier_name && entry.qualifier_values?.length)
    .map((entry) => ({
      name: entry.qualifier_name,
      items: entry.qualifier_values.map((value) => ({
        value: String(value),
        label: String(value),
      })),
    }));
}

function getConfigStateSet(filterState, type) {
  let set = filterState.configs.get(type);
  if (!set) {
    set = new Set();
    filterState.configs.set(type, set);
  }
  return set;
}

function getActiveFilterGroups(filterState) {
  const groups = new Set();
  if (filterState.brands.size || filterState.subBrands.size) groups.add('brands');
  if (filterState.categories.size || filterState.subCategories.size) groups.add('categories');
  if (filterState.partTypes.size) groups.add('partTypes');
  if (filterState.qualifiers?.size) groups.add('qualifiers');
  filterState.configs.forEach((ids, type) => {
    if (ids.size) groups.add(`config:${type}`);
  });
  return groups;
}

// When exactly one facet group has an active filter, its own accordion shows
// every sibling as available; a second active group switches all to normal striking.
function getSoleActiveFilterGroup(filterState) {
  const groups = getActiveFilterGroups(filterState);
  return groups.size === 1 ? [...groups][0] : null;
}

// Which facet values are present in a given partslist response, for comparing
// against the master facet list to decide what accordions strike off.
function buildAvailabilityIndex(data) {
  const brands = new Set();
  const subBrands = new Set();
  (data.brands || []).forEach((brand) => {
    brands.add(String(brand.code));
    (brand.sub_brands || []).forEach((sub) => subBrands.add(String(sub.code)));
  });

  const categories = new Set();
  const subCategories = new Set();
  (data.category_tree?.categories || []).forEach((category) => {
    categories.add(String(category.id));
    (category.sub_categories || []).forEach((sub) => subCategories.add(String(sub.id)));
  });

  const configs = new Map();
  (data.configs?.sub_configs || []).forEach((config) => {
    if (!config?.type) return;
    configs.set(config.type, new Set((config.values || []).map((value) => String(value.id))));
  });

  const qualifiers = new Set();
  (data.qualifiers_group || []).forEach((group) => {
    (group.qualifier_values || []).forEach((value) => qualifiers.add(String(value)));
  });

  return {
    brands,
    subBrands,
    categories,
    subCategories,
    configs,
    qualifiers,
  };
}

// Maps part_type_id -> its category_id from the master response's category tree.
function buildPartTypeToCategoryMap(masterData) {
  const map = new Map();
  (masterData.category_tree?.categories || []).forEach((category) => {
    (category.sub_categories || []).forEach((sub) => {
      (sub.part_types || []).forEach((partType) => {
        map.set(String(partType.id), String(category.id));
      });
    });
  });
  return map;
}

// Checked categories/sub-categories, plus categories implied by checked part types.
function getEffectivePartTypeCategoryState(filterState, partTypeToCategory) {
  const categories = new Set(filterState.categories);
  filterState.partTypes.forEach((id) => {
    const categoryId = partTypeToCategory.get(id);
    if (categoryId) categories.add(categoryId);
  });
  return { categories, subCategories: filterState.subCategories };
}

function emptyFilterState() {
  return {
    brands: new Set(),
    subBrands: new Set(),
    categories: new Set(),
    subCategories: new Set(),
    partTypes: new Set(),
    positionsByPartType: new Map(),
    configs: new Map(),
    qualifiers: new Set(),
  };
}

async function fetchScopedPartlist(ancestorState, initial, masterData, cache) {
  const key = buildAdditionalFilters(ancestorState);
  if (!key) return masterData;
  if (cache.has(key)) return cache.get(key);
  const { endpoint, params } = buildPartsListRequest(initial);
  params.additional_filters = key;
  const result = await fetchJson(buildCatalogUrl(endpoint, params));
  const data = result.ok ? result.data : masterData;
  cache.set(key, data);
  return data;
}

// masterData = full facet options (never shrink); currentData = availability for striking.
async function buildFacetPanel(
  masterData,
  currentData,
  filterState,
  onFilterChange,
  openGroups,
  initial,
  partTypeMasterCache,
  { searchType } = {},
) {
  const openState = (key) => (openGroups.has(key) ? openGroups.get(key) : undefined);
  const onToggle = (key) => (isOpen) => openGroups.set(key, isOpen);

  const aside = document.createElement('aside');
  aside.className = 'results-facets';

  const header = document.createElement('div');
  header.className = 'results-facets-header';
  const headerLabel = document.createElement('p');
  headerLabel.className = 'results-facets-label';
  headerLabel.textContent = 'Refine Results';
  const clearBtn = document.createElement('button');
  clearBtn.type = 'button';
  clearBtn.className = 'button primary results-clear-filters';
  clearBtn.textContent = 'Clear Filters';
  header.append(headerLabel, clearBtn);
  aside.appendChild(header);

  const isEngine = searchType === 'heavy';
  const configDefs = isEngine
    ? []
    : (masterData.configs?.sub_configs || []).filter(
      (config) => config?.type && config?.name && config.values?.length,
    );

  // Panel order matters: groups at/above the deepest active filter get struck
  // off (kept, disabled); groups strictly below get removed outright.
  const GROUP_ORDER = [
    'brands',
    'categories',
    'partTypes',
    ...configDefs.map((config) => `config:${config.type}`),
    ...(isEngine ? ['qualifiers'] : []),
  ];
  const groupIndex = (key) => GROUP_ORDER.indexOf(key);
  const activeIndices = [...getActiveFilterGroups(filterState)]
    .map(groupIndex)
    .filter((index) => index !== -1);
  const maxActiveIndex = activeIndices.length ? Math.max(...activeIndices) : -1;
  const soleActiveGroup = getSoleActiveFilterGroup(filterState);

  function resolveMode(key) {
    if (maxActiveIndex === -1) return 'strike';
    if (key === soleActiveGroup) return 'exempt';
    return groupIndex(key) <= maxActiveIndex ? 'strike' : 'remove';
  }

  const availability = buildAvailabilityIndex(currentData);
  const alwaysAvailable = () => true;

  const brandMode = resolveMode('brands');
  const brandMasterItems = mapBrandFacetItems(masterData.brands);
  const brandItems = brandMode === 'remove'
    ? mapBrandFacetItems(currentData.brands)
    : brandMasterItems;
  if (brandItems.length) {
    const struck = brandMode === 'strike';
    aside.append(buildAccordion('Brand / Sub-Brand', brandItems, {
      stateSet: filterState.brands,
      childState: filterState.subBrands,
      childMode: 'set',
      expanded: false,
      onFilterChange,
      isAvailable: struck ? (value) => availability.brands.has(value) : alwaysAvailable,
      isChildAvailable: struck
        ? (parentValue, childValue) => availability.subBrands.has(childValue)
        : alwaysAvailable,
      openOverride: openState('brands'),
      onToggle: onToggle('brands'),
    }));
  }

  const categoryMode = resolveMode('categories');
  const categoryMasterItems = mapCategoryFacetItems(masterData.category_tree?.categories);
  const categoryItems = categoryMode === 'remove'
    ? mapCategoryFacetItems(currentData.category_tree?.categories)
    : categoryMasterItems;
  if (categoryItems.length) {
    const struck = categoryMode === 'strike';
    aside.append(buildAccordion('Product Category', categoryItems, {
      stateSet: filterState.categories,
      childState: filterState.subCategories,
      childMode: 'set',
      expanded: false,
      onFilterChange,
      isAvailable: struck ? (value) => availability.categories.has(value) : alwaysAvailable,
      isChildAvailable: struck
        ? (parentValue, childValue) => availability.subCategories.has(childValue)
        : alwaysAvailable,
      openOverride: openState('categories'),
      onToggle: onToggle('categories'),
    }));
  }

  // Part Types is always scoped by category (explicit or implied) for striking,
  // but only narrows the rendered list once Category/Sub-Category is checked.
  const partTypeToCategory = buildPartTypeToCategoryMap(masterData);
  const effectivePartTypeCategory = getEffectivePartTypeCategoryState(
    filterState,
    partTypeToCategory,
  );
  const hasExplicitCategory = filterState.categories.size > 0
    || filterState.subCategories.size > 0;

  const hasBrand = filterState.brands.size > 0 || filterState.subBrands.size > 0;
  const availabilityData = await fetchScopedPartlist(
    {
      ...emptyFilterState(),
      brands: filterState.brands,
      subBrands: filterState.subBrands,
      categories: effectivePartTypeCategory.categories,
      subCategories: effectivePartTypeCategory.subCategories,
      partTypes: hasBrand ? filterState.partTypes : new Set(),
      positionsByPartType: hasBrand ? filterState.positionsByPartType : new Map(),
    },
    initial,
    masterData,
    partTypeMasterCache,
  );
  const availablePartTypeIds = new Set(
    (availabilityData.category_tree?.part_type_positions || [])
      .map((entry) => (entry.part_type?.id == null ? null : String(entry.part_type.id)))
      .filter(Boolean),
  );

  let partTypeItems;
  if (hasExplicitCategory) {
    const categoryOnlyData = await fetchScopedPartlist(
      {
        ...emptyFilterState(),
        categories: effectivePartTypeCategory.categories,
        subCategories: effectivePartTypeCategory.subCategories,
      },
      initial,
      masterData,
      partTypeMasterCache,
    );
    partTypeItems = mapPartTypeFacetItems(categoryOnlyData.category_tree?.part_type_positions);
  } else {
    partTypeItems = mapPartTypeFacetItems(masterData.category_tree?.part_type_positions);
  }
  const partTypeIsAvailable = (value) => availablePartTypeIds.has(value);

  if (partTypeItems.length) {
    aside.append(buildAccordion('Part Types / Positions', partTypeItems, {
      stateSet: filterState.partTypes,
      childState: filterState.positionsByPartType,
      childMode: 'map',
      expanded: false,
      onFilterChange,
      isAvailable: partTypeIsAvailable,
      searchable: true,
      openOverride: openState('partTypes'),
      onToggle: onToggle('partTypes'),
    }));
  }

  configDefs.forEach((config) => {
    const mode = resolveMode(`config:${config.type}`);
    const values = mode === 'remove'
      ? (currentData.configs?.sub_configs || []).find((c) => c.type === config.type)?.values || []
      : config.values;
    const items = values.map((value) => ({
      value: String(value.id),
      label: value.value,
    }));
    if (!items.length) return;
    const struck = mode === 'strike';
    const key = `config:${config.type}`;
    aside.append(buildAccordion(config.name, items, {
      stateSet: getConfigStateSet(filterState, config.type),
      expanded: false,
      isAvailable: struck ? (value) => (
        availability.configs.get(config.type)?.has(value) ?? false
      ) : alwaysAvailable,
      onFilterChange,
      openOverride: openState(key),
      onToggle: onToggle(key),
    }));
  });

  if (isEngine) {
    const qualifierMode = resolveMode('qualifiers');
    const masterQualifierGroups = mapQualifierFacetItems(masterData.qualifiers_group);
    const qualifierGroups = qualifierMode === 'remove'
      ? mapQualifierFacetItems(currentData.qualifiers_group)
      : masterQualifierGroups;
    const struck = qualifierMode === 'strike';
    qualifierGroups.forEach((group) => {
      const key = `qualifier:${group.name}`;
      aside.append(buildAccordion(group.name, group.items, {
        stateSet: filterState.qualifiers,
        expanded: false,
        onFilterChange,
        isAvailable: struck ? (value) => availability.qualifiers.has(value) : alwaysAvailable,
        openOverride: openState(key),
        onToggle: onToggle(key),
      }));
    });
  }

  clearBtn.addEventListener('click', () => {
    clearFilterState(filterState);
    onFilterChange();
  });

  return aside;
}

export default async function decorate(block) {
  const sp = new URLSearchParams(window.location.search);
  const searchType = sp.get('searchType') || 'vehicle';
  const initial = {
    searchType,
    typeValue: readBracketParam(sp, 'type'),
    typeLabel: readBracketLabel(sp, 'type'),
    yearValue: readBracketParam(sp, 'year'),
    makeValue: readBracketParam(sp, 'make'),
    makeLabel: readBracketLabel(sp, 'make'),
    modelValue: readBracketParam(sp, 'model'),
    modelLabel: readBracketLabel(sp, 'model'),
    vehicleValue: readBracketParam(sp, 'vehicle'),
    vehicleLabel: readBracketLabel(sp, 'vehicle'),
    mfrValue: readBracketParam(sp, 'mfr'),
    mfrLabel: readBracketLabel(sp, 'mfr'),
    equipmentModelValue: readBracketParam(sp, 'equipmentModel'),
    equipmentModelLabel: readBracketLabel(sp, 'equipmentModel'),
    vehicleGroupIdsValue: readBracketParam(sp, 'vehicleGroupIds'),
    vehicleGroupIdsLabel: readBracketLabel(sp, 'vehicleGroupIds'),
    heavyMfrValue: readBracketParam(sp, 'heavyMfr'),
    heavyMfrLabel: readBracketLabel(sp, 'heavyMfr'),
    heavyBaseValue: readBracketParam(sp, 'heavyBase'),
    heavyBaseLabel: readBracketLabel(sp, 'heavyBase'),
    engineFilter: sp.get('engineFilter') || '',
    partValue: sp.get('part') || '',
    viewType: sp.get('viewType') || 'list',
  };

  const uid = `results-${Math.random().toString(36).slice(2, 8)}`;
  const toolbar = await buildToolbar(uid, initial);

  const contentWrapper = document.createElement('div');
  contentWrapper.className = 'results-content-wrapper';
  if (searchType === 'part-number-search') {
    contentWrapper.classList.add('results-content-wrapper-single-column');
  }

  const mainEl = document.createElement('div');
  mainEl.className = 'results-main';

  const loadingEl = document.createElement('div');
  loadingEl.className = 'results-loading';
  loadingEl.setAttribute('aria-live', 'polite');
  const spinner = document.createElement('span');
  spinner.className = 'results-spinner';
  spinner.setAttribute('aria-hidden', 'true');
  const loadingText = document.createElement('span');
  loadingText.textContent = 'Loading parts…';
  loadingEl.append(spinner, loadingText);

  const errorEl = document.createElement('div');
  errorEl.className = 'results-error';
  errorEl.hidden = true;
  const errorMsg = document.createElement('p');
  errorMsg.className = 'results-error-message';
  const retryBtn = document.createElement('button');
  retryBtn.type = 'button';
  retryBtn.className = 'button secondary results-retry-btn';
  retryBtn.textContent = 'Try Again';
  errorEl.append(errorMsg, retryBtn);

  const emptyEl = document.createElement('div');
  emptyEl.className = 'results-empty';
  emptyEl.hidden = true;
  const emptyMsg = document.createElement('p');
  if (searchType === 'heavy') {
    emptyMsg.textContent = 'No parts found for this engine.';
  } else if (searchType === 'part-number-search') {
    emptyMsg.textContent = 'We were unable to find a part using that number.';
  } else {
    emptyMsg.textContent = 'No parts found for this vehicle.';
  }
  emptyEl.appendChild(emptyMsg);

  const resultsEl = document.createElement('div');
  resultsEl.className = 'results-results';
  resultsEl.hidden = true;

  // Mobile/tablet "Filter results" toggle; wraps the facets `<aside>` (rebuilt on
  // every loadResults() call) so its expanded state survives those rebuilds.
  const facetsWrapper = document.createElement('div');
  facetsWrapper.className = 'results-facets-wrapper';
  const facetsToggle = document.createElement('button');
  facetsToggle.type = 'button';
  facetsToggle.className = 'results-facets-toggle';
  facetsToggle.setAttribute('aria-expanded', 'false');
  const facetsToggleLabel = document.createElement('span');
  facetsToggleLabel.textContent = 'Filter results';
  const facetsToggleIcon = document.createElement('span');
  facetsToggleIcon.className = 'results-facets-toggle-icon';
  facetsToggleIcon.textContent = '+';
  facetsToggleIcon.setAttribute('aria-hidden', 'true');
  facetsToggle.append(facetsToggleLabel, facetsToggleIcon);
  facetsToggle.addEventListener('click', () => {
    const expanded = facetsWrapper.classList.toggle('is-expanded');
    facetsToggle.setAttribute('aria-expanded', String(expanded));
    facetsToggleIcon.textContent = expanded ? '−' : '+';
  });
  const facetsBody = document.createElement('div');
  facetsBody.className = 'results-facets-body';
  facetsWrapper.append(facetsToggle, facetsBody);

  const topRowSlot = document.createElement('div');
  topRowSlot.className = 'results-top-row-slot';

  mainEl.append(loadingEl, errorEl, emptyEl, resultsEl);
  contentWrapper.append(topRowSlot, facetsWrapper, mainEl);

  // Visually hidden page <h1> so the document outline doesn't start at results-count.
  const pageTitle = document.createElement('h1');
  pageTitle.className = 'results-sr-only';
  const summary = buildToolbarSummaryText(initial);
  pageTitle.textContent = summary ? `Parts for ${summary}` : 'Parts search results';

  block.innerHTML = '';
  block.append(pageTitle, toolbar, contentWrapper);

  let searchValid;
  if (searchType === 'heavy') searchValid = isEngineSearch(initial);
  else if (searchType === 'part-number-search') searchValid = Boolean(initial.partValue);
  else searchValid = isEquipmentSearch(initial) || isYmmSearch(initial);

  if (searchType !== 'vehicle' && searchType !== 'heavy' && searchType !== 'part-number-search') {
    loadingEl.hidden = true;
    errorMsg.textContent = 'This search type is not supported yet. Try a Vehicle search above.';
    errorEl.hidden = false;
    return;
  }

  if (!searchValid) {
    loadingEl.hidden = true;
    errorMsg.textContent = 'Invalid search parameters.';
    errorEl.hidden = false;
    return;
  }

  if (searchType === 'part-number-search') {
    const loadPartNumberResults = async () => {
      loadingEl.hidden = false;
      errorEl.hidden = true;
      emptyEl.hidden = true;
      resultsEl.hidden = true;
      resultsEl.innerHTML = '';

      const url = buildCatalogUrl('api.catalog.partsearch', {
        part_number: initial.partValue,
        brand_codes: 'brands',
      });
      const result = await fetchJson(url);
      loadingEl.hidden = true;

      if (!result.ok) {
        errorMsg.textContent = 'Failed to load parts. Please try again.';
        errorEl.hidden = false;
        return;
      }

      const products = result.data.products || [];
      const interchangeProducts = result.data.interchange_products || [];

      if (!products.length && !interchangeProducts.length) {
        emptyEl.hidden = false;
        return;
      }

      resultsEl.append(buildPartNumberResultsView(products, interchangeProducts));
      resultsEl.hidden = false;
    };

    retryBtn.addEventListener('click', () => loadPartNumberResults());
    loadPartNumberResults();
    return;
  }

  const filterState = {
    brands: new Set(),
    subBrands: new Set(),
    categories: new Set(),
    subCategories: new Set(),
    partTypes: new Set(),
    positionsByPartType: new Map(),
    configs: new Map(),
    qualifiers: new Set(),
  };

  let loadSeq = 0;
  let currentPage = parseInt(sp.get('page'), 10) || 1;
  let masterFacetData = null;
  const openGroups = new Map();
  const partTypeMasterCache = new Map();

  async function loadResults({ soft = false } = {}) {
    loadSeq += 1;
    const seq = loadSeq;

    if (searchType === 'heavy' && !initial.engineFilter) {
      initial.engineFilter = await resolveEngineFilter(initial);
      if (seq !== loadSeq) return;
    }

    if (soft) {
      mainEl.classList.add('is-filtering');
      errorEl.hidden = true;
    } else {
      loadingEl.hidden = false;
      errorEl.hidden = true;
      emptyEl.hidden = true;
      resultsEl.hidden = true;
      resultsEl.innerHTML = '';
      topRowSlot.innerHTML = '';
      facetsBody.querySelector('.results-facets')?.remove();
    }

    const { endpoint, params } = buildPartsListRequest(initial, currentPage);
    const additionalFilters = buildAdditionalFilters(filterState);
    if (additionalFilters) params.additional_filters = additionalFilters;

    const result = await fetchJson(buildCatalogUrl(endpoint, params));

    if (seq !== loadSeq) return;

    loadingEl.hidden = true;
    mainEl.classList.remove('is-filtering');

    if (!result.ok) {
      if (!soft) {
        errorMsg.textContent = 'Failed to load parts. Please try again.';
        errorEl.hidden = false;
        resultsEl.hidden = true;
        topRowSlot.innerHTML = '';
        facetsBody.querySelector('.results-facets')?.remove();
      }
      return;
    }

    const { data } = result;
    if (!masterFacetData && !hasActiveFilters(filterState)) {
      masterFacetData = data;
    }

    const isGrid = initial.viewType === 'grid';
    const applications = data.application_list?.applications || [];
    const brandGroups = data.application_group_list?.brand_application_list || [];
    const totalCount = data.pagination?.total
      ?? data.pagination?.total_count
      ?? applications.length;
    const pageLimit = data.pagination?.limit || 50;
    const totalPages = Math.max(1, Math.ceil(totalCount / pageLimit));
    updatePageInUrl(currentPage, totalPages, { replace: seq === 1 });

    if (!totalCount && !hasActiveFilters(filterState)) {
      resultsEl.hidden = true;
      resultsEl.innerHTML = '';
      topRowSlot.innerHTML = '';
      emptyEl.hidden = false;
      facetsBody.querySelector('.results-facets')?.remove();
      return;
    }

    emptyEl.hidden = true;
    const onPageChange = (page) => {
      currentPage = page;
      loadResults({ soft: true });
    };
    const onViewTypeChange = (viewType) => {
      if (viewType === initial.viewType) return;
      initial.viewType = viewType;
      updateViewTypeInUrl(viewType);
      loadResults({ soft: true });
    };
    const viewModeToggle = buildViewModeToggle(initial.viewType, onViewTypeChange);

    let resultsBody;
    if (isGrid) {
      resultsBody = document.createElement('div');
      resultsBody.className = 'results-grid';
      await renderGroupedResults(brandGroups, resultsBody);
    } else {
      resultsBody = document.createElement('ul');
      resultsBody.className = 'results-list';
      renderResultsList(applications, resultsBody);
    }

    topRowSlot.innerHTML = '';
    topRowSlot.appendChild(
      buildResultsToolbarRow(totalCount, currentPage, totalPages, onPageChange, viewModeToggle).row,
    );

    resultsEl.innerHTML = '';
    resultsEl.append(resultsBody);
    if (totalPages > 1) {
      const { row } = buildResultsToolbarRow(totalCount, currentPage, totalPages, onPageChange);
      resultsEl.append(row);
    }
    resultsEl.hidden = false;

    const facetPanel = await buildFacetPanel(
      masterFacetData || data,
      data,
      filterState,
      () => {
        currentPage = 1;
        loadResults({ soft: true });
      },
      openGroups,
      initial,
      partTypeMasterCache,
      { searchType },
    );
    if (seq !== loadSeq) return;
    facetsBody.querySelector('.results-facets')?.remove();
    facetsBody.appendChild(facetPanel);
  }

  retryBtn.addEventListener('click', () => loadResults());
  window.addEventListener('popstate', () => {
    const page = parseInt(new URLSearchParams(window.location.search).get('page'), 10) || 1;
    if (page === currentPage) return;
    currentPage = page;
    loadResults({ soft: true });
  });
  loadResults();
}
